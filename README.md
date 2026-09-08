# SeqForge Order System V3

SeqForge's Sanger sequencing customer portal and laboratory order workflow, built with Next.js 16, React 19, TypeScript, Better Auth, Prisma 6 and PostgreSQL. V3 runs locally against PostgreSQL; public production deployment is still pending.

Repository: [Wendelllllll/seqforge-order-system-v2](https://github.com/Wendelllllll/seqforge-order-system-v2). The repository name is retained for continuity.

## V3 pricing

USD per sequencing reaction, including partially filled plates:

| Container | Standard | Pre-mixed | Ready to load |
| --- | ---: | ---: | ---: |
| Plate | $4.50 | $3.50 | $2.50 |
| Tubes | $5.50 | $4.50 | $3.50 |

A full pre-mixed 96-well plate costs $336 for sequencing. Multiple primers on a sample count as separate reactions. Calculations use integer cents. The server calculates and saves a versioned price snapshot with each new order; client-supplied totals are not trusted. Older orders retain their original data without retroactive prices.

Shown amounts are sequencing subtotals, excluding shipping and taxes. Synthesis, preparation, special protocols, rush handling and additional instructions require review for extra charges. No payment is collected. Customer-specific prices and coupons are not implemented.

## Setup

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
npm run test:smoke   # running localhost app; creates synthetic accounts, orders and result files
```

The database test uses `DATABASE_URL` and requires permission to create a schema. It verifies migration preservation, transaction rollback, 30 concurrent distinct submissions, and eight concurrent retries. This is a correctness check, not a measured production capacity guarantee.

## Launch work still required

Provide HTTPS hosting, managed PostgreSQL or an operated database server with restore-tested backups, durable private result storage, production account provisioning and recovery, monitoring and upload controls. Validate laboratory acceptance rules and all additional fees. Current result delivery supports one downloadable file/archive per order; a staff upload updates status and becomes available when the customer refreshes. Email notifications, automated instrument integration, customer-specific pricing and payments remain future work.

See [customer intake](CUSTOMER_INTAKE.md) for detailed sample and primer fields. The older handoff and technical guides describe V2; this README supersedes their SQLite/setup/pricing instructions.
