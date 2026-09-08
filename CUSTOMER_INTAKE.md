# Customer ordering demo — September 7, 2026

This iteration models the Sanger intake fields observed in SeqForge's existing customer portal. It is a local demo, not a production ordering or pricing service.

## Customer workflow

1. Enter the project reference, optional PO and handling instructions.
2. Request Standard or Same day priority; select Tubes or Plate and Standard, Pre-mixed or Ready to load submission.
3. Enter each physical DNA sample once. Give it an order-local sample ID, DNA name, and either a unique tube label or plate label plus well.
4. Add one or more primer reactions to each Standard sample. Premixed/ready-to-load locations each represent one reaction with an Included in mix primer.
5. Optionally import a CSV/TSV/TXT file or paste spreadsheet cells with headers. Validate first, inspect the preview, then explicitly replace the sample list.
6. Review the full manifest, return to edit if necessary, and confirm submission.
7. Open the saved order and its printable manifest. Administrators see the same persisted information, can update status, and deliver a result through the existing upload workflow.

New records appear in customer history and the admin queue with separate physical-sample/reaction counts and service choices.

## Samples and primers

Sample fields: sample ID, DNA name, tube label, plate label/well, template type, template length in bp, DNA concentration in ng/µL, preparation request, and notes. Length and concentration may be unknown; if entered they must be positive numbers, with integer base-pair length.

Primer sources:

- **Customer supplied:** primer name and optional concentration in pmol/µL.
- **SeqForge universal primer:** a selection from the 23 names observed in the current portal.
- **Stored at SeqForge:** primer name and a required lab reference. This is a request; the demo has no primer inventory integration.
- **SeqForge synthesized primer:** primer name, required 5′ to 3′ IUPAC DNA sequence, requested purification/scale, and optional 5′, 3′ and internal modification descriptions.
- **Included in mix:** primer identification for a premixed or ready-to-load physical reaction.

Each reaction also records a special protocol request. Stored-primer availability, synthesis feasibility, modifications, preparation services, pricing and turnaround require lab confirmation.

## Import format

Download the template from the form after selecting the container and mode. Each row is one reaction. To sequence the same DNA with two primers, repeat the same sampleKey and all sample fields in two rows, changing only the reaction fields.

Required headers: sampleKey, sampleName, templateType, primerSource, primerName, plus tubeLabel for tubes or plateLabel and well for plates. Header spelling is case-sensitive. Optional columns are included in the downloaded template.

Sample columns:

```text
sampleKey,sampleName,tubeLabel,plateLabel,well,templateType,templateLength,concentration,preparation,notes
```

Reaction columns:

```text
primerSource,primerName,primerConcentration,storedPrimerReference,primerSequence,purification,synthesisScale,modification5,modification3,modificationInternal,specialProtocol
```

Quoted commas, escaped double quotes, quoted newlines, BOM, CRLF and tab-separated paste are supported. Import is all-or-nothing: malformed rows, unknown/duplicate headers, conflicting sample metadata, invalid primer data and duplicate physical locations block replacement. Errors identify physical source row numbers. Legacy portal column names are not silently converted; use the V2 template.

Demo limits: 1 MB per import and 250 reactions per order. These are application limits, not confirmed lab capacity. Plate mapping validates A1–H12 and supports different named plates; no assumption is made about a reserved control well or the legacy 95-sample acceptance policy.

## Data and migration

Run `npm run setup` after pulling this update. The additive migration preserves every existing order, sample, status entry and result association. It creates one Reaction for each legacy Sample and marks older orders with intakeVersion=1. Legacy screens identify unrecorded service/container information instead of representing new defaults as historical choices.

New orders use intakeVersion=2 and nested Sample → Reaction records. Original Sample.primerName/primerSource columns remain as compatibility fields populated from the first reaction; current views read Reaction records. No migration attempts to infer whether separate old sample entries represented the same physical DNA.

The same Zod schema validates the browser review and POST /api/orders. The API ignores caller-provided ownership/status fields, rejects invalid JSON and foreign origins, and creates the entire order in one transaction. Number allocation happens in that transaction; production-grade idempotency and high-concurrency operation remain future work.

The authenticated /manifest/[id] route allows only the owner or an admin. The print layout hides controls, wraps long values and repeats table headers.

## Verification

- `npm run verify`: lint, route types, TypeScript, automated validation/import/migration/persistence tests, and the production build.
- With the local application running on port 3000, `npm run test:smoke` exercises registration/login, invalid requests, persisted customer/admin manifests, status updates, result upload/download, and cross-customer isolation. It creates synthetic accounts, orders and a text result in the local demo database. It does not contact the live SeqForge portal.
- Browser checks cover spreadsheet conflict correction, multi-primer import, review/edit preservation, submission, and the saved manifest.

## Before a customer opens a public link

Deploy a separate staging environment with persistent storage and individual accounts. Replace public demo credentials, configure the real origin, and verify recovery, permissions, backups and result handling there. Confirm lab service rules and test representative customer files. Pricing, payment, shipping/pickup, inventory, ABI/LIMS integration, clinical ordering and production legacy-data migration are outside this iteration.

Source of observed field names and choices: the authenticated SeqForge customer portal at https://order.seqforge.com/dna_sequencing/. Checkout and mode-specific lab acceptance rules were not exercised.
