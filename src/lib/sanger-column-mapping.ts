import { IMPORT_COLUMNS, readDelimited } from "./order-import";
import { MAX_IMPORT_BYTES, MAX_REACTIONS, type OrderDraft, type SampleDraft } from "./order-intake";
import { parseSangerPaste, sangerColumnAliases } from "./sanger-entry";

export const MAPPING_FIELDS = [
  ["", "Ignore this column"], ["sampleName", "Sample name *"], ["tubeLabel", "Tube label"],
  ["plateLabel", "Plate label"], ["well", "Well position"], ["templateType", "DNA type"],
  ["templateLength", "DNA length (bp)"], ["concentration", "DNA concentration (ng/µL)"],
  ["primerName", "Primer name(s)"], ["primerSource", "Primer source"],
  ["customerPrimer", "Customer primer names (old template)"], ["universalPrimer", "SeqForge primer names (old template)"],
  ["primerConcentration", "Primer concentration (pmol/µL)"], ["preparation", "Preparation"],
  ["specialProtocol", "Special protocol"], ["notes", "Sample notes"], ["sampleKey", "Sample ID"],
  ["storedPrimerReference", "Stored primer reference"], ["primerSequence", "Primer sequence"],
  ["purification", "Primer purification"], ["synthesisScale", "Synthesis scale"],
  ["modification5", "5′ modification"], ["modification3", "3′ modification"], ["modificationInternal", "Internal modification"],
] as const;
export type MappingSource = "" | "Customer supplied" | "SeqForge universal primer" | "column" | "primer-columns" | "Included in mix";
export type MappingSheet = { rows: ReturnType<typeof readDelimited>; hasHeader: boolean; columns: string[] };
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function suggestMapping(rows: MappingSheet["rows"], hasHeader: boolean, container: OrderDraft["container"]) {
  const width = Math.max(...rows.map(row => row.cells.length));
  return Array.from({ length: width }, (_, index) => {
    // Headerless data is deliberately not guessed from numeric cell positions.
    if (!hasHeader) return "";
    const name = normalize(rows[0]?.cells[index] || "");
    if (["myprimers", "myprimer"].includes(name)) return "customerPrimer";
    if (["seqforgeprimers", "seqforgeprimer"].includes(name)) return "universalPrimer";
    if (name === "concpmolul") return "primerConcentration";
    const oldTemplate = rows[0]?.cells[0] === "#" && rows[0]?.cells.some(c => normalize(c) === "myprimers");
    if (oldTemplate && container === "Plate" && name === "tubelabel") return "plateLabel";
    return sangerColumnAliases[name] || "";
  });
}

export function inspectSangerSheet(text: string, container: OrderDraft["container"]): MappingSheet {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error("The import is larger than 1 MB.");
  const rows = readDelimited(text);
  if (!rows.length) throw new Error("Paste or upload at least one sample row.");
  if (rows.length > MAX_REACTIONS + 1) throw new Error(`Import at most ${MAX_REACTIONS} data rows.`);
  if (rows.some(row => row.cells.length > 100)) throw new Error("Import at most 100 columns. Remove unused columns first.");
  const hasHeader = rows[0].cells.some(cell => sangerColumnAliases[normalize(cell)] === "sampleName") || rows[0].cells[0] === "#";
  return { rows, hasHeader, columns: suggestMapping(rows, hasHeader, container) };
}

export function parseMappedSanger(sheet: MappingSheet, order: Omit<OrderDraft, "samples">, source: MappingSource) {
  const fail = (message: string) => ({ samples: [] as SampleDraft[], errors: [message] });
  if (order.submissionMode === "Ready to load") return fail("This submission type is no longer offered. Choose Standard or Pre-mixed.");
  const fields = sheet.columns.filter(Boolean);
  if (!fields.includes("sampleName")) return fail("Map a column to Sample name.");
  if (new Set(fields).size !== fields.length) return fail("Each destination field can be mapped only once. Ignore duplicate columns or choose another field.");
  if (fields.some(field => !MAPPING_FIELDS.some(([value]) => value === field))) return fail("Choose supported destination fields.");
  const data = sheet.rows.slice(sheet.hasHeader ? 1 : 0);
  if (!data.length || data.length > MAX_REACTIONS) return fail(`Import between 1 and ${MAX_REACTIONS} data rows.`);
  const standard = order.submissionMode === "Standard";
  if (!source || (!standard && source !== "Included in mix")) return fail(standard ? "Explicitly choose where the primers come from." : "Confirm that DNA and one primer are already mixed in each tube or well.");
  const splitPrimers = fields.includes("customerPrimer") || fields.includes("universalPrimer");
  if (splitPrimers && fields.includes("primerName")) return fail("Map either Primer name(s) or the old template primer columns, not both.");
  if (standard && source === "column" && !fields.includes("primerSource")) return fail("Map your source column to Primer source.");
  if (standard && source === "primer-columns" && !splitPrimers) return fail("Map the old template customer / SeqForge primer columns.");
  if (standard && splitPrimers && source !== "primer-columns") return fail("Choose the old template primer-column source option, or map one primer column to Primer name(s) and ignore the other.");
  if (standard && fields.includes("primerSource") && source !== "column") return fail("Choose Use the Primer source column, or explicitly ignore that column to use one source for all rows.");
  if (standard && !fields.includes("primerName") && !splitPrimers) return fail("Map a column to Primer name(s).");
  const output: Record<string, string>[] = [];
  for (const row of data) {
    if (row.cells.length > sheet.columns.length && row.cells.slice(sheet.columns.length).some(Boolean)) return fail(`Row ${row.line}: unmapped extra columns. Review the column mapping again.`);
    const values = Object.fromEntries(sheet.columns.flatMap((field, index) => field ? [[field, row.cells[index] || ""]] : []));
    if (splitPrimers) {
      if (values.customerPrimer && values.universalPrimer) return fail(`Row ${row.line}: both primer-name columns are filled. Split into separate reaction rows or ignore one column explicitly.`);
      values.primerName = values.customerPrimer || values.universalPrimer || "";
      if (standard) values.primerSource = values.universalPrimer ? "SeqForge universal primer" : "Customer supplied";
      delete values.customerPrimer; delete values.universalPrimer;
    }
    if (standard) {
      if (source === "column" && !values.primerSource) return fail(`Row ${row.line}: Primer source is blank. Fill every row or select a single source for all rows.`);
      if (source !== "column" && source !== "primer-columns") values.primerSource = source;
    } else {
      if (values.primerSource && values.primerSource !== "Included in mix") return fail(`Row ${row.line}: ${order.submissionMode} requires Included in mix, with no separate primer supply. Correct or explicitly ignore the source column.`);
      values.primerSource = "Included in mix";
    }
    const type = normalize(values.templateType || "");
    if (type === "plasmidneedsminiprep") { values.templateType = "Plasmid DNA"; values.preparation ||= "Miniprep requested"; }
    if (type === "pcrneedscleanup") { values.templateType = "PCR product"; values.preparation ||= "PCR cleanup requested"; }
    output.push(values);
  }
  // Known destinations only; ignored customer columns are never submitted.
  const columns = IMPORT_COLUMNS.filter(field => output.some(row => field in row));
  const csv = [columns, ...output.map(row => columns.map(column => row[column] || ""))]
    .map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  return parseSangerPaste(csv, order, "", "Plasmid DNA", true);
}
