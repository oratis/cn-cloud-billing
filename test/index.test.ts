import { describe, it, expect } from "vitest";
import { assertMonth, BillingError, type BillingProvider, type BillRow } from "../src/types.js";
import { CnBilling } from "../src/index.js";

/** A fake provider so we can test orchestration without touching any cloud SDK. */
function fakeProvider(name: BillRow["provider"], amount: number): BillingProvider {
  return {
    name,
    async getMonthlySummary(month) {
      return [{ provider: name, month, product: `${name}-prod`, amount, currency: "CNY" }];
    },
    async getMonthlyDetail(month) {
      return [
        { provider: name, month, product: `${name}-prod`, region: "cn-x", resourceId: "r1", amount, currency: "CNY" },
      ];
    },
  };
}

/** Build a CnBilling with injected fake providers (bypasses real credentials/SDKs). */
function withFakes(...providers: BillingProvider[]): CnBilling {
  const c = new CnBilling({ aliyun: { accessKeyId: "x", accessKeySecret: "y" } });
  // @ts-expect-error — swap the real provider list for fakes in tests
  c.providers = providers;
  return c;
}

describe("assertMonth", () => {
  it("accepts YYYY-MM and rejects anything else", () => {
    expect(() => assertMonth("2026-05")).not.toThrow();
    expect(() => assertMonth("2026-13")).toThrow(/YYYY-MM/);
    expect(() => assertMonth("2026/05")).toThrow(/YYYY-MM/);
  });
});

describe("CnBilling", () => {
  it("requires at least one provider", () => {
    expect(() => new CnBilling({})).toThrow(/at least one/);
  });

  it("aggregates summaries across providers", async () => {
    const cn = withFakes(fakeProvider("aliyun", 10), fakeProvider("tencent", 20));
    const rows = await cn.getMonthlySummary("2026-05");
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(30);
    expect(rows.every((r) => r.month === "2026-05" && r.currency === "CNY")).toBe(true);
  });

  it("aggregates detail rows with region + resourceId", async () => {
    const cn = withFakes(fakeProvider("volcano", 5));
    const rows = await cn.getMonthlyDetail("2026-05");
    expect(rows[0]).toMatchObject({ provider: "volcano", region: "cn-x", resourceId: "r1" });
  });

  it("rejects the aggregate if any provider throws", async () => {
    const boom: BillingProvider = {
      name: "tencent",
      getMonthlySummary: async () => {
        throw new BillingError("nope", "tencent");
      },
      getMonthlyDetail: async () => [],
    };
    const cn = withFakes(fakeProvider("aliyun", 1), boom);
    await expect(cn.getMonthlySummary("2026-05")).rejects.toBeInstanceOf(BillingError);
  });

  it("provider() returns one cloud in isolation", async () => {
    const cn = withFakes(fakeProvider("aliyun", 7));
    expect(cn.provider("aliyun").name).toBe("aliyun");
    expect(() => cn.provider("tencent")).toThrow(/not configured/);
  });
});
