import { z } from "zod";
import { MAX_REACTIONS, orderSchema, reactionCount, reactionSchema, sampleSchema, type OrderDraft } from "./order-intake";
import { orderDefaultsSchema } from "./order-defaults";
import { orderServiceUrl, ORDER_SERVICES } from "./order-services";
import { savedRateScheduleSchema } from "./rate-schedule";
import { oligoSchema } from "./oligo-schema";

// Drafts permit unfinished text. Final submission still uses the strict orderSchema.
const text = z.string().max(10000);
const oligo = z.object({ ...oligoSchema.shape, name: text, sequence: text });
const reaction = z.object({ ...reactionSchema.shape, primerName: text, primerConcentration: text, primerSequence: text });
const sample = z.object({ ...sampleSchema.shape, sampleName: text, templateLength: text, concentration: text, reactions: z.array(reaction).max(MAX_REACTIONS) });
const draft = z.object({ ...orderSchema.shape, orderName: text, fulfillment: z.object({ ...orderDefaultsSchema.shape, billingEmail: text }), samples: z.array(sample).max(MAX_REACTIONS), oligos: z.array(oligo).max(MAX_REACTIONS).optional() })
  .refine(value => reactionCount(value.samples) <= MAX_REACTIONS);

export const savedOrderSchema = z.object({
  version: z.literal(1), savedAt: z.number(), ownerId: z.string().nullable(), draft,
  step: z.enum(["samples", "details"]).default("samples"), review: z.boolean().default(false),
  shareText: z.string().max(5200).default(""), entryMethod: z.enum(["manual", "paste", "import"]).default("manual"),
  bulkText: z.string().max(1_000_000).default(""),
  mappingSheet: z.object({ rows: z.array(z.object({ cells: z.array(z.string()).max(100), line: z.number() })).max(251), hasHeader: z.boolean(), columns: z.array(z.string()).max(100) }).nullable().default(null),
  pasteSource: z.enum(["", "Customer supplied", "SeqForge universal primer", "column", "primer-columns", "Included in mix"]).default(""),
  pendingImport: z.array(sample).max(MAX_REACTIONS).nullable().default(null),
  oligoPendingImport: z.array(oligo).max(MAX_REACTIONS).nullable().optional(),
  imported: z.boolean().default(false), sampleCount: z.number().int().min(1).max(MAX_REACTIONS).nullable().default(1),
  submissionKey: z.union([z.literal(""), z.string().uuid()]).default(""),
  pricingSchedule: savedRateScheduleSchema.optional(),
  priceNotice: z.string().max(1000).optional(),
});
export type SavedOrder = z.infer<typeof savedOrderSchema>;
export type OrderResumeState = Omit<SavedOrder, "version" | "savedAt" | "ownerId">;
export function hasOrderDraftChanges(state: OrderResumeState, initial: OrderResumeState) {
  const content = (value: OrderResumeState) => JSON.stringify({ draft: value.draft, shareText: value.shareText, bulkText: value.bulkText, mappingSheet: value.mappingSheet, pendingImport: value.pendingImport, oligoPendingImport: value.oligoPendingImport, imported: value.imported, sampleCount: value.sampleCount }, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  return content(state) !== content(initial);
}
export const orderDraftKey = (mode: OrderDraft["submissionMode"]) => `seqforge:order-draft:v1:${mode}`;
export const persistentOrderDraftKey = (mode: OrderDraft["submissionMode"], ownerId: string | null) => `seqforge:order-draft:v2:${ownerId ? `user:${ownerId}` : "guest"}:${mode}`;
export const ORDER_DRAFT_TTL = 30 * 24 * 60 * 60 * 1000;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function persistOrderDraft(storage: DraftStorage, mode: OrderDraft["submissionMode"], ownerId: string | null, state: OrderResumeState, now = Date.now()) {
  const raw = JSON.stringify({ ...state, version: 1, savedAt: now, ownerId });
  const key = persistentOrderDraftKey(mode, ownerId);
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error("Draft not saved");
  return raw;
}

export function restoreOrderDraft(storage: DraftStorage, tabStorage: DraftStorage, mode: OrderDraft["submissionMode"], ownerId: string | null, now = Date.now()) {
  // The tab copy carries an explicit login handoff, and migrates drafts from the old release.
  const handoff = readSavedOrder(tabStorage.getItem(orderDraftKey(mode)), mode, ownerId, now);
  const own = readSavedOrder(storage.getItem(persistentOrderDraftKey(mode, ownerId)), mode, ownerId, now);
  const guest = ownerId ? readSavedOrder(storage.getItem(persistentOrderDraftKey(mode, null)), mode, ownerId, now) : null;
  const saved = handoff ?? own ?? guest;
  if (saved) {
    persistOrderDraft(storage, mode, ownerId, saved, saved.savedAt);
    if (ownerId && saved.ownerId === null) storage.removeItem(persistentOrderDraftKey(mode, null));
  }
  tabStorage.removeItem(orderDraftKey(mode));
  return saved;
}

export function readSavedOrder(raw: string | null, mode: OrderDraft["submissionMode"], ownerId: string | null, now = Date.now()): SavedOrder | null {
  if (!raw || raw.length > 3_000_000) return null;
  try {
    const parsed = savedOrderSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const saved = parsed.data;
    if (saved.draft.submissionMode !== mode || now - saved.savedAt > ORDER_DRAFT_TTL || saved.savedAt > now + 60_000) return null;
    if ((mode === "Whole plasmid") !== (saved.draft.service === "WHOLE_PLASMID")) return null;
    if (mode.startsWith("Oligo ") !== (saved.draft.service === "OLIGO")) return null;
    // A guest draft can become a signed-in draft. Never restore another account's draft.
    if (saved.ownerId !== null && saved.ownerId !== ownerId) return null;
    return saved;
  } catch { return null; }
}

export function orderReturnPath(mode: OrderDraft["submissionMode"]) {
  if (mode === "Ready to load") return "/orders/new?service=sanger&retired=ready-to-load";
  if (mode === "Whole plasmid") return orderServiceUrl("whole-plasmid");
  if (mode === "Oligo standard" || mode === "Oligo modified") return orderServiceUrl("oligo", mode === "Oligo modified" ? "modified" : "standard");
  const option = ORDER_SERVICES.find(service => service.id === "sanger")!.options.find(option => option.submissionMode === mode)!;
  return orderServiceUrl("sanger", option.id);
}

// Only allow the known order-entry routes as auth return targets, never arbitrary URLs.
export function safeOrderReturn(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/orders/new") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://seqforge.invalid");
    if (url.origin !== "https://seqforge.invalid" || url.pathname !== "/orders/new") return null;
    const serviceId = url.searchParams.get("service");
    if (!serviceId) return orderServiceUrl();
    const service = ORDER_SERVICES.find(item => item.id === serviceId);
    if (!service) return null;
    const optionId = url.searchParams.get("type");
    if (serviceId === "sanger" && (optionId === "ready-to-load" || url.searchParams.get("retired") === "ready-to-load")) return "/orders/new?service=sanger&retired=ready-to-load";
    if (optionId && !service.options.some(option => option.id === optionId)) return null;
    return orderServiceUrl(serviceId, optionId || undefined);
  } catch { return null; }
}

export function orderLoginUrl(mode: OrderDraft["submissionMode"]) {
  return `/login?next=${encodeURIComponent(orderReturnPath(mode))}`;
}

export function emailVerificationUrl(next: unknown) {
  return `/verify-email?next=${encodeURIComponent(safeOrderReturn(next) || "/dashboard")}`;
}

// Authentication may resume verification, but its nested destination stays restricted.
export function safeAuthReturn(value: unknown): string | null {
  const order = safeOrderReturn(value);
  if (order) return order;
  if (typeof value !== "string" || !value.startsWith("/verify-email") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://seqforge.invalid");
    if (url.origin !== "https://seqforge.invalid" || url.pathname !== "/verify-email") return null;
    return emailVerificationUrl(url.searchParams.get("next"));
  } catch { return null; }
}
