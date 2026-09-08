## V3 verified on this PC

PostgreSQL 18.6 is running locally on port 55432. The read-only SQLite transfer preserved 4 users/accounts, 3 existing orders, 3 samples, 6 reactions, 2 result records and 7 status records; files remain in local storage. Subsequent smoke runs added clearly named synthetic data.

Verification passed: ESLint, TypeScript, 18 unit tests, production build, isolated PostgreSQL migration/persistence test with 30 concurrent orders and eight duplicate retries, and HTTP customer/admin/result/ownership tests. HTTP tests also verified that forged pricing is ignored and changed payloads with reused submission keys return 409. Browser verification confirmed the live plate pre-mixed rate of $3.50.

No public deployment has been performed. Follow the V3 README for migration and launch requirements.
> **V3 update:** PostgreSQL now replaces SQLite. Follow [README.md](README.md) for current setup, safe V2 data transfer, confirmed per-reaction prices and remaining launch work. The V2 instructions below are historical and must not be used to configure the V3 database.
# SeqForge Order System V2 — Progress

Updated: September 7, 2026

## Current milestone

Expanded Sanger customer intake with service choices, physical sample/reaction mapping, spreadsheet import and submission manifests. See CUSTOMER_INTAKE.md.

## Completed

- [x] Next.js, TypeScript, and Tailwind application foundation
- [x] SQLite database and Prisma schema
- [x] Secure email/password authentication and role separation
- [x] Customer registration and login
- [x] Customer dashboard and order history
- [x] Multi-sample Sanger order form
- [x] SeqForge order-number generation and persistence
- [x] Admin order queue and order inspection
- [x] Admin status updates with history
- [x] Customer-visible status updates
- [x] Local result upload and authorized download
- [x] Seeded customer and administrator demo accounts

## Verification completed on September 4 (Mac)

- [x] Lint and TypeScript checks
- [x] Production build
- [x] Dependency security audit
- [x] Customer registration and login browser test
- [x] Two-sample order submission and persistence test
- [x] Administrator order queue and status update test
- [x] Local result upload and authorized customer download test
- [x] Cross-customer order access isolation test
- [x] Responsive visual inspection

## Later prototype polish

- [x] Add validated spreadsheet paste/import and common template/preparation fill
- [x] Add validation/import/migration tests and an HTTP permission/workflow smoke script
- [ ] Refine validation and empty/error states from browser testing

## PC handoff preparation — September 7

- [x] Add Windows/macOS/Linux setup command for local .env, migrations, Prisma Client, and demo accounts
- [x] Explicitly load .env when seeding outside the Next.js server
- [x] Generate Next.js route types before standalone TypeScript checks
- [x] Keep local database, SQLite sidecar files, result uploads, and authentication secrets outside Git
- [x] Add Chinese PC handoff instructions and preserve the original project brief
- [x] Update README and technical guide with cross-platform startup commands
- [x] Clean source-only installation with npm ci on macOS
- [x] Fresh-database setup and repeat setup with Node.js 22.23.2
- [x] Seeded customer/admin login and role checks on the fresh database
- [x] Lint, generated route types, TypeScript checks, and production build on the clean copy with Node.js 22.23.2
- [x] Verify installation and the browser workflow on the actual Windows PC

GitHub stores the source and reproducible setup, not this Mac's live database or uploaded files. A new PC environment initially contains demo accounts and no orders.

## Suggested next development milestones

1. Confirm the service catalogue, plate controls and acceptance rules with the lab.
2. Validate representative customer spreadsheets and a multi-page printed manifest.
3. Prepare a separate hosted trial with individual accounts and persistent storage.
4. Harden order-number allocation under concurrent submissions and document allowed status transitions.
5. Improve result replacement, failed-upload cleanup, and operation history.
6. Plan production infrastructure, organization/lab membership, account recovery, and notifications when the scope is confirmed.

Payments, pricing, non-Sanger service types, production legacy migration, and ABI/LIMS integration remain future scope. SQLite-to-PostgreSQL migration and production deployment have not been implemented.


## Expanded customer intake — Windows verification, September 7

- [x] Service priority, container and submission-mode requests
- [x] Physical Sample → Reaction records, including multiple primers per sample
- [x] Tube/plate locations, preparation and special protocols
- [x] Universal, supplied, stored-reference and synthesis primer details
- [x] CSV/TSV/TXT and pasted spreadsheet import with preview and row errors
- [x] Shared browser/server validation, review/edit step and printable owner/admin manifest
- [x] Additive migration preserving legacy sample, primer, status and result data
- [x] Customer history/admin queue show physical-sample and reaction counts
- [x] Windows / Node.js 22.23.2: npm ci, setup, lint, route types, TypeScript and production build
- [x] 11 automated tests for validation/import/migration/persistence
- [x] HTTP smoke workflow: registration/login, malformed/invalid requests, order creation, ownership isolation, admin status/upload and authorized result download
- [x] Browser walkthrough: incorrect TSV row reports a tube-label conflict; corrected import creates one sample with two reactions; back-to-edit retains entries; submission and saved manifest work
- [x] Narrow browser viewport: corrected page overflow; order document fits the 639px viewport

Validation ran against the local demo only. Synthetic smoke-test accounts/orders/results remain in this PC's ignored local database/storage. Print styling is implemented; a physical printout and large multi-page manifests still need user/lab acceptance testing.

Next: confirm lab acceptance rules and representative bulk files, then deploy a separate customer trial environment. Additional production work includes submission idempotency, concurrent-load testing, password recovery, notifications, pricing/shipping, result replacement cleanup and audit history.
