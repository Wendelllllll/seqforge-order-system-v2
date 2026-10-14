# SeqForge Order System V4

SeqForge's customer ordering portal and laboratory order workflow, built with Next.js 16, React 19, TypeScript, Better Auth, Prisma 6 and PostgreSQL. Sanger and Whole Plasmid ordering are implemented; independent Oligo ordering is still a service placeholder. V4 runs locally against PostgreSQL; public production deployment is still pending.

Repository: [Wendelllllll/seqforge-order-system-v2](https://github.com/Wendelllllll/seqforge-order-system-v2). The repository name is retained for continuity.

## V4 customer workflow

- Order names are optional and reusable; order numbers identify submissions. Idempotent submission retries return the original order.
- Tube and 96-well plate orders use separate choices, sample fields and CSV templates. Submit mixed containers as separate orders.
- Manual entry, Excel cell paste and CSV/TSV/TXT upload support column mapping, ignored extra columns, validation and preview. Applying the preview replaces the editable sample list. Native Excel workbook uploads are not supported. Order names, PO numbers, pickup and billing are not imported from sample spreadsheets.
- Guests can choose a service and fill in samples before signing in at submission. Same-browser drafts persist for up to 30 days, with a continue/reset choice on return; unfinished drafts do not create administrator orders. Drafts are isolated by service and signed-in account and are not synced between computers.
- Account → Reusable order details saves pickup location/instructions, contact name/phone, PI, billing organization/contact/email/address and payment method. New orders prefill these fields; each order can override them. Use the explicit save-defaults button to change future defaults. No cross-account or lab-wide sharing is enabled.
- Invoice and Purchase order record billing intent only; PO billing requires a PO number on that order. Credit card is unavailable. No charges, invoice emails, pickup bookings or payment-provider calls occur.
- Each new order saves a pickup/billing snapshot, visible in customer, admin and printable manifests. Editing account defaults never changes historical snapshots. Old orders are explicitly marked when these details were not recorded.

Upgrade an existing V3 checkout: stop the app, back up PostgreSQL and result storage, run `npm ci`, `npm run setup`, then `npm run dev`. The additive migration preserves existing orders and account data. The application rejects old submission payloads without required V4 pickup/billing details; reload older open forms before submitting.

## Website and account updates (September 2026)

- Public homepage and customer/admin portals share the same application and order backend. The homepage remains available when signed in.
- Navy and mint SeqForge website with a WebGL DNA hero, connected laboratory interactions, responsive navigation, and matching login/customer/admin portal styling. See [frontend integration](FRONTEND_INTEGRATION.md) for routing and scope.
- Public order buttons open the guest-accessible service chooser. The homepage price console reads the active database rates for all three Sanger submission types and both Whole Plasmid size bands, with direct links into ordering. Other service inquiries use Contact.
- Account information supports editing first/last name, organization, laboratory and phone through an authenticated, validated endpoint. Login email remains read-only; pickup/billing defaults are saved separately.
- Production launch tasks and estimates are recorded in `V4_TO_LAUNCH_ROADMAP.md`. This repository update does not deploy the service or enable live card payments.

## Sequencing prices

Initial Sanger USD rates per sequencing reaction, including partially filled plates (administrator changes in each database take precedence):

| Container | Standard | Pre-mixed | Ready to load |
| --- | ---: | ---: | ---: |
| Plate | $4.50 | $3.50 | $2.50 |
| Tubes | $5.50 | $4.50 | $3.50 |

A full pre-mixed 96-well plate costs $336 for sequencing. Multiple primers on a sample count as separate reactions. Calculations use integer cents. The server calculates and saves a versioned price snapshot with each new order; client-supplied totals are not trusted. Older orders retain their original data without retroactive prices.

Whole Plasmid defaults to **$5 per sample up to and including 12,000 bp**, and **$15 per sample above 12,000 bp**, for both tubes and plates. Mixed-size orders are totaled by size band. Missing sizes retain an explicitly provisional base-rate estimate and require laboratory confirmation. The size-tier migration adds the new rates, preserves previously configured rates, advances the pricing revision and leaves historical order snapshots unchanged.

Shown amounts are sequencing subtotals, excluding shipping and taxes. Synthesis, preparation, special protocols, rush handling and additional instructions require review for extra charges. No payment is collected. Customer-specific prices and coupons are not implemented.

## Admin pricing and order search

`/admin/pricing` manages ten USD unit rates: Standard, Pre-mixed and Ready to load Sanger in tubes/plates (per reaction), and two Whole Plasmid size bands in tubes/plates (per sample). Edits require administrator access, a change reason and a before/after confirmation. Revision checks prevent overwriting another administrator's changes; the audit log retains the editor, timestamp and old/new rates. Oligo pricing remains unconfigured.

Customer estimates use the current database schedule. Final submission sends `X-Pricing-Revision`; an outdated or missing revision returns `409 PRICE_CHANGED` with the current schedule, without creating an order. The customer must review and confirm again. Price reads and order creation share a database transaction, and existing orders always display their stored pricing snapshots. Idempotent retries return the original order even after a price change.

`/admin/orders` and the dashboard support text search, service, submission type, status and customer filters, with 25 results per page. Searches include order number/name, PO, customer name/email/organization/lab and sample names. The saved subtotal is shown without recalculating historical prices.

`/admin/customers` provides an administrator-only customer directory with name/email/organization/lab/phone search, order-activity filtering and pagination. Customer profiles show account contacts, currently saved delivery/billing defaults, order counts and searchable order history locked to that customer. Historical order contacts and prices remain unchanged. This first version is read-only; it does not modify customer accounts or send emails.

## Setup

For Windows setup, moving to another computer, and safe upgrades, follow [the current Chinese handoff guide](PC_HANDOFF_ZH.md). A fresh computer needs Node.js, a running PostgreSQL server, a separately created database, and a local `.env`; cloning GitHub does not transfer accounts, orders, result files or browser drafts. `Start-SeqForge.cmd` is a convenience launcher after setup, not an installer.

Use Node.js 22.13 or later (22.23.2 verified), and a running PostgreSQL server (18.6 verified). Install dependencies with `npm ci`. Run `npm run setup` once to create `.env` if absent; it will stop until you configure a PostgreSQL `DATABASE_URL`. Keep the generated authentication secret, and set `BETTER_AUTH_URL` to the application's origin.

After configuring the database:

```bash
npm run setup
npm run dev
```

Open [localhost:3000](http://localhost:3000). On PowerShell use `npm.cmd` if script execution policy blocks `npm`.

Optional local demo accounts: `npm run setup -- --seed-demo`. This is restricted to a local database and localhost application. Customer: `scientist@demo.local` / `DemoCustomer!2026`; administrator: `admin@seqforge.local` / `SeqForgeDemo!2026`. Set `SHOW_DEMO_ACCOUNTS="true"` only to display these on the local login page. Setup does not seed accounts by default.

## Upgrade from V2 SQLite

**Stop the application first. Back up `.env`, `prisma/dev.db` and the entire `storage/results/` directory.** Keep the old `BETTER_AUTH_SECRET` to preserve authentication continuity. Change only the database connection to a new, empty PostgreSQL database. Do not seed it before importing.

```bash
npm ci
npm run setup -- --import-sqlite prisma/dev.db
npm run dev
```

The source must have V2's customer-intake migration applied. Original SQLite schema and migrations are archived under `prisma/legacy-sqlite/`; these are not PostgreSQL migrations. The importer reads SQLite without modifying it, verifies referenced result files exist, copies accounts, sessions, orders, samples, reactions, result metadata and status history in one PostgreSQL transaction, and verifies table counts. It refuses a nonempty target. Existing order numbers initialize the monthly counter. Keep backups after validating migrated login, orders and downloads.

Result binaries remain in `storage/results/`; PostgreSQL stores their metadata. Moving computers requires transferring these files securely as well as the database. GitHub contains code and migrations, not passwords, databases or customer results.

## Reliability and verification

Order numbers use a transactional monthly database counter. Submissions require an `Idempotency-Key` UUID: retries with the same customer, key and parsed payload return the same order; a changed payload with the same key returns HTTP 409. This protects network retries while the form remains open. Reloading the form creates a new submission identity.

```bash
npm run verify       # lint, types, unit tests, production build
npm run test:db      # real PostgreSQL integration; creates and removes an isolated test schema
npm run test:smoke   # starts an isolated app/schema; removes its synthetic accounts, orders and files
```

The database test uses `DATABASE_URL` and requires permission to create a schema. It verifies migration preservation, transaction rollback, 30 concurrent distinct submissions, and eight concurrent retries. This is a correctness check, not a measured production capacity guarantee.

Smoke tests also require local PostgreSQL schema permissions. The runner copies the application into a temporary directory, starts it on a separate loopback port with a unique PostgreSQL schema and private result storage, and removes the test environment afterward. It never submits orders to the working app on port 3000. Direct invocation of `scripts/smoke-ordering.ts` without the isolated runner is blocked. Use an isolated environment for manual test submissions too; do not create synthetic orders in the working admin queue.

## Launch work still required

Provide HTTPS hosting, managed PostgreSQL or an operated database server with restore-tested backups, durable private result storage, production account provisioning and recovery, monitoring and upload controls. Validate laboratory acceptance rules and all additional fees. Current result delivery supports one downloadable file/archive per order; a staff upload updates status and becomes available when the customer refreshes. Email notifications, automated instrument integration, customer-specific pricing and payments remain future work.

See [customer intake](CUSTOMER_INTAKE.md) for detailed sample and primer fields and [the current PC handoff guide](PC_HANDOFF_ZH.md) for Windows setup. Other older technical guides may describe V2; this README supersedes their SQLite/setup/pricing instructions.
