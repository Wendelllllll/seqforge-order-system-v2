# Existing SeqForge customer workflow and template compatibility

Observed in the authenticated customer UI on 2026-10-05 (Pacific time). Only public sample templates are included in this repository; no customer records or payment details were copied. No order was submitted and the existing cart remained empty.

## Sanger entry

1. Choose priority (Standard / Same Day), container (Tube / Plate), and preparation mode (Ready to Load / Pre-mixed / Standard).
2. Choose online entry or spreadsheet upload.
3. Online entry asks for a project name and number of sequences before creating rows. The Plate page advertises 1–768 and a 96-row Sanger table was successfully opened.
4. Wells are ordered down columns: A1, B1, … H1, A2, … H12. The table includes plate label, DNA name/type/length/concentration, customer/stored primer input, public primer selection, primer concentration, and special protocol. Column controls expose fill, numbering, alternating primer fill and clearing. There are bulk add/delete-row controls.
5. The “Enter Primers?” checkbox redirects to an oligo-entry branch. With 96 selected this branch displayed a 95-per-plate limit. The sequencing table's footer also contains 95-well wording despite displaying 96 rows. This is inconsistent legacy UI, not confirmation that a well must be reserved for a control. Confirm actual laboratory policy before implementing such a restriction.
6. Next action is “Validate and continue”. The final validation, add-to-cart and checkout sequence was not exercised because this was an actual customer's account.

## Upload path and original files

The upload screen asks for project name, CSV/TXT file type and a file, or pasted delimited rows. It explicitly asks customers to save Excel as CSV or TXT; direct XLSX upload is not offered there.

Observed download URLs:
- https://order.seqforge.com/8UHZGYT67/excel/LIMS_Upload_template.xlsx
- https://order.seqforge.com/8UHZGYT67/excel/sample_dnaForm.csv
- https://order.seqforge.com/8UHZGYT67/excel/sample_text_dnaForm.txt

SeqForge-branded copies are in `public/templates/`; only the public primer column title has been updated. The Excel file is an example workbook (96 data rows), not an empty order. CSV/TXT also contain example rows; replace these before ordering.

Current branded columns, in the original order:

`#`, `wellID`, `Tube label`, `DNA Name`, `DNA Type`, `Template Length (bp)`, `Conc. (ng/uL)`, `My primers`, `Conc. (pmol/uL)`, `SeqForge Primers`, `Special protocol`.

The CSV has trailing empty columns and rows. The TXT uses tabs. Even the plate template calls its container-label column `Tube label`. The inline paste example uses compact headings, with both concentration headings called `Conc`; positions distinguish them.

## Local implementation

- New whole-plate builder creates 1–96 wells in column or row order, with shared customer-supplied/included primer name and editable sample names. Existing populated samples remain intact. Plate rows use a compact table, with optional full details.
- Templates retain the original column order with SeqForge branding. CSV/TXT and their spreadsheet-paste equivalents import alongside the extended V4 format. Excel is still exported as CSV/TXT, matching the existing site's workflow.
- `Tube label` maps to plate label when Plate is selected, otherwise tube label. Original row numbers generate internal IDs; consistent repeated physical locations group reactions without merging different sample metadata silently.
- Plasmid/PCR/BAC and preparation combinations map to separate new template/preparation fields. Special protocol spellings are translated. Nanopore values are rejected in this Sanger importer rather than misclassified.
- Both original sample files populate customer and public primer columns in the same row. Old precedence has NOT been established. Default behavior asks the user to choose; the UI offers an explicit preferred source when both are filled. One source is imported per row, so a sample never silently doubles the reaction count.
- `My primers` currently maps to customer-supplied. The old account's stored primer catalogue is not migrated; the user must review stored-primer source/reference in Details. No stored reference or concentration is invented.
- Blank premixed/ready-to-load primer identity is represented as `Included in mix`; Standard requires a primer. Original validation still applies and failed imports leave the current draft unchanged.

## Account and checkout observations

Customer navigation exposes order history, My Primers, Saved Carts, Custom Prices, pickup service, lab-member management, credit memos, open invoices, and Default Drop Box. Presence of an entry does not establish full behavior or successful backend operation.

The profile separates contact details, billing/shipping and payment information. Billing/shipping fields include recipient, organization, email, address lines, city/state/postcode/country, phone and a copy-address control. Default Drop Box is a selectable saved location with collection/address information, not only a free-text pickup note.

The cart groups projects by service and exposes an accounting view. No final checkout or payment operation was performed. Actual price agreements, financial balances and customer contact details were not copied into this report.

## Remaining migration work

- Reconcile the new 250-reaction demo limit with legacy multi-plate workflows advertising up to 768; review backend storage, pricing, performance and laboratory controls before changing it.
- Add column fill/alternating-primer operations beyond existing sample/preparation copy, and scope bulk editing by plate.
- Migrate or integrate stored primers and approved customer-specific prices with account-scoped access.
- Add saved drafts/carts, reorder flow and explicit pickup/drop-box selection if required for first launch.
- Validate checkout and notifications using a dedicated test account or staging environment. Do not infer end-to-end equivalence from template compatibility.

## Verification

Lint and TypeScript checks, plus tests covering original CSV/TXT, compact headers, both-primer ambiguity, template/preparation/protocol conversion, invalid data, tube/premix handling, 96-well generation and import. Browser import preview checked separately. No live customer order submitted.
