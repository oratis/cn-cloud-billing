import { Service } from "@volcengine/openapi";
import {
  type BillingProvider,
  type BillRow,
  type QueryOptions,
  type VolcanoCredentials,
  assertMonth,
  BillingError,
} from "../types.js";

const num = (v: unknown): number => (v == null ? 0 : Number(v)) || 0;

interface VolcRow {
  Product?: string;
  PayableAmount?: string | number;
  RegionCode?: string;
  Region?: string;
  InstanceNo?: string;
}
interface ListResult {
  List?: VolcRow[];
  Total?: number;
}

const BILLING_VERSION = "2022-01-01";

/**
 * Volcano Engine (Volcengine) billing. There is no dedicated Node billing SDK,
 * so this drives `@volcengine/openapi`'s generic signed request. Billing is a
 * global service signed against a region (default `cn-north-1`). Currency CNY.
 */
export class VolcanoProvider implements BillingProvider {
  readonly name = "volcano" as const;
  private readonly svc: Service;

  constructor(credentials: VolcanoCredentials) {
    this.svc = new Service({
      host: credentials.host ?? "open.volcengineapi.com",
      serviceName: "billing",
      region: credentials.region ?? "cn-north-1",
      accessKeyId: credentials.accessKeyId,
      secretKey: credentials.secretAccessKey,
      defaultVersion: BILLING_VERSION,
    });
  }

  /** One signed GET to a billing Action (params → query); returns the inner `{ List, Total }`. */
  private async call(action: string, query: Record<string, unknown>): Promise<ListResult> {
    const api = this.svc.createAPI<Record<string, unknown>, ListResult>(action, {
      method: "GET",
      Version: BILLING_VERSION,
    });
    const resp = await api(query);
    return resp.Result ?? {};
  }

  /**
   * Page a billing list Action. Volcano may return `Total = -1` (unknown), so
   * we stop on a short page rather than trusting `Total`.
   */
  private async paginate(action: string, extra: Record<string, unknown>): Promise<VolcRow[]> {
    const LIMIT = 100;
    const rows: VolcRow[] = [];
    let offset = 0;
    for (;;) {
      const res = await this.call(action, { Limit: LIMIT, Offset: offset, ...extra });
      const page = res.List ?? [];
      rows.push(...page);
      const total = num(res.Total);
      if (page.length < LIMIT || (total > 0 && offset + page.length >= total)) break;
      offset += page.length;
    }
    return rows;
  }

  async getMonthlySummary(month: string, options: QueryOptions = {}): Promise<BillRow[]> {
    assertMonth(month);
    try {
      const page = await this.paginate("ListBillOverviewByProd", { BillPeriod: month, GroupTerm: 0 });
      return page.map((x) => ({
        provider: this.name,
        month,
        product: x.Product ?? "unknown",
        amount: num(x.PayableAmount),
        currency: "CNY",
        ...(options.includeRaw ? { raw: x } : {}),
      }));
    } catch (e) {
      throw new BillingError(`volcano summary ${month} failed: ${String(e)}`, this.name, e);
    }
  }

  async getMonthlyDetail(month: string, options: QueryOptions = {}): Promise<BillRow[]> {
    assertMonth(month);
    try {
      const page = await this.paginate("ListBillDetail", {
        BillPeriod: month,
        GroupPeriod: 1,
        GroupTerm: 0,
      });
      return page.map((x) => ({
        provider: this.name,
        month,
        product: x.Product ?? "unknown",
        region: x.Region || x.RegionCode || undefined,
        resourceId: x.InstanceNo || undefined,
        amount: num(x.PayableAmount),
        currency: "CNY",
        ...(options.includeRaw ? { raw: x } : {}),
      }));
    } catch (e) {
      throw new BillingError(`volcano detail ${month} failed: ${String(e)}`, this.name, e);
    }
  }
}
