import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ADD_ONS, DEFAULT_OLIGO_PRICING } from "../src/lib/rate-schedule";
import { getRateSchedule, updateRateSchedule } from "../src/lib/pricing-store";
import { readPricingRecord } from "../src/lib/pricing-record";

loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  const row = await db.pricingSchedule.findUniqueOrThrow({ where: { id: "active" } });
  if (readPricingRecord(row.rates).format === 2) {
    console.log("Managed pricing already initialized; no prices or history changed.");
    return;
  }
  const current = await getRateSchedule(db);
  const input = { revision: current.revision, rates: current.rates, oligo: DEFAULT_OLIGO_PRICING, addOns: DEFAULT_ADD_ONS,
    reason: "Owner-confirmed Oligo pricing: <=60 bases $0.25/base; >60 bases $0.70/base. Add-on templates remain disabled with no price. Existing orders unchanged." };
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ dryRun: true, currentRevision: current.revision, oligo: input.oligo, disabledAddOns: input.addOns.map(item => item.name) }));
    console.log("Use --apply to save one audited revision. No orders or accounts are created.");
    return;
  }
  const updated = await updateRateSchedule(db, { id: "system:pricing-catalog-v2", name: "Owner-requested pricing configuration" }, input);
  console.log(JSON.stringify({ initialized: true, revision: updated.revision, oligo: updated.oligo, enabledAddOns: updated.addOns?.filter(item => item.active).length }));
}
main().catch(error => { console.error(error instanceof Error ? error.name : "Pricing initialization failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
