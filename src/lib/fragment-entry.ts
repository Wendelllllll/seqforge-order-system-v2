import { blankSample, issueLabel, orderSchema, type OrderDraft, type SampleDraft } from "./order-intake";
import { FRAGMENT_MAX_SAMPLES } from "./fragment-analysis";
import { verticalWell } from "./sanger-entry";
import type { MappingSheet } from "./sanger-column-mapping";

export const FRAGMENT_MAPPING_FIELDS = ["", "sampleName", "tubeLabel", "plateLabel", "well", "notes", "sampleKey"];
export function newFragmentSample(samples: SampleDraft[], container: OrderDraft["container"]): SampleDraft {
  const occupied = new Set(samples.map(s => container === "Tubes" ? s.tubeLabel.toLowerCase() : `${s.plateLabel.toLowerCase()}/${s.well.toUpperCase()}`));
  let index = 0;
  while (occupied.has(container === "Tubes" ? `tube-${index + 1}` : `plate-${Math.floor(index / 96) + 1}/${verticalWell(index)}`)) index++;
  // Internal IDs are independent of customer-supplied tube/plate names.
  const keys = new Set(samples.map(s => s.sampleKey.trim().toLowerCase()));
  let keyIndex = samples.length + 1;
  while (keys.has(`f${keyIndex}`)) keyIndex++;
  const key = `F${keyIndex}`;
  return { ...blankSample(key), templateType: "PCR product", reactions: [], tubeLabel: container === "Tubes" ? `Tube-${index + 1}` : "", plateLabel: container === "Plate" ? `Plate-${Math.floor(index / 96) + 1}` : "", well: container === "Plate" ? verticalWell(index) : "" };
}
export function fragmentTemplate(container: OrderDraft["container"], count = 8) {
  if (!Number.isInteger(count) || count < 1 || count > FRAGMENT_MAX_SAMPLES) throw new Error(`Choose 1–${FRAGMENT_MAX_SAMPLES} samples.`);
  const columns = container === "Plate" ? ["Sample name", "Plate label", "Well", "Notes"] : ["Sample name", "Tube label", "Notes"];
  return [columns, ...Array.from({ length: count }, (_, i) => container === "Plate" ? ["", `Plate-${Math.floor(i / 96) + 1}`, verticalWell(i), ""] : ["", `Tube-${i + 1}`, ""])].map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}
export function parseMappedFragment(sheet: MappingSheet, order: Omit<OrderDraft, "samples">) {
  const fail = (message: string) => ({ samples: [] as SampleDraft[], errors: [message] });
  const fields = sheet.columns.filter(Boolean);
  if (!fields.includes("sampleName")) return fail("Map a column to Sample name.");
  if (new Set(fields).size !== fields.length) return fail("Each destination field can be mapped only once.");
  const allowed = FRAGMENT_MAPPING_FIELDS.filter(field => order.container === "Plate" ? field !== "tubeLabel" : !["plateLabel", "well"].includes(field));
  if (fields.some(field => !allowed.includes(field))) return fail("Fragment Analysis uses sample names, locations and notes. Explicitly ignore or remap the other columns.");
  if (order.container === "Plate" && (!fields.includes("plateLabel") || !fields.includes("well"))) return fail("Map both Plate label and Well position to preserve the physical sample locations.");
  const rows = sheet.rows.slice(sheet.hasHeader ? 1 : 0);
  if (!rows.length || rows.length > FRAGMENT_MAX_SAMPLES) return fail(`Import between 1 and ${FRAGMENT_MAX_SAMPLES} sample rows.`);
  const samples: SampleDraft[] = [];
  for (const row of rows) {
    if (row.cells.length > sheet.columns.length && row.cells.slice(sheet.columns.length).some(Boolean)) return fail(`Row ${row.line}: review the unmapped extra columns.`);
    const values = Object.fromEntries(sheet.columns.flatMap((field, i) => field ? [[field, (row.cells[i] || "").trim()]] : []));
    const sample = { ...newFragmentSample(samples, order.container), ...values };
    samples.push(sample);
  }
  const parsed = orderSchema.safeParse({ ...order, service: "FRAGMENT_ANALYSIS", submissionMode: "Fragment analysis", samples });
  if (!parsed.success) {
    const issues = parsed.error.issues.filter(issue => issue.path[0] === "samples");
    if (issues.length) return { samples: [] as SampleDraft[], errors: issues.map(issueLabel) };
  }
  return { samples: samples.map(s => ({ ...s, well: s.well.toUpperCase().replace(/^([A-H])0+([1-9])$/, "$1$2") })), errors: [] as string[] };
}
