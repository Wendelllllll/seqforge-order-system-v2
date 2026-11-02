import { z } from "zod";

export const FRAGMENT_MAX_SAMPLES = 1536;
export const FRAGMENT_HOLD_REASON = "Awaiting laboratory confirmation of fluorescent dyes, size standard, sample preparation and pricing, followed by customer approval. Analysis has not started.";
export const FRAGMENT_RESULTS = ["Raw data (.fsa)", "Raw data and fragment sizing requested", "Other analysis requested — see notes"] as const;
export const fragmentFieldsSchema = z.object({
  dyes: z.string().max(200), minSize: z.string().max(20), maxSize: z.string().max(20),
  sizeStandard: z.string().max(200), resultRequest: z.enum(FRAGMENT_RESULTS),
});
export const fragmentSettingsSchema = fragmentFieldsSchema.superRefine((value, ctx) => {
  if (!value.dyes.trim()) ctx.addIssue({ code: "custom", path: ["dyes"], message: "Enter the fluorescent dyes used, or write Unknown for laboratory review." });
  for (const key of ["minSize", "maxSize"] as const) if (!/^\d+$/.test(value[key]) || !Number.isSafeInteger(Number(value[key])) || Number(value[key]) < 1) ctx.addIssue({ code: "custom", path: [key], message: "Enter a positive whole-number expected fragment size in bp." });
  if (Number(value.minSize) > Number(value.maxSize)) ctx.addIssue({ code: "custom", path: ["maxSize"], message: "The upper size must be at least the lower size." });
});
export type FragmentSettings = z.infer<typeof fragmentFieldsSchema>;
export const blankFragmentSettings = (): FragmentSettings => ({ dyes: "", minSize: "", maxSize: "", sizeStandard: "", resultRequest: "Raw data (.fsa)" });
export function readFragmentSnapshot(raw: unknown) { const parsed = fragmentSettingsSchema.safeParse(raw); return parsed.success ? parsed.data : null; }
export function isFragmentProductionBlocked(service: string, status: string) { return service === "FRAGMENT_ANALYSIS" && !["SUBMITTED", "RECEIVED", "ON_HOLD", "CANCELLED"].includes(status); }
