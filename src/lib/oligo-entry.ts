import { readDelimited } from "./order-import";
import { MAX_IMPORT_BYTES } from "./order-intake";
import { MAX_OLIGOS, OLIGO_PURIFICATIONS, OLIGO_SCALES, oligoSchema, type OligoDraft } from "./oligo-schema";
import type { MappingSheet } from "./sanger-column-mapping";

export const MAX_OLIGO_ROWS = MAX_OLIGOS;
export const OLIGO_MAPPING_FIELDS = [
  ["", "Ignore this column"], ["name", "Oligo name *"], ["sequence", "DNA sequence (5′ to 3′) *"],
  ["synthesisScale", "Synthesis scale requested"], ["purification", "Purification requested"],
  ["modification5", "5′ modification request"], ["modification3", "3′ modification request"],
  ["modificationInternal", "Internal modification request"], ["notes", "Oligo notes"],
] as const;

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, keyof OligoDraft> = {
  name: "name", oligo: "name", oligoname: "name",
  primername: "name", samplename: "name", oligoid: "name", id: "name",
  sequence: "sequence", dnasequence: "sequence", oligosequence: "sequence", primersequence: "sequence",
  sequence5to3: "sequence", sequence53: "sequence", dnasequence5to3: "sequence", sequence5to3required: "sequence",
  scale: "synthesisScale", synthesisscale: "synthesisScale", synthesisscalerequested: "synthesisScale",
  purification: "purification", purificationrequested: "purification",
  modification5: "modification5", modification5prime: "modification5", "5modification": "modification5", "5modificationrequest": "modification5", "5primemodification": "modification5", "5mod": "modification5",
  modification3: "modification3", modification3prime: "modification3", "3modification": "modification3", "3modificationrequest": "modification3", "3primemodification": "modification3", "3mod": "modification3",
  modificationinternal: "modificationInternal", internalmodification: "modificationInternal", internalmodificationrequest: "modificationInternal", internalmod: "modificationInternal",
  notes: "notes", oligonotes: "notes", comments: "notes", comment: "notes",
};

export function blankOligo(): OligoDraft {
  return { name: "", sequence: "", synthesisScale: "25 nmol", purification: "Desalted", modification5: "", modification3: "", modificationInternal: "", notes: "" };
}

export function oligoBaseCount(items: Pick<OligoDraft, "sequence">[]) {
  return items.reduce((total, item) => total + (item.sequence.match(/[ACGTRYSWKMBDHVN]/gi)?.length ?? 0), 0);
}

export function suggestOligoMapping(rows: MappingSheet["rows"], hasHeader: boolean): string[] {
  const width = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  return Array.from({ length: width }, (_, index) => hasHeader ? aliases[normalizeHeader(rows[0]?.cells[index] || "")] || "" : "");
}

export function inspectOligoSheet(text: string): MappingSheet {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error("The import is larger than 1 MB.");
  const rows = readDelimited(text);
  if (!rows.length) throw new Error("Paste or upload at least one oligo row.");
  if (rows.length > MAX_OLIGO_ROWS + 1) throw new Error(`Import at most ${MAX_OLIGO_ROWS} data rows.`);
  if (rows.some(row => row.cells.length > 100)) throw new Error("Import at most 100 columns. Remove unused columns first.");
  const firstFields = rows[0].cells.map(cell => aliases[normalizeHeader(cell)]);
  const hasHeader = firstFields.includes("name") && firstFields.includes("sequence");
  return { rows, hasHeader, columns: suggestOligoMapping(rows, hasHeader) };
}

const normalizeChoice = (value: string) => value.toLowerCase().replace(/[µμ]/g, "u").replace(/\s/g, "");
function choice(value: string, options: readonly string[], fallback: string) {
  if (!value.trim()) return fallback;
  return options.find(option => normalizeChoice(option) === normalizeChoice(value)) || value;
}

export function parseMappedOligos(sheet: MappingSheet): { oligos: OligoDraft[]; errors: string[] } {
  const fail = (errors: string[]) => ({ oligos: [] as OligoDraft[], errors });
  const fields = sheet.columns.filter(Boolean);
  const missing = (["name", "sequence"] as const).filter(field => !fields.includes(field));
  if (missing.length) return fail(missing.map(field => `Map a column to ${field === "name" ? "Oligo name" : "DNA sequence (5′ to 3′)"}.`));
  if (new Set(fields).size !== fields.length) return fail(["Each destination field can be mapped only once. Ignore duplicate columns or choose another field."]);
  if (fields.some(field => !OLIGO_MAPPING_FIELDS.some(([value]) => value === field))) return fail(["Choose supported destination fields."]);
  const rows = sheet.rows.slice(sheet.hasHeader ? 1 : 0);
  if (!rows.length || rows.length > MAX_OLIGO_ROWS) return fail([`Import between 1 and ${MAX_OLIGO_ROWS} data rows.`]);
  const errors: string[] = [];
  const oligos: OligoDraft[] = [];
  const names = new Map<string, number>();
  for (const row of rows) {
    if (row.cells.length > sheet.columns.length && row.cells.slice(sheet.columns.length).some(cell => cell.trim())) {
      errors.push(`Row ${row.line}: unmapped extra columns. Review the column mapping again.`);
      continue;
    }
    const values = Object.fromEntries(sheet.columns.flatMap((field, index) => field ? [[field, row.cells[index] || ""]] : []));
    const candidate = { ...blankOligo(), ...values,
      synthesisScale: choice(values.synthesisScale || "", OLIGO_SCALES, "25 nmol"),
      purification: choice(values.purification || "", OLIGO_PURIFICATIONS, "Desalted"),
    };
    const parsed = oligoSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map(issue => `Row ${row.line} · ${OLIGO_MAPPING_FIELDS.find(([field]) => field === issue.path[0])?.[1] || String(issue.path[0])}: ${issue.message}`));
      continue;
    }
    const key = parsed.data.name.toLowerCase();
    const previousLine = names.get(key);
    if (previousLine !== undefined) errors.push(`Row ${row.line}: oligo name “${parsed.data.name}” is also used in row ${previousLine}. Give each oligo a unique name.`);
    else names.set(key, row.line);
    oligos.push(parsed.data);
  }
  return errors.length ? fail(errors) : { oligos, errors: [] };
}

export function oligoTemplate() {
  return "Oligo name,Sequence (5' to 3'),Synthesis scale,Purification,5' modification,3' modification,Internal modification,Notes\r\n";
}
