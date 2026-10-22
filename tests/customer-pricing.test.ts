import assert from "node:assert/strict";
import { test } from "node:test";
import { composeCustomerRates, customerPriceUpdateSchema, customerPricingSchema, sameCustomerOverrides } from "../src/lib/customer-pricing";
import { ACTIVE_RATE_ITEMS, DEFAULT_SCHEDULE, RATE_ITEMS, priceUpdateSchema } from "../src/lib/rate-schedule";
import { blankOrder } from "../src/lib/order-intake";
import { priceOrder } from "../src/lib/pricing";

test("customer rates inherit unspecified prices and preserve explicit zero prices", () => {
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "one", revision: 3, overrides: { "sanger-standard-tubes": 425, "plasmid-large-plate": 0 } });
  assert.equal(schedule.rates["sanger-standard-tubes"], 425);
  assert.equal(schedule.rates["plasmid-large-plate"], 0);
  assert.equal(schedule.rates["plasmid-tubes"], DEFAULT_SCHEDULE.rates["plasmid-tubes"]);
  assert.equal(schedule.customerId, "one");
  assert.equal(schedule.customerRevision, 3);
  assert.deepEqual(schedule.overriddenKeys, ["sanger-standard-tubes", "plasmid-large-plate"]);
  assert.equal(DEFAULT_SCHEDULE.rates["sanger-standard-tubes"], 550);
  const reset = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "one", revision: 4, overrides: {} });
  assert.deepEqual(reset.rates, DEFAULT_SCHEDULE.rates);
  assert.deepEqual(reset.overriddenKeys, []);
  assert.equal(reset.customerRevision, 4);
});

test("only active fixed prices can be overridden and updates require a reason and revision", () => {
  assert.equal(RATE_ITEMS.length, 10);
  assert.equal(ACTIVE_RATE_ITEMS.length, 8);
  const valid = { revision: 0, overrides: { "plasmid-tubes": 350 }, reason: "Agreed lab rate" };
  assert.equal(customerPriceUpdateSchema.safeParse(valid).success, true);
  assert.equal(customerPriceUpdateSchema.safeParse({ ...valid, overrides: {} }).success, true);
  for (const overrides of [{ "sanger-ready-tubes": 300 }, { oligo: 25 }, { "plasmid-tubes": null }, { "plasmid-tubes": -1 }, { "plasmid-tubes": 2.5 }, { "plasmid-tubes": 1_000_001 }]) {
    assert.equal(customerPriceUpdateSchema.safeParse({ ...valid, overrides }).success, false);
  }
  for (const patch of [{ revision: -1 }, { revision: 1.5 }, { reason: " " }, { reason: "x".repeat(501) }, { customerId: "other" }]) {
    assert.equal(customerPriceUpdateSchema.safeParse({ ...valid, ...patch }).success, false);
  }
  assert.equal(customerPricingSchema.safeParse({ customerId: "one", revision: 0, overrides: {} }).success, true);
  assert.equal(sameCustomerOverrides({}, { "plasmid-tubes": 0 }), false);
  assert.equal(sameCustomerOverrides({ "plasmid-tubes": 350 }, { "plasmid-tubes": 350 }), true);
  assert.equal(priceUpdateSchema.safeParse({ ...DEFAULT_SCHEDULE, customerId: "one", reason: "Global change" }).success, false);
});

test("customer price snapshots record the custom rate and revision without changing public pricing", () => {
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "one", revision: 2, overrides: { "sanger-standard-tubes": 400 } });
  const snapshot = priceOrder(blankOrder(), schedule);
  assert.equal(snapshot.subtotalCents, 400);
  assert.equal(snapshot.customerPricingRevision, 2);
  assert.equal(snapshot.lines[0].customPrice, true);
  assert.equal(priceOrder(blankOrder(), DEFAULT_SCHEDULE).subtotalCents, 550);
});
