import tencentcloud from "tencentcloud-sdk-nodejs-billing";
import {
  type BillingProvider,
  type BillRow,
  type QueryOptions,
  type TencentCredentials,
  assertMonth,
  BillingError,
} from "../types.js";

const BillingClient = tencentcloud.billing.v20180709.Client;

interface SummaryItem {
  BusinessCodeName?: string;
  RealTotalCost?: string | number;
}
interface DetailItem {
  RegionId?: string;
  RegionName?: string;
  BusinessCodeName?: string;
  ResourceId?: string;
  ComponentSet?: Array<{ RealCost?: string | number }>;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v)) || 0;

/** Tencent Cloud billing (`billing.v20180709`), settlement currency CNY. */
export class TencentProvider implements BillingProvider {
  readonly name = "tencent" as const;
  private readonly client: InstanceType<typeof BillingClient>;

  constructor(credentials: TencentCredentials) {
    this.client = new BillingClient({
      credential: { secretId: credentials.secretId, secretKey: credentials.secretKey },
      region: "",
      profile: { httpProfile: { endpoint: "billing.tencentcloudapi.com" } },
    });
  }

  async getMonthlySummary(month: string, options: QueryOptions = {}): Promise<BillRow[]> {
    assertMonth(month);
    try {
      const resp = (await this.client.DescribeBillSummaryByProduct({
        BeginTime: month,
        EndTime: month,
      })) as { SummaryOverview?: SummaryItem[]; SummaryOverviewItem?: SummaryItem[] };
      const items = resp.SummaryOverview ?? resp.SummaryOverviewItem ?? [];
      return items.map((it) => ({
        provider: this.name,
        month,
        product: it.BusinessCodeName ?? "unknown",
        amount: num(it.RealTotalCost),
        currency: "CNY",
        ...(options.includeRaw ? { raw: it } : {}),
      }));
    } catch (e) {
      throw new BillingError(`tencent summary ${month} failed: ${String(e)}`, this.name, e);
    }
  }

  async getMonthlyDetail(month: string, options: QueryOptions = {}): Promise<BillRow[]> {
    assertMonth(month);
    const LIMIT = 100;
    const rows: BillRow[] = [];
    let offset = 0;
    try {
      for (;;) {
        const resp = (await this.client.DescribeBillDetail({
          Month: month,
          Offset: offset,
          Limit: LIMIT,
        })) as { DetailSet?: DetailItem[] };
        const page = resp.DetailSet ?? [];
        for (const d of page) {
          rows.push({
            provider: this.name,
            month,
            product: d.BusinessCodeName ?? "unknown",
            region: d.RegionName || d.RegionId || undefined,
            resourceId: d.ResourceId || undefined,
            amount: (d.ComponentSet ?? []).reduce((s, c) => s + num(c.RealCost), 0),
            currency: "CNY",
            ...(options.includeRaw ? { raw: d } : {}),
          });
        }
        if (page.length < LIMIT) break;
        offset += page.length;
      }
      return rows;
    } catch (e) {
      throw new BillingError(`tencent detail ${month} failed: ${String(e)}`, this.name, e);
    }
  }
}
