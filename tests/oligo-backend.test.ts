import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOrder, orderSchema, type OrderDraft } from "../src/lib/order-intake";
import { hasStandardOligoPrice, isOligoProductionBlocked, oligoSchema, type OligoDraft } from "../src/lib/oligo-schema";
import { formatMoney, OLIGO_PRICING_VERSION, priceOrder, pricingSchema } from "../src/lib/pricing";
import { orderFilterWhere, parseOrderFilters } from "../src/lib/admin-order-filters";

function item(): OligoDraft {
  return { name: "Primer-F", sequence: "acgt acgt\nNN", synthesisScale: "25 nmol", purification: "Desalted", modification5: "", modification3: "", modificationInternal: "", notes: "Keep this request" };
}
function order(): OrderDraft {
  const base = blankOrder();
  return { ...base, service: "OLIGO", submissionMode: "Oligo standard", samples: [], oligos: [item()], oligoShippingAddress: "Lab 101, 123 Science Way, San Diego, CA 92101, USA", oligoFormat: "Dry", fulfillment: { ...base.fulfillment, contactName: "Scientist", contactPhone: "555-0100", billingOrganization: "Lab", billingContactName: "Accounts", billingEmail: "accounts@example.com", billingAddress: "123 Science Way" } };
}

test("oligo validation normalizes DNA without removing non-sequence characters", () => {
  const parsed = orderSchema.parse(order());
  assert.equal(parsed.oligos?.[0].sequence, "ACGTACGTNN");
  assert.equal(parsed.samples.length, 0);
  for (const sequence of ["", "ACGU", "5'-ACGT-3'", "ACGT/5Phos/", "ACGT123", "A".repeat(501)]) assert.equal(oligoSchema.safeParse({ ...item(), sequence }).success, false, sequence);
  assert.equal(oligoSchema.parse({ ...item(), sequence: "ACGTRYSWKMBDHVN" }).sequence, "ACGTRYSWKMBDHVN");
});

test("oligo requests need delivery and billing, not incoming DNA pickup", () => {
  assert.equal(orderSchema.safeParse(order()).success, true);
  for (const patch of [{ oligoShippingAddress: "" }, { oligoFormat: undefined }, { samples: blankOrder().samples }, { oligos: [] }, { container: "Plate" }, { submissionMode: "Standard" }]) assert.equal(orderSchema.safeParse({ ...order(), ...patch }).success, false);
  for (const field of ["contactName", "contactPhone", "billingOrganization", "billingContactName", "billingEmail", "billingAddress"]) assert.equal(orderSchema.safeParse({ ...order(), fulfillment: { ...order().fulfillment, [field]: "" } }).success, false, field);
  assert.equal(orderSchema.safeParse({ ...order(), fulfillment: { ...order().fulfillment, paymentMethod: "Purchase order" } }).success, false);
});

test("oligo names and mode-specific modification rules prevent ambiguous orders", () => {
  assert.equal(orderSchema.safeParse({ ...order(), oligos: [item(), { ...item(), name: "  PRIMER-F " }] }).success, false);
  assert.equal(orderSchema.safeParse({ ...order(), oligos: Array.from({ length: 251 }, (_, i) => ({ ...item(), name: `Oligo ${i}` })) }).success, false);
  assert.equal(orderSchema.safeParse({ ...order(), oligos: [{ ...item(), modification5: "Phosphorylation" }] }).success, false);
  assert.equal(orderSchema.safeParse({ ...order(), submissionMode: "Oligo modified" }).success, false);
  assert.equal(orderSchema.safeParse({ ...order(), submissionMode: "Oligo modified", oligos: [{ ...item(), modification5: "Phosphorylation" }] }).success, true);
  assert.equal(orderSchema.safeParse({ ...order(), service: "SANGER" }).success, false);
});

test("standard oligos cost 25 cents per normalized DNA base with an immutable price snapshot", () => {
  const draft = { ...order(), oligos: [{ ...item(), sequence: "acgt acgt\nacgt acgt acgt" }, { ...item(), name: "Primer-R", sequence: "ACGTRYSWKMBDHVN" }] };
  const estimate = priceOrder(draft);
  assert.equal(estimate.version, OLIGO_PRICING_VERSION);
  assert.equal(estimate.unit, "base");
  assert.equal(estimate.pendingQuote, false);
  assert.equal(estimate.quoteApprovalRequired, true);
  assert.deepEqual(estimate.lines.map(line => [line.quantity, line.unitCents, line.amountCents]), [[20, 25, 500], [15, 25, 375]]);
  assert.equal(estimate.subtotalCents, 875);
  assert.equal(formatMoney(estimate.lines[0].amountCents), "$5.00");
  assert.equal(pricingSchema.safeParse(estimate).success, true);
  draft.oligos[0].sequence = "A";
  assert.equal(pricingSchema.parse(estimate).subtotalCents, 875);
  assert.ok(estimate.reviewReasons.some(reason => reason.includes("25 nmol") && reason.includes("separate quote")));
  for (const sequence of ["ACGU", "ACGT/5Phos/", "ACGT1", "", "A".repeat(501)]) assert.throws(() => priceOrder({ ...order(), oligos: [{ ...item(), sequence }] }));
  assert.throws(() => priceOrder({ ...order(), oligos: [] }));
});

test("nonstandard scales, purification and any modification require separate quotes", () => {
  const requests: Partial<OligoDraft>[] = [
    { synthesisScale: "100 nmol" }, { synthesisScale: "250 nmol" }, { synthesisScale: "1 umol" }, { synthesisScale: "10 umol" },
    { purification: "Cartridge" }, { purification: "HPLC" }, { purification: "PAGE" },
    { modification5: "Phosphate" }, { modification3: "Biotin" }, { modificationInternal: "dT at base 4" },
  ];
  for (const request of requests) {
    const oligo = { ...item(), ...request };
    assert.equal(hasStandardOligoPrice(oligo), false);
    const quote = priceOrder({ ...order(), submissionMode: "Oligo modified", oligos: [oligo] });
    assert.equal(quote.pendingQuote, true);
    assert.equal(quote.subtotalCents, null);
    assert.equal(quote.knownSubtotalCents, undefined);
    assert.deepEqual(quote.lines, []);
    assert.deepEqual(quote.unpricedItems, [oligo.name]);
    assert.equal(quote.quoteApprovalRequired, true);
    assert.equal(formatMoney(quote.subtotalCents), "Quote pending");
    assert.equal(pricingSchema.safeParse(quote).success, true);
    assert.equal(pricingSchema.safeParse({ ...quote, subtotalCents: 0 }).success, false);
  }
});

test("mixed oligos show only the standard portion while the final total remains unknown", () => {
  const quote = priceOrder({ ...order(), submissionMode: "Oligo modified", oligos: [item(), { ...item(), name: "Custom-R", purification: "HPLC", modification5: "Phosphate" }] });
  assert.equal(quote.pendingQuote, true);
  assert.equal(quote.subtotalCents, null);
  assert.equal(quote.knownSubtotalCents, 250);
  assert.equal(quote.lines.length, 1);
  assert.equal(quote.lines[0].quantity, 10);
  assert.deepEqual(quote.unpricedItems, ["Custom-R"]);
  assert.equal(pricingSchema.safeParse(quote).success, true);
  assert.equal(pricingSchema.safeParse({ ...quote, subtotalCents: 250 }).success, false);
  assert.equal(pricingSchema.safeParse({ ...quote, knownSubtotalCents: 500 }).success, false);
  assert.equal(pricingSchema.safeParse({ ...quote, knownSubtotalCents: undefined }).success, false);
  assert.equal(pricingSchema.safeParse({ ...quote, unpricedItems: [] }).success, false);
});

test("historical oligo quote snapshots remain unknown instead of receiving new standard prices", () => {
  const original = { version: "seqforge-oligo-quote-2026-10", currency: "USD", unit: "oligo", pendingQuote: true, lines: [], subtotalCents: null, reviewReasons: ["Original quote notice"] };
  assert.deepEqual(pricingSchema.parse(original), original);
  assert.equal(pricingSchema.safeParse({ ...original, subtotalCents: 0 }).success, false);
  assert.equal(pricingSchema.safeParse({ ...original, pendingQuote: false }).success, false);
});

test("admin can find oligo requests but cannot start production before quote approval", () => {
  const filters = parseOrderFilters({ service: "OLIGO", mode: "Oligo modified", q: "Primer-F" });
  assert.equal(filters.service, "OLIGO");
  assert.equal(filters.mode, "Oligo modified");
  assert.ok(JSON.stringify(orderFilterWhere(filters)).includes("searchNames"));
  for (const status of ["PROCESSING", "SEQUENCED", "QC", "COMPLETED"]) assert.equal(isOligoProductionBlocked("OLIGO", status), true);
  for (const status of ["SUBMITTED", "RECEIVED"]) assert.equal(isOligoProductionBlocked("OLIGO", status), false);
  assert.equal(isOligoProductionBlocked("SANGER", "PROCESSING"), false);
});
