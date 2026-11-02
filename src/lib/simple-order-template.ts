import { sampleLimit, type OrderDraft } from "./order-intake";
import { verticalWell } from "./sanger-entry";

/** Blank customer fields prevent the downloaded template from becoming an accidental order. */
export function simpleOrderTemplate(container: OrderDraft["container"], count: number, mode: OrderDraft["submissionMode"] = "Standard") {
  const limit = sampleLimit("SANGER");
  if (!Number.isInteger(count) || count < 1 || count > limit) throw new Error(`Choose 1–${limit} samples.`);
  if (mode === "Ready to load") throw new Error("This submission type is no longer offered. Choose Standard or Pre-mixed.");
  const rows: string[][] = [["Sample name", ...(container === "Plate" ? ["Plate label", "Well"] : ["Tube label"]), "DNA type", "Length (bp)", "DNA concentration (ng/uL)", "Primer", ...(mode === "Standard" ? ["Primer concentration (pmol/uL)"] : []), "Notes"]];
  for (let i = 0; i < count; i++) {
    rows.push(["", ...(container === "Plate" ? [`Plate-${Math.floor(i / 96) + 1}`, verticalWell(i)] : [`Tube-${i + 1}`]), "Plasmid DNA", "", "", "", ...(mode === "Standard" ? [""] : []), ""]);
  }
  return rows.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}
