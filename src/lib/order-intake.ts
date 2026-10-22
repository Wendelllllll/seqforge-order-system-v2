import { z } from "zod";
import { blankDefaults, orderDefaultsSchema } from "./order-defaults";
import { hasOligoModifications, MAX_OLIGOS, OLIGO_FORMATS, oligoSchema } from "./oligo-schema";

export const PRIORITIES = ["Standard", "Same day requested"] as const;
export const CONTAINERS = ["Tubes", "Plate"] as const;
export const MODES = ["Standard", "Pre-mixed", "Ready to load", "Whole plasmid", "Oligo standard", "Oligo modified"] as const;
export const TEMPLATES = ["Plasmid DNA", "PCR product", "Purified PCR product", "BAC", "Genomic DNA", "Other"] as const;
export const PREPARATIONS = ["None requested", "Miniprep requested", "PCR cleanup requested"] as const;
export const PROTOCOLS = ["None known", "GC-rich", "RNAi", "PolyA", "Dinucleotide repeat"] as const;
export const SOURCES = ["Customer supplied", "SeqForge universal primer", "Stored at SeqForge", "SeqForge synthesized primer", "Included in mix"] as const;
export const UNIVERSAL_PRIMERS = ["AOX1-For", "AOX1-Rev", "BGHrev", "CMV-F", "DON1-F", "DON2-R", "EGFP-C", "EGFP-N", "GLprimer1", "GLprimer2", "M13F", "M13F-20", "M13R", "pBADF", "pBADR", "pGEX3", "pGEX5", "pTriplEx3", "pTriplEx5", "SP6", "T3", "T7", "T7term"] as const;
export const PURIFICATIONS = ["Desalted", "Cartridge", "HPLC", "PAGE"] as const;
export const SCALES = ["25 nmol", "100 nmol", "250 nmol", "1 umol", "10 umol"] as const;
export const MAX_REACTIONS = 250;
export const MAX_IMPORT_BYTES = 1_000_000;

const shortText = z.string().trim().max(100);
const positiveNumber = z.string().trim().max(30).refine(
  (value) => value === "" || (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0),
  "Enter a positive number without units, or leave blank if unknown.",
);
const wholeNumber = positiveNumber.refine((value) => value === "" || Number.isSafeInteger(Number(value)), "Enter a whole number of base pairs.");

export const reactionSchema = z.object({
  primerSource: z.enum(SOURCES),
  primerName: shortText.min(1, "Enter a primer name."),
  primerConcentration: positiveNumber,
  storedPrimerReference: shortText,
  primerSequence: z.string().trim().toUpperCase().max(500),
  purification: z.enum(PURIFICATIONS),
  synthesisScale: z.enum(SCALES),
  modification5: shortText,
  modification3: shortText,
  modificationInternal: shortText,
  specialProtocol: z.enum(PROTOCOLS),
}).superRefine((reaction, ctx) => {
  if (reaction.primerSource === "SeqForge universal primer" && !(UNIVERSAL_PRIMERS as readonly string[]).includes(reaction.primerName)) {
    ctx.addIssue({ code: "custom", path: ["primerName"], message: "Choose a primer from the SeqForge catalogue." });
  }
  if (reaction.primerSource === "Stored at SeqForge" && !reaction.storedPrimerReference) {
    ctx.addIssue({ code: "custom", path: ["storedPrimerReference"], message: "Enter the lab's stored-primer reference." });
  }
  if (reaction.primerSource === "SeqForge synthesized primer" && !/^[ACGTRYSWKMBDHVN]+$/.test(reaction.primerSequence)) {
    ctx.addIssue({ code: "custom", path: ["primerSequence"], message: "Enter a 5′ to 3′ DNA sequence using IUPAC letters (without spaces or modifications)." });
  }
});

export const sampleSchema = z.object({
  sampleKey: shortText.min(1, "Enter a sample ID."),
  sampleName: shortText.min(1, "Enter a DNA name."),
  tubeLabel: shortText,
  plateLabel: shortText,
  well: shortText.transform((value) => value.toUpperCase().replace(/^([A-H])0+([1-9])$/, "$1$2")),
  templateType: z.enum(TEMPLATES),
  templateLength: wholeNumber,
  concentration: positiveNumber,
  preparation: z.enum(PREPARATIONS),
  notes: z.string().trim().max(500),
  reactions: z.array(reactionSchema).max(MAX_REACTIONS),
});

export const orderSchema = z.object({
  service: z.enum(["SANGER", "WHOLE_PLASMID", "OLIGO"]).default("SANGER"),
  fulfillment: orderDefaultsSchema,
  sharedResultEmails: z.array(z.string().trim().toLowerCase().email().max(254)).max(20).optional(),
  orderName: z.string().trim().max(120).optional().transform(value => value || "Untitled order"),
  poNumber: z.string().trim().max(80),
  specialInstructions: z.string().trim().max(2000),
  priority: z.enum(PRIORITIES),
  container: z.enum(CONTAINERS),
  submissionMode: z.enum(MODES),
  samples: z.array(sampleSchema).max(MAX_REACTIONS),
  oligos: z.array(oligoSchema).max(MAX_OLIGOS).optional(),
  oligoShippingAddress: z.string().trim().max(1000).optional(),
  oligoFormat: z.enum(OLIGO_FORMATS).optional(),
}).superRefine((order, ctx) => {
  if (order.submissionMode === "Ready to load") ctx.addIssue({ code: "custom", path: ["submissionMode"], message: "This submission type is no longer offered. Choose Standard or Pre-mixed." });
  const plasmid = order.service === "WHOLE_PLASMID";
  const oligo = order.service === "OLIGO";
  if (plasmid !== (order.submissionMode === "Whole plasmid")) ctx.addIssue({ code: "custom", path: ["submissionMode"], message: "Submission type does not match the selected service." });
  if (oligo !== ["Oligo standard", "Oligo modified"].includes(order.submissionMode)) ctx.addIssue({ code: "custom", path: ["submissionMode"], message: "Submission type does not match the selected service." });
  const details = order.fulfillment;
  const required = ["contactName", "contactPhone", "billingOrganization", "billingContactName", "billingEmail", "billingAddress"] as const;
  for (const key of required) if (!details[key]) ctx.addIssue({ code: "custom", path: ["fulfillment", key], message: oligo ? "This detail is required for contact and billing." : "This detail is required for pickup or billing." });
  if (!oligo && details.deliveryMethod === "Pickup" && !details.pickupLocation) ctx.addIssue({ code: "custom", path: ["fulfillment", "pickupLocation"], message: "Enter the institution, building, room and collection point." });
  if (details.paymentMethod === "Purchase order" && !order.poNumber) ctx.addIssue({ code: "custom", path: ["poNumber"], message: "Enter a PO number for purchase order billing." });
  if (oligo) {
    if (order.samples.length) ctx.addIssue({ code: "custom", path: ["samples"], message: "Oligo synthesis uses DNA sequences, not incoming samples or Sanger reactions." });
    if (!order.oligos?.length) ctx.addIssue({ code: "custom", path: ["oligos"], message: "Add at least one oligo." });
    if (!order.oligoShippingAddress) ctx.addIssue({ code: "custom", path: ["oligoShippingAddress"], message: "Enter the address where your oligos should be delivered." });
    if (!order.oligoFormat) ctx.addIssue({ code: "custom", path: ["oligoFormat"], message: "Choose the requested delivery format." });
    const names = new Set<string>();
    order.oligos?.forEach((item, i) => {
      const name = item.name.toLowerCase();
      if (names.has(name)) ctx.addIssue({ code: "custom", path: ["oligos", i, "name"], message: "Use a unique oligo name for each row." });
      names.add(name);
      if (order.submissionMode === "Oligo standard" && hasOligoModifications(item)) ctx.addIssue({ code: "custom", path: ["oligos", i, "modification5"], message: "Choose Modified DNA oligos to request modifications." });
    });
    if (order.submissionMode === "Oligo modified" && order.oligos?.length && !order.oligos.some(hasOligoModifications)) ctx.addIssue({ code: "custom", path: ["oligos"], message: "Enter at least one modification request, or choose Standard DNA oligos." });
    if (order.container !== "Tubes") ctx.addIssue({ code: "custom", path: ["container"], message: "This oligo request form currently supports individual tubes." });
    return;
  }
  if (order.oligos?.length || order.oligoShippingAddress || order.oligoFormat) ctx.addIssue({ code: "custom", path: ["oligos"], message: "Oligo synthesis specifications belong to an Oligo order." });
  if (!order.samples.length) ctx.addIssue({ code: "custom", path: ["samples"], message: "Add at least one sample." });
  const ids = new Set<string>();
  const locations = new Set<string>();
  if (reactionCount(order.samples) > MAX_REACTIONS) ctx.addIssue({ code: "custom", path: ["samples"], message: `This demo supports at most ${MAX_REACTIONS} reactions per order.` });
  order.samples.forEach((sample, i) => {
    const issue = (field: string, message: string) => ctx.addIssue({ code: "custom", path: ["samples", i, field], message });
    const key = sample.sampleKey.toLowerCase();
    if (ids.has(key)) issue("sampleKey", "Sample IDs must be unique; add another reaction to the existing sample.");
    ids.add(key);
    if (order.container === "Tubes" && !sample.tubeLabel) issue("tubeLabel", "Enter the physical tube label.");
    if (order.container === "Plate") {
      if (!sample.plateLabel) issue("plateLabel", "Enter a plate label.");
      if (!/^[A-H](?:[1-9]|1[0-2])$/.test(sample.well)) issue("well", "Use a 96-well coordinate from A1 to H12.");
    }
    const location = order.container === "Tubes" ? sample.tubeLabel.toLowerCase() : JSON.stringify([sample.plateLabel.toLowerCase(), sample.well]);
    if (locations.has(location)) issue(order.container === "Tubes" ? "tubeLabel" : "well", "This location is already used by another sample.");
    locations.add(location);
    if (sample.preparation === "Miniprep requested" && sample.templateType !== "Plasmid DNA") issue("preparation", "Miniprep requests require the Plasmid DNA template type.");
    if (sample.preparation === "PCR cleanup requested" && !["PCR product", "Purified PCR product"].includes(sample.templateType)) issue("preparation", "PCR cleanup requests require a PCR template type.");
    if (plasmid) {
      if (sample.reactions.length) issue("reactions", "Whole plasmid samples do not use Sanger primers or reactions.");
      if (sample.templateType !== "Plasmid DNA") issue("templateType", "Choose purified plasmid DNA for Whole Plasmid Sequencing.");
      if (sample.preparation !== "None requested") issue("preparation", "Submit purified plasmid DNA; preparation services are not part of this order.");
    } else if (!sample.reactions.length) issue("reactions", "Add at least one reaction per sample.");
    if (!plasmid && order.submissionMode !== "Standard") {
      if (sample.reactions.length !== 1) issue("reactions", "Each premixed tube or well represents one reaction. Use separate physical samples for additional primers.");
      if (sample.preparation !== "None requested") issue("preparation", "Preparation requests require Standard submission.");
    }
    sample.reactions.forEach((reaction, j) => {
      if ((order.submissionMode === "Standard") === (reaction.primerSource === "Included in mix")) {
        ctx.addIssue({ code: "custom", path: ["samples", i, "reactions", j, "primerSource"], message: order.submissionMode === "Standard" ? "Choose a separate primer source for Standard submission." : "Choose Included in mix for this submission mode." });
      }
    });
  });
});

export type ReactionDraft = z.infer<typeof reactionSchema>;
export type SampleDraft = z.infer<typeof sampleSchema>;
export type OrderDraft = z.infer<typeof orderSchema>;
export function blankReaction(): ReactionDraft {
  return { primerSource: "Customer supplied", primerName: "", primerConcentration: "", storedPrimerReference: "", primerSequence: "", purification: "Desalted", synthesisScale: "25 nmol", modification5: "", modification3: "", modificationInternal: "", specialProtocol: "None known" };
}
export function blankSample(sampleKey = "S1"): SampleDraft {
  return { sampleKey, sampleName: "", tubeLabel: "", plateLabel: "", well: "", templateType: "Plasmid DNA", templateLength: "", concentration: "", preparation: "None requested", notes: "", reactions: [blankReaction()] };
}
export function blankOrder(): OrderDraft {
  return { service: "SANGER", fulfillment: blankDefaults(), orderName: "", poNumber: "", specialInstructions: "", priority: "Standard", container: "Tubes", submissionMode: "Standard", samples: [blankSample()] };
}
export function reactionCount(samples: { reactions: unknown[] }[]) {
  return samples.reduce((sum, sample) => sum + sample.reactions.length, 0);
}
export function issueLabel(issue: { path: PropertyKey[]; message: string }) {
  const path = issue.path.map((part) => typeof part === "number" ? part + 1 : String(part)).join(" · ");
  return `${path}: ${issue.message}`;
}
