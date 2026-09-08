import { z } from "zod";

export const PRIORITIES = ["Standard", "Same day requested"] as const;
export const CONTAINERS = ["Tubes", "Plate"] as const;
export const MODES = ["Standard", "Pre-mixed", "Ready to load"] as const;
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
  reactions: z.array(reactionSchema).min(1, "Add at least one reaction per sample.").max(MAX_REACTIONS),
});

export const orderSchema = z.object({
  orderName: z.string().trim().min(1, "Order name is required.").max(120),
  poNumber: z.string().trim().max(80),
  specialInstructions: z.string().trim().max(2000),
  priority: z.enum(PRIORITIES),
  container: z.enum(CONTAINERS),
  submissionMode: z.enum(MODES),
  samples: z.array(sampleSchema).min(1, "Add at least one sample.").max(MAX_REACTIONS),
}).superRefine((order, ctx) => {
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
    if (order.submissionMode !== "Standard") {
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
  return { orderName: "", poNumber: "", specialInstructions: "", priority: "Standard", container: "Tubes", submissionMode: "Standard", samples: [blankSample()] };
}
export function reactionCount(samples: { reactions: unknown[] }[]) {
  return samples.reduce((sum, sample) => sum + sample.reactions.length, 0);
}
export function issueLabel(issue: { path: PropertyKey[]; message: string }) {
  const path = issue.path.map((part) => typeof part === "number" ? part + 1 : String(part)).join(" · ");
  return `${path}: ${issue.message}`;
}
