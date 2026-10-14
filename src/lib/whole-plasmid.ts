import { issueLabel, MAX_REACTIONS, orderSchema, type OrderDraft, type SampleDraft } from "./order-intake";
import { newSangerSample } from "./sanger-entry";
import type { MappingSheet } from "./sanger-column-mapping";

export const PLASMID_MAPPING_FIELDS = ["", "sampleName", "tubeLabel", "plateLabel", "well", "templateLength", "concentration", "notes", "sampleKey", "templateType"];

export function newPlasmidSample(samples: SampleDraft[], container: OrderDraft["container"]): SampleDraft {
  return { ...newSangerSample(samples, container, "Standard"), reactions: [] };
}

export function parseMappedPlasmid(sheet: MappingSheet, order: OrderDraft) {
  const fail = (message: string) => ({ samples: [] as SampleDraft[], errors: [message] });
  const fields = sheet.columns.filter(Boolean);
  if (!fields.includes("sampleName")) return fail("Map a column to Sample name.");
  if (new Set(fields).size !== fields.length) return fail("Each destination field can be mapped only once.");
  if (fields.some(field => !PLASMID_MAPPING_FIELDS.includes(field))) return fail("Whole plasmid orders do not use primer or preparation columns. Explicitly ignore these columns.");
  const rows = sheet.rows.slice(sheet.hasHeader ? 1 : 0);
  if (!rows.length || rows.length > MAX_REACTIONS) return fail(`Import between 1 and ${MAX_REACTIONS} plasmid samples.`);
  const samples: SampleDraft[] = [];
  for (const row of rows) {
    if (row.cells.length > sheet.columns.length && row.cells.slice(sheet.columns.length).some(Boolean)) return fail(`Row ${row.line}: review the unmapped extra columns.`);
    const values = Object.fromEntries(sheet.columns.flatMap((field, index) => field ? [[field, (row.cells[index] || "").trim()]] : []));
    const sample = newPlasmidSample(samples, order.container);
    Object.assign(sample, values);
    if (values.templateType && /^(plasmid|plasmid dna|purified plasmid dna)$/i.test(values.templateType)) sample.templateType = "Plasmid DNA";
    sample.well = sample.well.toUpperCase().replace(/^([A-H])0+([1-9])$/, "$1$2");
    samples.push(sample);
  }
  const parsed = orderSchema.safeParse({ ...order, service: "WHOLE_PLASMID", submissionMode: "Whole plasmid", samples });
  if (!parsed.success) {
    const issues = parsed.error.issues.filter(issue => issue.path[0] === "samples");
    if (issues.length) return { samples: [] as SampleDraft[], errors: issues.map(issueLabel) };
  }
  return { samples, errors: [] as string[] };
}

export function plasmidTemplate(container: OrderDraft["container"], count = 8) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_REACTIONS) throw new Error("Choose 1–250 samples.");
  const headers = container === "Plate" ? ["Sample name", "Plate label", "Well", "Length (bp)", "Concentration", "Notes"] : ["Sample name", "Tube label", "Length (bp)", "Concentration", "Notes"];
  const samples: SampleDraft[] = [];
  const rows = [headers];
  for (let i = 0; i < count; i++) {
    const sample = newPlasmidSample(samples, container);
    samples.push(sample);
    rows.push(container === "Plate" ? ["", sample.plateLabel, sample.well, "", "", ""] : ["", sample.tubeLabel, "", "", ""]);
  }
  return rows.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}

export const serviceLabel = (service?: string) => service === "WHOLE_PLASMID" ? "Whole Plasmid Sequencing" : "Sanger sequencing";
