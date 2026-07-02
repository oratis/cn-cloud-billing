/**
 * cn-cloud-billing — one typed API for **Alibaba Cloud, Tencent Cloud and
 * Volcano Engine** monthly bills.
 *
 * Bring your own access keys; get back normalized {@link BillRow}s — monthly
 * totals by product (`getMonthlySummary`) or per-resource detail with region
 * and resource id (`getMonthlyDetail`). Pagination and provider quirks
 * (Volcano `Total = -1`, `GroupPeriod`, Tencent `ComponentSet` summing,
 * Aliyun `NextToken`) are handled for you. No categorization or cost
 * attribution is imposed — just the numbers, normalized.
 *
 * @packageDocumentation
 */
import type {
  AliyunCredentials,
  BillingProvider,
  BillRow,
  Provider,
  QueryOptions,
  TencentCredentials,
  VolcanoCredentials,
} from "./types.js";
import { AliyunProvider } from "./providers/aliyun.js";
import { TencentProvider } from "./providers/tencent.js";
import { VolcanoProvider } from "./providers/volcano.js";

export * from "./types.js";
export { AliyunProvider } from "./providers/aliyun.js";
export { TencentProvider } from "./providers/tencent.js";
export { VolcanoProvider } from "./providers/volcano.js";

export interface CnBillingConfig {
  aliyun?: AliyunCredentials;
  tencent?: TencentCredentials;
  volcano?: VolcanoCredentials;
}

/**
 * Unified client over every configured provider. Aggregate methods query all
 * configured providers concurrently and concatenate their rows; if any
 * provider throws, the aggregate call rejects (use {@link CnBilling.provider}
 * to query one cloud in isolation).
 */
export class CnBilling {
  private readonly providers: BillingProvider[] = [];

  constructor(config: CnBillingConfig) {
    if (config.aliyun) this.providers.push(new AliyunProvider(config.aliyun));
    if (config.tencent) this.providers.push(new TencentProvider(config.tencent));
    if (config.volcano) this.providers.push(new VolcanoProvider(config.volcano));
    if (this.providers.length === 0) {
      throw new Error("cn-cloud-billing: configure at least one of aliyun / tencent / volcano");
    }
  }

  /** Names of the configured providers. */
  get providerNames(): Provider[] {
    return this.providers.map((p) => p.name);
  }

  /** Access a single configured provider (throws if it wasn't configured). */
  provider(name: Provider): BillingProvider {
    const p = this.providers.find((x) => x.name === name);
    if (!p) throw new Error(`cn-cloud-billing: provider "${name}" is not configured`);
    return p;
  }

  /** Monthly totals by product, across all configured providers. */
  async getMonthlySummary(month: string, options?: QueryOptions): Promise<BillRow[]> {
    const results = await Promise.all(this.providers.map((p) => p.getMonthlySummary(month, options)));
    return results.flat();
  }

  /** Per-resource monthly detail, across all configured providers. */
  async getMonthlyDetail(month: string, options?: QueryOptions): Promise<BillRow[]> {
    const results = await Promise.all(this.providers.map((p) => p.getMonthlyDetail(month, options)));
    return results.flat();
  }
}

export default CnBilling;
