import { z } from "zod";

export const OLIGO_PURIFICATIONS = ["Desalted", "Cartridge", "HPLC", "PAGE"] as const;
export const OLIGO_SCALES = ["25 nmol", "100 nmol", "250 nmol", "1 umol", "10 umol"] as const;
export const OLIGO_FORMATS = ["Dry", "Resuspended"] as const;
export const MAX_OLIGOS = 250;
export const OLIGO_QUOTE_NOTICE = "Price pending lab confirmation. Production starts only after you approve the quote. Requested specifications, delivery, taxes and shipping will be confirmed by the lab.";

const modification = z.string().trim().max(200);
export const oligoSchema = z.object({
  name: z.string().trim().min(1, "Enter an oligo name.").max(100),
  sequence: z.string().transform(value => value.replace(/\s/g, "").toUpperCase()).pipe(z.string().min(1, "Enter a DNA sequence.").max(500, "This form accepts up to 500 bases per oligo; contact the lab for longer sequences.").regex(/^[ACGTRYSWKMBDHVN]+$/, "Use 5′ to 3′ DNA IUPAC letters only; enter modifications in their separate fields.")),
  synthesisScale: z.enum(OLIGO_SCALES),
  purification: z.enum(OLIGO_PURIFICATIONS),
  modification5: modification,
  modification3: modification,
  modificationInternal: modification,
  notes: z.string().trim().max(500),
});
export type OligoDraft = z.infer<typeof oligoSchema>;
export const oligoSnapshotSchema = z.object({
  items: z.array(oligoSchema).min(1).max(MAX_OLIGOS),
  shippingAddress: z.string().trim().min(1).max(1000),
  format: z.enum(OLIGO_FORMATS),
});
export function readOligoSnapshot(value: unknown) {
  const parsed = oligoSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function hasOligoModifications(item: OligoDraft) {
  return Boolean(item.modification5.trim() || item.modification3.trim() || item.modificationInternal.trim());
}
export function oligoCount(value: unknown) { return readOligoSnapshot(value)?.items.length ?? 0; }

// This release collects quote requests; it does not yet record customer quote approval.
export function isOligoProductionBlocked(service: string, status: string) {
  return service === "OLIGO" && ["PROCESSING", "SEQUENCED", "QC", "COMPLETED"].includes(status);
}
