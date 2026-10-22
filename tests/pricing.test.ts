import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOrder, blankReaction } from "../src/lib/order-intake";
import { priceOrder, RATE_CENTS, formatMoney } from "../src/lib/pricing";
import { ACTIVE_RATE_ITEMS, DEFAULT_SCHEDULE, dollarsToCents, historicalRatesSchema, priceUpdateSchema, rateScheduleSchema } from "../src/lib/rate-schedule";
import { orderFilterWhere, parseOrderFilters } from "../src/lib/admin-order-filters";
for (const container of ["Plate", "Tubes"] as const) {
  for (const submissionMode of ["Standard", "Pre-mixed"] as const) {
    test(`${container} ${submissionMode} uses the confirmed per-reaction rate`, () => {
      const draft = { ...blankOrder(), container, submissionMode };
      assert.equal(priceOrder(draft).subtotalCents, RATE_CENTS[container][submissionMode]);
    });
  }
}

test("Only currently offered services appear in price management while historical rates remain readable", () => {
  assert.equal(ACTIVE_RATE_ITEMS.length, 8);
  assert.ok(ACTIVE_RATE_ITEMS.every(item => !item.key.startsWith("sanger-ready-")));
  assert.equal(historicalRatesSchema.parse(DEFAULT_SCHEDULE.rates)["sanger-ready-tubes"], 350);
});
test("96 pre-mixed plate reactions cost $336 and multiple primers count separately", () => {
  const draft = blankOrder(); draft.container = "Plate"; draft.submissionMode = "Pre-mixed";
  draft.samples = Array.from({ length: 96 }, () => structuredClone(draft.samples[0]));
  assert.equal(priceOrder(draft).subtotalCents, 33600);
  assert.equal(formatMoney(33600), "$336.00");
  draft.samples = [draft.samples[0]]; draft.submissionMode = "Standard";
  draft.samples[0].reactions.push(blankReaction());
  assert.equal(priceOrder(draft).subtotalCents, 900);
});
test("extras need review, and empty orders cannot receive a price", () => {
  const draft = blankOrder();
  draft.priority = "Same day requested";
  draft.samples[0].reactions[0].primerSource = "SeqForge synthesized primer";
  assert.equal(priceOrder(draft).reviewReasons.length, 2);
  draft.samples = [];
  assert.throws(() => priceOrder(draft), /1–250/);
});

test("managed prices use cents and reject missing, negative or fractional-cent rates", () => {
  assert.equal(dollarsToCents("6.50"), 650);
  assert.equal(dollarsToCents("0"), 0);
  for (const input of ["-1", "NaN", "1.001", "1e2", "10000.01"]) assert.throws(() => dollarsToCents(input));
  const rates = { ...DEFAULT_SCHEDULE.rates, "sanger-standard-tubes": 725 };
  assert.equal(priceOrder(blankOrder(), { revision: 2, rates }).subtotalCents, 725);
  assert.equal(priceUpdateSchema.safeParse({ revision: 2, rates, reason: "Adjusted" }).success, true);
  assert.equal(priceUpdateSchema.safeParse({ revision: 2, rates: {}, reason: "Adjusted" }).success, false);
  for (const cents of [-1, 2.5, 1000001]) assert.equal(priceUpdateSchema.safeParse({ revision: 2, rates: { ...rates, "plasmid-tubes": cents }, reason: "Adjusted" }).success, false);
});

test("admin order filters compose search and exact filters and normalize bad parameters", () => {
  const filters = parseOrderFilters({ q: "  Sample-X ", service: "WHOLE_PLASMID", status: "SUBMITTED", customer: "u1", page: "2" });
  const where = orderFilterWhere(filters);
  assert.equal(filters.q, "Sample-X"); assert.equal(filters.page, 2);
  assert.equal(where.service, "WHOLE_PLASMID"); assert.equal(where.userId, "u1"); assert.equal(where.status, "SUBMITTED");
  assert.equal(where.OR?.length, 9);
  assert.equal(parseOrderFilters({ page: "-1", service: "invalid", status: ["QC"] }).page, 1);
  assert.deepEqual(orderFilterWhere(parseOrderFilters({})), {});
});

test("Active schedules require both size tiers while historical eight-rate audits remain readable", () => {
  const oldRates = Object.fromEntries(Object.entries(DEFAULT_SCHEDULE.rates).filter(([key]) => !key.startsWith("plasmid-large-")));
  assert.deepEqual(historicalRatesSchema.parse(oldRates), oldRates);
  assert.equal(rateScheduleSchema.safeParse({ revision: 1, rates: oldRates }).success, false);
  assert.equal(priceUpdateSchema.safeParse({ revision: 1, rates: oldRates, reason: "Incomplete update" }).success, false);
  assert.equal(rateScheduleSchema.safeParse(DEFAULT_SCHEDULE).success, true);
});
