/** Supported cloud providers. */
export type Provider = "aliyun" | "tencent" | "volcano";

/**
 * One normalized bill line, unified across providers.
 *
 * `amount` is the provider's *payable / real* cost for the line (Aliyun
 * `PretaxAmount`, Tencent Σ`ComponentSet.RealCost`, Volcano `PayableAmount`)
 * in the account's settlement `currency` (typically `CNY`). No categorization,
 * tax reconstruction or business attribution is applied — you get the raw
 * numbers, normalized.
 */
export interface BillRow {
  provider: Provider;
  /** Billing month, `YYYY-MM`. */
  month: string;
  /** Product / business name as returned by the provider. */
  product: string;
  /** Region code or name, when available (detail queries only). */
  region?: string;
  /** Resource / instance id, when available (detail queries only). */
  resourceId?: string;
  /** Payable amount for this line, in `currency`. */
  amount: number;
  /** ISO-4217 currency code, e.g. `"CNY"`. */
  currency: string;
  /** The untouched provider line — only present when `includeRaw` is set. */
  raw?: unknown;
}

export interface QueryOptions {
  /** Attach the original provider payload to each row as `raw`. */
  includeRaw?: boolean;
}

/** A single provider's billing client. */
export interface BillingProvider {
  readonly name: Provider;
  /** Monthly totals grouped by product. */
  getMonthlySummary(month: string, options?: QueryOptions): Promise<BillRow[]>;
  /** Per-resource monthly detail (region + resource id when the API exposes them). */
  getMonthlyDetail(month: string, options?: QueryOptions): Promise<BillRow[]>;
}

export interface AliyunCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  /** Defaults to `business.aliyuncs.com`. */
  endpoint?: string;
}

export interface TencentCredentials {
  secretId: string;
  secretKey: string;
}

export interface VolcanoCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Defaults to `cn-north-1` (billing is a global service, signed with a region). */
  region?: string;
  /** Defaults to `open.volcengineapi.com`. */
  host?: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Throws unless `month` is a valid `YYYY-MM` string. */
export function assertMonth(month: string): void {
  if (!MONTH_RE.test(month)) {
    throw new Error(`cn-cloud-billing: month must be "YYYY-MM", got "${month}"`);
  }
}

/** Thrown when a provider API call fails. */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly provider: Provider,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BillingError";
  }
}
