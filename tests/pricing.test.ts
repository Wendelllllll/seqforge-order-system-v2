import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOrder, blankReaction } from "../src/lib/order-intake";
import { priceOrder, RATE_CENTS, formatMoney } from "../src/lib/pricing";
for (const container of ["Plate", "Tubes"] as const) {
  for (const submissionMode of ["Standard", "Pre-mixed", "Ready to load"] as const) {
    test(`${container} ${submissionMode} uses the confirmed per-reaction rate`, () => {
      const draft = { ...blankOrder(), container, submissionMode };
      assert.equal(priceOrder(draft).subtotalCents, RATE_CENTS[container][submissionMode]);
    });
  }
}
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
