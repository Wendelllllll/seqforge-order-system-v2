import { LEGACY_COLUMNS } from "./legacy-order-import";
import { MAX_REACTIONS, type OrderDraft } from "./order-intake";

/** Blank customer fields prevent the downloaded template from becoming an accidental order. */
export function simpleOrderTemplate(container: OrderDraft["container"], count: number, mode: OrderDraft["submissionMode"] = "Standard") {
  if (!Number.isInteger(count) || count < 1 || count > MAX_REACTIONS) throw new Error("Choose 1–250 samples.");
  if (mode === "Ready to load") {
    const rows = [container === "Plate" ? ["Sample name", "Plate label", "Well", "Primer", "Notes"] : ["Sample name", "Tube label", "Primer", "Notes"]];
    for (let i = 0; i < count; i++) rows.push(container === "Plate" ? ["", `Plate-${Math.floor(i / 96) + 1}`, `${"ABCDEFGH"[i % 8]}${Math.floor((i % 96) / 8) + 1}`, "", ""] : ["", `Tube-${i + 1}`, "", ""]);
    return rows.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
  }
  const rows: string[][] = [Array.from(LEGACY_COLUMNS)];
  for (let i = 0; i < count; i++) {
    const well = `${"ABCDEFGH"[i % 8]}${Math.floor((i % 96) / 8) + 1}`;
    rows.push([String(i + 1), container === "Plate" ? well : "", container === "Plate" ? `Plate-${Math.floor(i / 96) + 1}` : `Tube-${i + 1}`, "", "Plasmid", "", "", "", "", "", ""]);
  }
  return rows.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}
