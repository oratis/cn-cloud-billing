# cn-cloud-billing

[![npm version](https://img.shields.io/npm/v/cn-cloud-billing.svg)](https://www.npmjs.com/package/cn-cloud-billing)
[![CI](https://github.com/oratis/cn-cloud-billing/actions/workflows/ci.yml/badge.svg)](https://github.com/oratis/cn-cloud-billing/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/cn-cloud-billing.svg)](./LICENSE)

**One typed API for Alibaba Cloud, Tencent Cloud and Volcano Engine monthly bills.**

Each Chinese cloud ships its own billing API with different auth, shapes, pagination and quirks. `cn-cloud-billing` puts all three behind a single call and hands you **normalized rows** — monthly totals by product, or per-resource detail with region and resource id. Bring your own access keys; it imposes **no categorization or cost attribution** — just the numbers, normalized.

```bash
npm i cn-cloud-billing
```

## Quick start

```ts
import { CnBilling } from "cn-cloud-billing";

const billing = new CnBilling({
  aliyun:  { accessKeyId: process.env.ALI_AK!,   accessKeySecret: process.env.ALI_SK! },
  tencent: { secretId:    process.env.TC_ID!,    secretKey:       process.env.TC_KEY! },
  volcano: { accessKeyId: process.env.VOLC_AK!,  secretAccessKey: process.env.VOLC_SK! },
});

// Monthly totals by product, across all three clouds:
const summary = await billing.getMonthlySummary("2026-05");
// → [{ provider: "aliyun", month: "2026-05", product: "ECS", amount: 1234.5, currency: "CNY" }, ...]

// Per-resource detail (region + resourceId where the API exposes them):
const detail = await billing.getMonthlyDetail("2026-05");
// → [{ provider: "volcano", month: "2026-05", product: "GPU_Server",
//      region: "cn-beijing", resourceId: "i-abc…", amount: 88.0, currency: "CNY" }, ...]
```

Query one cloud in isolation:

```ts
const rows = await billing.provider("tencent").getMonthlyDetail("2026-05");
```

## Normalized shape

Every row is a [`BillRow`](./src/types.ts):

```ts
interface BillRow {
  provider: "aliyun" | "tencent" | "volcano";
  month: string;        // "YYYY-MM"
  product: string;      // provider's product / business name
  region?: string;      // detail only
  resourceId?: string;  // detail only
  amount: number;       // payable / real cost in `currency`
  currency: string;     // e.g. "CNY"
  raw?: unknown;        // original provider line, with { includeRaw: true }
}
```

`amount` maps to each provider's payable cost — Aliyun `PretaxAmount`, Tencent Σ`ComponentSet.RealCost`, Volcano `PayableAmount`.

## What it handles for you

- **Auth & signing** — official SDKs for Aliyun/Tencent; Volcano is driven through `@volcengine/openapi`'s signer (no maintained Node billing SDK exists).
- **Pagination** — Aliyun `NextToken`, Tencent `Offset`, Volcano `Offset` (including the case where Volcano returns `Total = -1` and you must stop on a short page).
- **Quirks** — Volcano detail needs `GroupPeriod = 1`; Tencent detail cost is the sum of a row's `ComponentSet`.

## Credentials

| Provider | Fields | Needs |
| --- | --- | --- |
| `aliyun` | `accessKeyId`, `accessKeySecret` | BssOpenApi read access |
| `tencent` | `secretId`, `secretKey` | `DescribeBillSummaryByProduct` / `DescribeBillDetail` |
| `volcano` | `accessKeyId`, `secretAccessKey` | `ListBillOverviewByProd` / `ListBillDetail` |

Configure only the clouds you use — pass one, two, or all three.

## Notes

- Amounts are in each account's **settlement currency** (typically `CNY`); this library does no FX conversion (pair it with [`monthly-fx`](https://www.npmjs.com/package/monthly-fx) if you need USD).
- This is an independent client and is not affiliated with Alibaba, Tencent or Volcano Engine.

## License

[MIT](./LICENSE) © [oratis](https://github.com/oratis)
