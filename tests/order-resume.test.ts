import assert from "node:assert/strict";
import test from "node:test";
import { blankOrder } from "../src/lib/order-intake";
import { DEFAULT_SCHEDULE } from "../src/lib/rate-schedule";
import { blankOligo } from "../src/lib/oligo-entry";
import { emailVerificationUrl, safeAuthReturn, hasOrderDraftChanges, ORDER_DRAFT_TTL, orderDraftKey, persistentOrderDraftKey, persistOrderDraft, restoreOrderDraft, orderLoginUrl, readSavedOrder, safeOrderReturn } from "../src/lib/order-resume";

const now = 1_800_000_000_000;
const saved = (extra = {}) => JSON.stringify({ version: 1, savedAt: now, ownerId: null, draft: blankOrder(), ...extra });

test("Oligo drafts preserve unfinished sequences, imports and outbound delivery across sign-in", () => {
  const disk = memoryStorage();
  const tab = memoryStorage();
  const draft = { ...blankOrder(), service: "OLIGO" as const, submissionMode: "Oligo modified" as const, samples: [], oligos: [{ ...blankOligo(), name: "Half filled", sequence: "ac gt /unfinished", modification5: "Biotin" }], oligoShippingAddress: "Room", oligoFormat: "Resuspended" as const };
  tab.setItem(orderDraftKey("Oligo modified"), saved({ draft, bulkText: "Name\tSequence\nPending\tacg", oligoPendingImport: [{ ...blankOligo(), name: "Pending", sequence: "ACG" }] }));
  const restored = restoreOrderDraft(disk, tab, "Oligo modified", "customer-1", now)!;
  assert.deepEqual(restored.draft, draft);
  assert.equal(restored.oligoPendingImport?.[0].name, "Pending");
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Oligo modified", "customer-1", now + 1000)?.draft.oligoShippingAddress, "Room");
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Oligo standard", "customer-1", now), null);
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Oligo modified", "customer-2", now), null);
  assert.equal(readSavedOrder(saved({ draft: { ...draft, service: "SANGER" } }), "Oligo modified", null, now), null);
  assert.equal(orderLoginUrl("Oligo standard"), "/login?next=%2Forders%2Fnew%3Fservice%3Doligo%26type%3Dstandard");
  assert.equal(orderLoginUrl("Oligo modified"), "/login?next=%2Forders%2Fnew%3Fservice%3Doligo%26type%3Dmodified");
});

test("Drafts retain the quoted schedule and unacknowledged price notice across login and reload", () => {
  const disk = memoryStorage();
  const tab = memoryStorage();
  tab.setItem(orderDraftKey("Standard"), saved({ pricingSchedule: DEFAULT_SCHEDULE, priceNotice: "Review the updated total", review: true }));
  const restored = restoreOrderDraft(disk, tab, "Standard", "customer-1", now)!;
  assert.deepEqual(restored.pricingSchedule, DEFAULT_SCHEDULE);
  assert.equal(restored.priceNotice, "Review the updated total");
  const reopened = restoreOrderDraft(disk, memoryStorage(), "Standard", "customer-1", now + 1000)!;
  assert.equal(reopened.priceNotice, restored.priceNotice);
  assert.equal(reopened.review, true);
  assert.ok(readSavedOrder(saved(), "Standard", null, now), "Legacy drafts without a price quote still restore");
});

test("Drafts saved before Whole Plasmid size tiers retain their original eight-rate quote", () => {
  const oldRates = Object.fromEntries(Object.entries(DEFAULT_SCHEDULE.rates).filter(([key]) => !key.startsWith("plasmid-large-")));
  oldRates["plasmid-tubes"] = 650;
  const restored = readSavedOrder(saved({ pricingSchedule: { revision: 2, rates: oldRates } }), "Standard", null, now)!;
  assert.ok(restored);
  assert.equal(restored.pricingSchedule!.revision, 2);
  assert.equal(restored.pricingSchedule!.rates["plasmid-tubes"], 650);
  assert.equal(restored.pricingSchedule!.rates["plasmid-large-tubes"], 650);
  assert.equal(restored.pricingSchedule!.rates["plasmid-large-plate"], oldRates["plasmid-plate"]);
});

test("Only actual order work triggers the return prompt, including unfinished imports", () => {
  const initial = readSavedOrder(saved(), "Standard", null, now)!;
  assert.equal(hasOrderDraftChanges(initial, initial), false);
  assert.equal(hasOrderDraftChanges({ ...initial, entryMethod: "paste", savedAt: now + 1000 } as typeof initial, initial), false);
  assert.equal(hasOrderDraftChanges({ ...initial, draft: { ...initial.draft, orderName: "Half-filled" } }, initial), true);
  assert.equal(hasOrderDraftChanges({ ...initial, bulkText: "unfinished spreadsheet" }, initial), true);
  assert.equal(hasOrderDraftChanges({ ...initial, draft: { ...initial.draft, fulfillment: { ...initial.draft.fulfillment, billingEmail: "half@" } } }, initial), true);
  const withDefaults = { ...initial, draft: { ...initial.draft, fulfillment: { ...initial.draft.fulfillment, contactName: "Saved account contact" } } };
  assert.equal(hasOrderDraftChanges(structuredClone(withDefaults), withDefaults), false);
});

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test("Closing a tab preserves an incomplete draft for another visit, for 30 days", () => {
  const disk = memoryStorage();
  const draft = blankOrder();
  draft.samples[0].sampleName = "Return tomorrow";
  draft.fulfillment.billingEmail = "unfinished@";
  const state = readSavedOrder(saved({ draft, bulkText: "Sample\tPrimer\nClone\tT7" }), "Standard", null, now)!;
  persistOrderDraft(disk, "Standard", null, state, now);
  const reopened = restoreOrderDraft(disk, memoryStorage(), "Standard", null, now + 7 * 86400000)!;
  assert.deepEqual(reopened.draft, draft);
  assert.equal(reopened.bulkText, state.bulkText);
  assert.equal(ORDER_DRAFT_TTL, 30 * 86400000);
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Standard", null, now + ORDER_DRAFT_TTL + 1), null);
});

test("Existing tab drafts migrate and a login handoff wins over an older account draft", () => {
  const disk = memoryStorage();
  const tab = memoryStorage();
  const old = readSavedOrder(saved(), "Standard", null, now)!;
  persistOrderDraft(disk, "Standard", "customer-1", old, now);
  const draft = blankOrder();
  draft.samples[0].sampleName = "Guest work to keep";
  tab.setItem(orderDraftKey("Standard"), saved({ draft }));
  disk.setItem(persistentOrderDraftKey("Standard", null), saved({ draft }));
  const result = restoreOrderDraft(disk, tab, "Standard", "customer-1", now)!;
  assert.equal(result.draft.samples[0].sampleName, "Guest work to keep");
  assert.equal(tab.getItem(orderDraftKey("Standard")), null);
  assert.equal(disk.getItem(persistentOrderDraftKey("Standard", null)), null);
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Standard", "customer-2", now), null);
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Standard", null, now), null);
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Standard", "customer-1", now)!.draft.samples[0].sampleName, "Guest work to keep");
});

test("Saving another account or submission type does not replace existing drafts", () => {
  const disk = memoryStorage();
  for (const ownerId of ["customer-1", "customer-2"]) {
    for (const submissionMode of ["Standard", "Pre-mixed", "Ready to load"] as const) {
      const draft = { ...blankOrder(), submissionMode, orderName: `${ownerId} ${submissionMode}` };
      const state = readSavedOrder(saved({ draft }), submissionMode, null, now)!;
      persistOrderDraft(disk, submissionMode, ownerId, state, now);
    }
  }
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Standard", "customer-1", now)!.draft.orderName, "customer-1 Standard");
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Pre-mixed", "customer-2", now)!.draft.orderName, "customer-2 Pre-mixed");
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Ready to load", "customer-1", now)!.draft.orderName, "customer-1 Ready to load");
});

test("Guest drafts preserve unfinished fields and can be resumed after customer sign-in", () => {
  const draft = blankOrder();
  draft.samples[0].sampleName = "Unfinished clone";
  draft.samples[0].concentration = "1e";
  draft.fulfillment.billingEmail = "unfinished@";
  const raw = saved({ draft, bulkText: "Project\tName\nX\tClone", step: "details", shareText: "colleague@", pasteSource: "SeqForge universal primer" });
  for (const owner of [null, "customer-1"]) {
    const result = readSavedOrder(raw, "Standard", owner, now);
    assert.ok(result);
    assert.deepEqual(result.draft, draft);
    assert.equal(result.step, "details");
    assert.equal(result.bulkText, "Project\tName\nX\tClone");
    assert.equal(result.shareText, "colleague@");
    assert.equal(result.pasteSource, "SeqForge universal primer");
  }
});

test("Drafts are isolated by mode and signed-in owner, expire, and reject damaged data", () => {
  const raw = saved({ ownerId: "customer-1" });
  assert.ok(readSavedOrder(raw, "Standard", "customer-1", now));
  assert.equal(readSavedOrder(raw, "Standard", "customer-2", now), null);
  assert.equal(readSavedOrder(raw, "Standard", null, now), null);
  assert.equal(readSavedOrder(saved(), "Pre-mixed", null, now), null);
  assert.equal(readSavedOrder(saved(), "Standard", null, now + ORDER_DRAFT_TTL + 1), null);
  for (const raw of ["{", saved({ version: 9 }), saved({ draft: {} }), saved({ savedAt: now + 120000 })]) assert.equal(readSavedOrder(raw, "Standard", null, now), null);
});

test("Review and Ready to load state survive the auth round trip", () => {
  const draft = { ...blankOrder(), submissionMode: "Ready to load" as const };
  const raw = saved({ draft, imported: true, sampleCount: 1, entryMethod: "import", review: true, submissionKey: "123e4567-e89b-42d3-a456-426614174000" });
  const result = readSavedOrder(raw, "Ready to load", "customer-1", now)!;
  assert.equal(result.imported, true);
  assert.equal(result.review, true);
  assert.equal(result.sampleCount, 1);
  assert.equal(result.submissionKey, "123e4567-e89b-42d3-a456-426614174000");
});

test("Authentication return URLs allow only known order-entry routes", () => {
  for (const bad of ["//evil.example", "https://evil.example/orders/new", "/orders/newer", "/orders/new/../../admin", "/orders/new?service=evil", "/orders/new?service=sanger&type=evil", "/orders/new\\evil", ["/orders/new"]]) assert.equal(safeOrderReturn(bad), null);
  assert.equal(safeOrderReturn("/orders/new?service=sanger&type=pre-mixed&next=https://evil.example"), "/orders/new?service=sanger&type=pre-mixed");
  assert.equal(safeOrderReturn("/orders/new"), "/orders/new");
  assert.equal(safeOrderReturn(new URL(orderLoginUrl("Ready to load"), "http://localhost").searchParams.get("next")), "/orders/new?service=sanger&retired=ready-to-load");
  assert.equal(safeOrderReturn("/orders/new?service=sanger&type=ready-to-load"), "/orders/new?service=sanger&retired=ready-to-load");
});

test("Verification return links preserve the order service and never permit an external destination", () => {
  const order = "/orders/new?service=oligo&type=modified";
  const verify = emailVerificationUrl(order);
  assert.equal(safeAuthReturn(verify), verify);
  assert.equal(safeAuthReturn(`${verify}&verified=1&email=someone@example.com`), verify);
  assert.equal(safeAuthReturn(order), order);
  for (const value of ["https://evil.example", "//evil.example", "/verify-email/../admin", "/verify-email\\evil", "/verify-email-extra", [verify]]) {
    assert.equal(safeAuthReturn(value), null);
  }
  assert.equal(safeAuthReturn("/verify-email?next=https://evil.example"), emailVerificationUrl("/dashboard"));
  assert.equal(emailVerificationUrl("//evil.example"), "/verify-email?next=%2Fdashboard");
});

test("A verification link opened in another tab restores the signed-in draft from persistent storage", () => {
  const disk = memoryStorage();
  const originalTab = memoryStorage();
  const state = readSavedOrder(saved({ draft: { ...blankOrder(), orderName: "Keep while verifying" }, review: true, step: "details", submissionKey: "123e4567-e89b-42d3-a456-426614174000" }), "Standard", "customer-1", now)!;
  const raw = persistOrderDraft(disk, "Standard", "customer-1", state, now);
  originalTab.setItem(orderDraftKey("Standard"), raw);
  const resumed = restoreOrderDraft(disk, memoryStorage(), "Standard", "customer-1", now)!;
  assert.equal(resumed.draft.orderName, "Keep while verifying");
  assert.equal(resumed.review, true);
  assert.equal(resumed.submissionKey, state.submissionKey);
  assert.equal(restoreOrderDraft(disk, memoryStorage(), "Standard", "customer-2", now), null);
});
