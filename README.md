# SeqForge Order System V4

SeqForge's customer ordering portal and laboratory order workflow, built with Next.js 16, React 19, TypeScript, Better Auth, Prisma 6 and PostgreSQL. Sanger, Whole Plasmid and independent Oligo order requests are implemented. Standard Oligo pricing is implemented; special specifications require a laboratory quote, and the full quote/production workflow remains unfinished.

Repository: [Wendelllllll/seqforge-order-system-v2](https://github.com/Wendelllllll/seqforge-order-system-v2). The repository name is retained for continuity.

**Design partner:** email-verification visual review remains open. Start with [the design handoff and current file map](DESIGN_HANDOFF.md); the connection/animation treatment, real verification and draft-return behavior are implemented and should be preserved while refining the appearance.

## Live AWS test site — November 1, 2026

The public test site is **[https://seqforgebio.com](https://seqforgebio.com)**. Its www alias redirects to the same HTTPS origin. It runs independently of the development computer on AWS Lightsail, with private managed PostgreSQL and persistent private result storage. The old `seqforge.com` website and company email hosting remain unchanged.

- [中文：线上网站、GoDaddy 和设计交接](deploy/aws/HANDOFF_ZH.md)
- [English: AWS deployment evidence and operations runbook](deploy/aws/README.md)
- [Local Windows setup and safe upgrades](PC_HANDOFF_ZH.md)

**A GitHub push does not currently deploy the live site.** There is no automatic release pipeline. A reviewed source version must be built on Linux, migrated explicitly and started as a new versioned image using the AWS runbook. GitHub stores source and migration history, not secrets, customer databases, uploaded results or browser drafts.

The local and AWS databases are independent: accounts, orders, administrator roles and configured/customer-specific prices do not sync between them. The AWS site started with a separate empty database and the four approved dropbox locations; the owner-designated real account has since registered, verified its email and been provisioned as an administrator. First post-promotion administrator UI login and the remaining business acceptance checks are recorded in the runbook.

Verified infrastructure includes a successful Linux build, all 11 migrations, HTTPS, database TLS, public health checks, and container recovery/private-volume persistence after a controlled reboot. Daily instance backups retain seven snapshots and database recovery retains seven days; **backup restoration has not yet been tested**. This is a working test deployment, not a claim that every production workflow has been accepted.

## V4 customer workflow

- Order names are optional and reusable; order numbers identify submissions. Idempotent submission retries return the original order.
- Tube and 96-well plate orders use separate choices, sample fields and CSV templates. Submit mixed containers as separate orders.
- Manual entry, Excel cell paste and CSV/TSV/TXT upload support column mapping, ignored extra columns, validation and preview. Applying the preview replaces the editable sample list. Native Excel workbook uploads are not supported. Order names, PO numbers, pickup and billing are not imported from sample spreadsheets.
- Guests can choose a service and fill in samples before signing in at submission. Same-browser drafts persist for up to 30 days, with a continue/reset choice on return; unfinished drafts do not create administrator orders. Drafts are isolated by service and signed-in account and are not synced between computers.
- Account → Reusable order details saves pickup location/instructions, contact name/phone, PI, billing organization/contact/email/address and payment method. New orders prefill these fields; each order can override them. Use the explicit save-defaults button to change future defaults. No cross-account or lab-wide sharing is enabled.
- Invoice and Purchase order record billing intent only; PO billing requires a PO number on that order. Credit card is unavailable. No charges, invoice emails, pickup bookings or payment-provider calls occur.
- Each new order saves a pickup/billing snapshot, visible in customer, admin and printable manifests. Editing account defaults never changes historical snapshots. Old orders are explicitly marked when these details were not recorded.

Upgrade an existing **local** V3 checkout: stop the app, back up PostgreSQL and result storage, run `npm ci`, `npm run setup`, then `npm run dev`. The additive migration preserves existing orders and account data. The application rejects old submission payloads without required V4 pickup/billing details; reload older open forms before submitting. Use the separate AWS runbook for the live deployment; do not run local setup/demo commands there.

## Website and account updates (September 2026)

- Public homepage and customer/admin portals share the same application and order backend. The homepage remains available when signed in.
- Navy and mint SeqForge website with a WebGL DNA hero, connected laboratory interactions, responsive navigation, and matching login/customer/admin portal styling. See [frontend integration](FRONTEND_INTEGRATION.md) for routing and scope.
- Public order buttons open the guest-accessible service chooser. The homepage price console reads the active database rates for Standard and Pre-mixed Sanger submission types and both Whole Plasmid size bands, with direct links into ordering. Other service inquiries use Contact.
- Account information supports editing first/last name, organization, laboratory and phone through an authenticated, validated endpoint. Login email remains read-only; pickup/billing defaults are saved separately.
- `V4_TO_LAUNCH_ROADMAP.md` is historical planning material. Current deployment evidence and remaining acceptance checks are in [the AWS runbook](deploy/aws/README.md). Repository updates alone do not deploy the service or enable card payments.

## Oligo synthesis requests (October 2026)

`/orders/new?service=oligo` offers Standard and Modified DNA oligos. Customers can enter rows manually, paste Excel cells, or upload CSV/TSV with explicit column mapping and ignored extra columns. Each row records a unique name, 5′ to 3′ IUPAC DNA sequence, requested synthesis scale/purification, optional modifications and notes. Spaces are removed and sequences become uppercase; other invalid characters are rejected. Limits of 250 oligos/order and 500 bases/oligo are form limits, not promised synthesis capacity.

The flow uses the same guest entry, 30-day browser draft, continue/restart prompt, sign-in handoff, review and idempotent submission as sequencing. Delivery records the outbound oligo shipping address and requested Dry/Resuspended form, plus contact and billing details. Orders save immutable Oligo specifications in `Order.oligoSnapshot` without creating DNA samples or Sanger reactions. Customer/admin/print views show these specifications; admin search includes oligo names.

Standard DNA oligos at 25 nmol with Desalted purification and no modifications cost **$0.25 per base**. The server normalizes DNA sequences and saves immutable per-oligo price lines. Other scales, purification and modifications require a separate quote. Mixed requests show the known standard-oligo subtotal separately while keeping the final order total unknown; unpriced items never appear free. Existing quote-only snapshots remain unchanged. Taxes, shipping and delivery specifications still need laboratory confirmation. No production is triggered automatically: quote approval and Oligo production/completion remain unavailable until that workflow is implemented. Oligo submissions do not depend on sequencing price revisions.

## Sequencing prices

Initial Sanger USD rates per sequencing reaction, including partially filled plates (administrator changes in each database take precedence):

| Container | Standard | Pre-mixed |
| --- | ---: | ---: |
| Plate | $4.50 | $3.50 |
| Tubes | $5.50 | $4.50 |

Ready to load has been retired. It is absent from current service choices, public pricing and pricing editors. Old entry and sign-in return links open the Sanger chooser with a retirement notice, and the server rejects new submissions using that mode. Existing orders and historical pricing records retain their original data.

A full pre-mixed 96-well plate costs $336 for sequencing. Multiple primers on a sample count as separate reactions. Calculations use integer cents. The server calculates and saves a versioned price snapshot with each new order; client-supplied totals are not trusted. Older orders retain their original data without retroactive prices.

Whole Plasmid defaults to **$5 per sample up to and including 12,000 bp**, and **$15 per sample above 12,000 bp**, for both tubes and plates. Mixed-size orders are totaled by size band. Missing sizes retain an explicitly provisional base-rate estimate and require laboratory confirmation. The size-tier migration adds the new rates, preserves previously configured rates, advances the pricing revision and leaves historical order snapshots unchanged.

Shown amounts are service subtotals, excluding shipping and taxes. Custom synthesis specifications, preparation, special protocols, rush handling and additional instructions require review for extra charges. No payment is collected. Customer-specific fixed sequencing prices are supported; coupons are not implemented.

## Admin pricing and order search

`/admin/pricing` manages eight active USD unit rates: Standard and Pre-mixed Sanger in tubes/plates (per reaction), and two Whole Plasmid size bands in tubes/plates (per sample). Edits require administrator access, a change reason and a before/after confirmation. Revision checks prevent overwriting another administrator's changes; the audit log retains the editor, timestamp and old/new rates. Retired rates remain stored for historical compatibility and are preserved when current rates change. The fixed Oligo standard rate is versioned in code; it is not an editable sequencing rate or customer override.

Customer estimates use the current database schedule plus any fixed prices for the signed-in account. Final submission sends `X-Pricing-Revision`, `X-Customer-Pricing-Revision` and `X-Pricing-Customer-Id`; an outdated revision returns `409 PRICE_CHANGED` with that account's effective schedule, without creating an order. An account change returns `409 ACCOUNT_CHANGED` and requires reloading. The customer must review and confirm changed prices. Price reads and order creation share a database transaction, and existing orders always display their stored pricing snapshots. Idempotent retries return the original order even after a price change.

`/admin/orders` and the dashboard support text search, service, submission type, status and customer filters, with 25 results per page. Searches include order number/name, PO, customer name/email/organization/lab and sample names. The saved subtotal is shown without recalculating historical prices.

`/admin/customers` provides an administrator-only customer directory with name/email/organization/lab/phone search, order-activity filtering and pagination. Customer profiles show account contacts, currently saved delivery/billing defaults, order counts and searchable order history locked to that customer. Historical order contacts and prices remain unchanged. Contact details remain read-only; no emails are sent.

Each customer profile also includes **Custom pricing** for the eight active sequencing rates. A blank value follows the current global rate, including future global changes; an explicit zero means no unit charge. Overrides belong to one account, not an entire organization or lab. Saving requires a reason and a before/after confirmation, with revision checks and an audit trail. Clearing overrides restores global pricing while retaining revision history. Only new orders use changes; saved orders retain their original prices and mark any custom-priced lines. Oligo uses the separate standard-rate and custom-quote rules described above. Public `/api/pricing` exposes only global prices; authenticated `/api/account/pricing` returns only the current account's effective rates with private, no-store caching. The additive migration creates two empty customer-pricing tables and assigns no overrides automatically.

## Setup

For Windows setup, moving to another computer, and safe upgrades, follow [the current Chinese handoff guide](PC_HANDOFF_ZH.md). A fresh computer needs Node.js, a running PostgreSQL server, a separately created database, and a local `.env`; cloning GitHub does not transfer accounts, orders, result files or browser drafts. `Start-SeqForge.cmd` is a convenience launcher after setup, not an installer.

Use Node.js 22.13 or later (22.23.4 verified on AWS), and a running PostgreSQL server (18.6 verified). Install dependencies with `npm ci`. Run `npm run setup` once to create `.env` if absent; it will stop until you configure a PostgreSQL `DATABASE_URL`. Keep the generated authentication secret, and set `BETTER_AUTH_URL` to the application's origin. These setup instructions are for a separate local development environment.

After configuring the database:

```bash
npm run setup
npm run dev
```

Open [localhost:3000](http://localhost:3000). On PowerShell use `npm.cmd` if script execution policy blocks `npm`.

Setup does not seed accounts by default. Optional demo fixtures are restricted to an explicitly disposable local database and localhost application; they must never be added to the working customer database or AWS site. Prefer `npm run test:smoke` for synthetic submissions. Any optional demo-account display must remain confined to that isolated local environment; do not use demo credentials for real accounts.

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

## Result delivery and remaining production work

Sequencing result delivery supports one file/archive per order, up to 25 MB: staff upload it privately, check it, then explicitly mark the order Completed to release it and queue one results-ready email to the account owner. Completion requires an uploaded result. Replacing a published file requires moving the order back to QC; customer access is withdrawn until completion again. Repeated or reopened completion does not resend the first result notification. Existing completed orders are not automatically backfilled.

AWS HTTPS, managed PostgreSQL, persistent result storage, backups and initial verified administrator provisioning are in place. Real account verification has been completed; a separate internal setup email was accepted by SMTP, with receipt confirmation recorded separately. Still complete real password-reset and order/result-delivery acceptance, restoration of database **and** result files into an isolated environment, and laboratory review of prices, additional fees and delivery rules. Do not import legacy customers merely to test the site.

Internal registration/order reminders and customer verification/order/hold/result notifications are stored in queues; see [email setup](EMAIL_NOTIFICATIONS.md). A continuously running customer-mail retry/recovery worker is not yet implemented; the existing mail CLI manages internal notifications only. Automated instrument/LIMS integration, card payments, automatic invoicing and the full Oligo quote/approval/production workflow remain future work. The public service pages no longer include the sample planner.

## Dropboxes, order holds and account recovery

`/dropboxes` is a public, searchable Leaflet/OpenStreetMap map. Sanger and Whole Plasmid customers can choose a location in the delivery step or enter from the map; Oligo uses outbound delivery instead. Admins manage names, addresses, building coordinates, placement, pickup schedules, access notes and active/inactive state at `/admin/dropboxes`. Coordinates are optional. No automatic geolocation or map API key is used. Map tiles require network access; the list and directions remain usable when tiles fail. Follow the map provider's usage policy when preparing high-volume production hosting.

After `npm run db:deploy`, `npm run db:seed-dropboxes` inserts the four user-confirmed initial sites without creating accounts/orders or overwriting existing locations: UCSD Muir Biology and Tata Hall, UCR Genomics and Boyce Hall. Their exact box placement, collection schedule and access notes intentionally remain blank until confirmed in admin. Building markers come from OpenStreetMap ways [31839879](https://www.openstreetmap.org/way/31839879), [821246683](https://www.openstreetmap.org/way/821246683), [233678061](https://www.openstreetmap.org/way/233678061) and [544060339](https://www.openstreetmap.org/way/544060339); they do not identify the box inside the building. The Genomics address is listed by [UCR HPCC](https://hpcc.ucr.edu/about/overview/contact/).

Submission rechecks the location and revision on the server, refuses inactive/changed selections, and snapshots the current details into the order, manifest and confirmation emails. A future location edit does not rewrite historical orders. Administrators pause locations rather than delete their history.

Admins can place any order on **Needs attention**, supplying a customer-visible reason and next steps. Customers see the hold in their dashboard and order and receive an account-only notification. Resolving requires an explanation and a working stage; it does not complete the order or change prices/samples. Status revisions, transaction locks and idempotency keys protect concurrent edits, with an actor/time/message audit. Held results stay private; a new result upload also invalidates an older completion form. Pending result-ready mail waits while the result is withdrawn.

The login page links to `/forgot-password`. Recovery uses the existing SMTP configuration, a one-hour single-use reset link, explicit POST confirmation, per-email/account throttling, and a per-account lock across concurrent resets. Success invalidates existing sessions and sibling reset links without verifying an email or submitting an order. `npm run test:reset-db` uses a disposable schema and fake mail; the official smoke wrapper also covers the HTTP recovery flow and Dropbox/hold operations.

See [customer intake](CUSTOMER_INTAKE.md) for detailed sample and primer fields and [the current PC handoff guide](PC_HANDOFF_ZH.md) for Windows setup. Other older technical guides may describe V2; this README supersedes their SQLite/setup/pricing instructions.
