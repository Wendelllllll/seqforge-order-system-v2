import { IMPORT_COLUMNS, readDelimited } from "./order-import";
import { importRowLimit, MAX_IMPORT_BYTES, type OrderDraft, type SampleDraft } from "./order-intake";
import { parseSangerPaste, sangerColumnAliases, type PrimerCommaMode } from "./sanger-entry";

export const MAPPING_FIELDS = [
  ["", "Ignore this column"], ["sampleName", "Sample name *"], ["tubeLabel", "Tube label"],
  ["plateLabel", "Plate label"], ["well", "Well position"], ["templateType", "DNA type"],
  ["templateLength", "DNA length (bp)"], ["concentration", "DNA concentration (ng/µL)"],
  ["primerName", "Primer name(s)"], ["primerSource", "Primer source"],
  ["customerPrimer", "Customer-supplied primer names"], ["universalPrimer", "SeqForge stock primer names"],
  ["primerConcentration", "Primer concentration (pmol/µL)"], ["preparation", "Preparation"],
  ["specialProtocol", "Special protocol"], ["notes", "Sample notes"], ["sampleKey", "Sample ID"],
  ["storedPrimerReference", "Stored primer reference"], ["primerSequence", "Primer sequence"],
  ["purification", "Primer purification"], ["synthesisScale", "Synthesis scale"],
  ["modification5", "5′ modification"], ["modification3", "3′ modification"], ["modificationInternal", "Internal modification"],
] as const;
export type MappingSource = "" | "Customer supplied" | "SeqForge universal primer" | "Stored at SeqForge" | "column" | "primer-columns" | "Included in mix";
const SYNTHESIS_FIELDS = new Set(["primerSequence", "purification", "synthesisScale", "modification5", "modification3", "modificationInternal"]);
const ADDITIONAL_FIELDS = new Set(["sampleKey", "preparation", "specialProtocol", "primerSource", "customerPrimer", "universalPrimer"]);
type MappingContext = { container: OrderDraft["container"]; standard: boolean; source: MappingSource };

/** Keep recognized but incompatible columns visible until the customer explicitly ignores or remaps them. */
export function sangerMappingFieldAllowed(field: string, { container, standard }: MappingContext) {
  if (SYNTHESIS_FIELDS.has(field)) return false;
  if (container === "Tubes" ? ["plateLabel", "well"].includes(field) : field === "tubeLabel") return false;
  if (!standard && ["primerSource", "primerConcentration", "storedPrimerReference", "customerPrimer", "universalPrimer", "preparation"].includes(field)) return false;
  return true;
}

export function sangerMappingOptions(context: MappingContext, additional = false, current = "") {
  return MAPPING_FIELDS.filter(([field]) => field === current || (
    sangerMappingFieldAllowed(field, context) &&
    (additional || !ADDITIONAL_FIELDS.has(field)) &&
    (field !== "primerConcentration" || !["SeqForge universal primer", "Stored at SeqForge"].includes(context.source)) &&
    (field !== "storedPrimerReference" || context.source === "Stored at SeqForge" || context.source === "column")
  ));
}
export type MappingSheet = { rows: ReturnType<typeof readDelimited>; hasHeader: boolean; columns: string[]; primerCommaMode?: PrimerCommaMode };
export function hasPrimerCommas(sheet: MappingSheet) {
  const indices = sheet.columns.flatMap((field, index) => ["primerName", "customerPrimer", "universalPrimer"].includes(field) ? [index] : []);
  return sheet.rows.slice(sheet.hasHeader ? 1 : 0).some(row => indices.some(index => row.cells[index]?.includes(",")));
}
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

export function inspectSangerSheet(text: string, container: OrderDraft["container"], service: OrderDraft["service"] = "SANGER"): MappingSheet {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error("The import is larger than 1 MB.");
  const rows = readDelimited(text);
  if (!rows.length) throw new Error("Paste or upload at least one sample row.");
  if (rows.length > importRowLimit(service) + 1) throw new Error(`Import at most ${importRowLimit(service)} data rows.`);
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
  if (!data.length || data.length > importRowLimit(order.service)) return fail(`Import between 1 and ${importRowLimit(order.service)} data rows.`);
  const standard = order.submissionMode === "Standard";
  const incompatible = fields.filter(field => !sangerMappingFieldAllowed(field, { container: order.container, standard, source }));
  if (incompatible.length) return fail(`These columns do not apply to this submission: ${incompatible.map(field => MAPPING_FIELDS.find(([value]) => value === field)?.[1] || field).join(", ")}. Explicitly ignore or remap them before importing.`);
  if (!source || (!standard && source !== "Included in mix")) return fail(standard ? "Explicitly choose where the primers come from." : "Confirm that DNA and one primer are already mixed in each tube or well.");
  const splitPrimers = fields.includes("customerPrimer") || fields.includes("universalPrimer");
  if (splitPrimers && fields.includes("primerName")) return fail("Use either one Primer name(s) column or separate customer / SeqForge primer columns. Ignore the columns you do not need.");
  if (standard && source === "column" && !fields.includes("primerSource")) return fail("Map your source column to Primer source.");
  if (standard && source === "primer-columns" && !splitPrimers) return fail("Your columns have changed. Choose where the primers come from again.");
  if (standard && splitPrimers && source !== "primer-columns") return fail("Confirm the primer sources shown in your separate customer / SeqForge columns, or map one column to Primer name(s) and ignore the other.");
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
  return parseSangerPaste(csv, order, "", "Plasmid DNA", true, sheet.primerCommaMode);
}
