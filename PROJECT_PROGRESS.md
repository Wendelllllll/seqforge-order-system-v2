# SeqForge Order System V2 — Progress

Updated: September 7, 2026

## Current milestone

Functional local vertical slice.

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

- [ ] Improve high-volume sample entry
- [ ] Add targeted automated workflow tests
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
- [ ] Verify installation and the browser workflow on the actual Windows PC

GitHub stores the source and reproducible setup, not this Mac's live database or uploaded files. A new PC environment initially contains demo accounts and no orders.

## Suggested next development milestones

1. Run the documented customer → admin → customer workflow on PC.
2. Improve bulk sample entry and input validation based on actual lab usage.
3. Add focused automated coverage for authentication, ownership, order creation, and result delivery.
4. Harden order-number allocation under concurrent submissions and document allowed status transitions.
5. Improve result replacement, failed-upload cleanup, and operation history.
6. Plan production infrastructure, organization/lab membership, account recovery, and notifications when the scope is confirmed.

Payments, pricing, additional service types, plate import, legacy migration, and ABI/LIMS integration remain future scope. SQLite-to-PostgreSQL migration and production deployment have not been implemented.
