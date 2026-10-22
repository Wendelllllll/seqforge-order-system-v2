import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOrder, orderSchema, type OrderDraft } from "../src/lib/order-intake";
import { isOligoProductionBlocked, oligoSchema, type OligoDraft } from "../src/lib/oligo-schema";
import { formatMoney, priceOrder, pricingSchema } from "../src/lib/pricing";
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

test("oligo pricing is an explicit pending quote, never a zero-dollar order", () => {
  const quote = priceOrder(orderSchema.parse(order()));
  assert.equal(quote.pendingQuote, true);
  assert.equal(quote.subtotalCents, null);
  assert.deepEqual(quote.lines, []);
  assert.equal(formatMoney(quote.subtotalCents), "Quote pending");
  assert.equal(pricingSchema.safeParse(quote).success, true);
  assert.equal(pricingSchema.safeParse({ ...quote, subtotalCents: 0 }).success, false);
  assert.equal(pricingSchema.safeParse({ ...quote, pendingQuote: false }).success, false);
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
