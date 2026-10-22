import assert from "node:assert/strict";
import test from "node:test";
import { blankOrder, blankSample } from "../src/lib/order-intake";
import { composeCustomerRates } from "../src/lib/customer-pricing";
import { DEFAULT_SCHEDULE, rateScheduleSchema } from "../src/lib/rate-schedule";
import { priceOrder, pricingSchema } from "../src/lib/pricing";
import { readSavedOrder } from "../src/lib/order-resume";

test("Customer fixed rates are calculated per reaction and recorded with their source", () => {
  const draft = blankOrder();
  draft.samples[0].reactions.push({ ...draft.samples[0].reactions[0] });
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "customer-A", revision: 2, overrides: { "sanger-standard-tubes": 400 } });
  const price = priceOrder(draft, schedule);
  assert.equal(price.subtotalCents, 800);
  assert.equal(price.lines[0].unitCents, 400);
  assert.equal(price.lines[0].customPrice, true);
  assert.equal(price.customerPricingRevision, 2);
  assert.equal(pricingSchema.parse(price).lines[0].customPrice, true);
  assert.equal(priceOrder(draft, DEFAULT_SCHEDULE).subtotalCents, 1100);
});

test("Whole Plasmid mixes customer and inherited size-band prices without changing older snapshots", () => {
  const draft = { ...blankOrder(), service: "WHOLE_PLASMID" as const, submissionMode: "Whole plasmid" as const, samples: [{ ...blankSample(), templateLength: "12000", reactions: [] }, { ...blankSample("S2"), templateLength: "12001", reactions: [] }] };
  const original = priceOrder(draft, DEFAULT_SCHEDULE);
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "customer-A", revision: 1, overrides: { "plasmid-tubes": 350 } });
  const price = priceOrder(draft, schedule);
  assert.equal(price.subtotalCents, 1850);
  assert.deepEqual(price.lines.map(line => [line.unitCents, !!line.customPrice]), [[350, true], [1500, false]]);
  assert.equal(pricingSchema.parse(original).subtotalCents, 2000);
  assert.equal(original.lines.some(line => line.customPrice), false);
});

test("Saved drafts keep the quoted customer revision and rates for comparison after sign-in", () => {
  const now = 1_800_000_000_000;
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "customer-A", revision: 4, overrides: { "sanger-standard-tubes": 0 } });
  const raw = JSON.stringify({ version: 1, savedAt: now, ownerId: "customer-A", draft: blankOrder(), pricingSchedule: schedule, priceNotice: "Review updated price" });
  const saved = readSavedOrder(raw, "Standard", "customer-A", now)!;
  assert.deepEqual(rateScheduleSchema.parse(saved.pricingSchedule), schedule);
  assert.equal(saved.priceNotice, "Review updated price");
  assert.equal(readSavedOrder(raw, "Standard", "customer-B", now), null);
});
