import DefaultBss, {
  QueryBillOverviewRequest,
  DescribeInstanceBillRequest,
} from "@alicloud/bssopenapi20171214";
import * as OpenApi from "@alicloud/openapi-client";

// @alicloud/bssopenapi20171214 is CJS transpiled from TS (`exports.default = Class` +
// `__esModule`), so under real ESM/CJS interop the Client lands on `.default` at runtime.
const BssClient = (DefaultBss as unknown as { default?: typeof DefaultBss }).default ?? DefaultBss;
import {
  type BillingProvider,
  type BillRow,
  type QueryOptions,
  type AliyunCredentials,
  assertMonth,
  BillingError,
} from "../types.js";

const num = (v: unknown): number => (v == null ? 0 : Number(v)) || 0;

/** Alibaba Cloud billing (BssOpenApi 2017-12-14), settlement currency CNY. */
export class AliyunProvider implements BillingProvider {
  readonly name = "aliyun" as const;
  private readonly client: InstanceType<typeof DefaultBss>;

  constructor(credentials: AliyunCredentials) {
    const config = new OpenApi.Config({
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
    });
    config.endpoint = credentials.endpoint ?? "business.aliyuncs.com";
    this.client = new BssClient(config);
  }

  async getMonthlySummary(month: string, options: QueryOptions = {}): Promise<BillRow[]> {
    assertMonth(month);
    try {
      const resp = await this.client.queryBillOverview(
        new QueryBillOverviewRequest({ billingCycle: month }),
      );
      const items = (resp.body?.data?.items?.item ?? []) as Array<Record<string, unknown>>;
      return items.map((it) => ({
        provider: this.name,
        month,
        product: String(it.productDetail ?? it.productName ?? "unknown"),
        amount: num(it.pretaxAmount),
        currency: String(it.currency ?? "CNY"),
        ...(options.includeRaw ? { raw: it } : {}),
      }));
    } catch (e) {
      throw new BillingError(`aliyun summary ${month} failed: ${String(e)}`, this.name, e);
    }
  }

  async getMonthlyDetail(month: string, options: QueryOptions = {}): Promise<BillRow[]> {
    assertMonth(month);
    const rows: BillRow[] = [];
    let nextToken: string | undefined;
    try {
      for (;;) {
        const resp = await this.client.describeInstanceBill(
          new DescribeInstanceBillRequest({
            billingCycle: month,
            granularity: "MONTHLY",
            maxResults: 300,
            nextToken,
          }),
        );
        const data = resp.body?.data as Record<string, unknown> | undefined;
        const items = (data?.items ?? []) as Array<Record<string, unknown>>;
        for (const it of items) {
          rows.push({
            provider: this.name,
            month,
            product: String(it.productDetail ?? it.productName ?? "unknown"),
            region: (it.region as string) || undefined,
            resourceId: (it.instanceID as string) || (it.instanceId as string) || undefined,
            amount: num(it.pretaxAmount),
            currency: String(it.currency ?? "CNY"),
            ...(options.includeRaw ? { raw: it } : {}),
          });
        }
        nextToken = (data?.nextToken as string) || undefined;
        if (!nextToken) break;
      }
      return rows;
    } catch (e) {
      throw new BillingError(`aliyun detail ${month} failed: ${String(e)}`, this.name, e);
    }
  }
}
