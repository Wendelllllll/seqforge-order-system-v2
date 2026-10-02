# Hosted demonstration deployment

Status: preparation only; no hosted resources created yet.

## Required resources

- One long-running Node.js service (Node 22.13 or later in the 22.x series).
- A separate managed PostgreSQL database. Do not expose or copy the local development database.
- A persistent volume for uploaded result files. Run one application instance while filesystem storage is used.
- An HTTPS address from the host; a custom domain can follow later.

## Commands and configuration

Build: `npm ci --include=dev && npm run db:generate && npm run build`

Before starting the updated application: `npm run db:deploy`

Start: `npm run start -- --hostname 0.0.0.0` (Next.js reads the host's PORT).

Health check: `/api/health` (includes a database connectivity check).

Environment:
- DATABASE_URL: cloud database connection string from the host's secret settings.
- BETTER_AUTH_SECRET: unique randomly generated secret, at least 32 characters.
- BETTER_AUTH_URL: exact HTTPS site origin, without trailing slash.
- SHOW_DEMO_ACCOUNTS: false.
- RESULT_STORAGE_PATH: absolute path on the persistent volume, e.g. /var/data/results.

Never run the demo seed on the host. Existing local accounts and public demo passwords must not be imported.

## Administration and acceptance

Create a fresh account using the owner's chosen email and a unique password. After confirming ownership and the exact new user ID, assign its administrator role through a trusted cloud database console. Do not promote an arbitrary pre-existing account based only on an unverified email address.

Before sharing: test customer registration/login, order creation, administrator review and result upload/download; verify another customer cannot access the order or result. Redeploy and verify the same result remains downloadable. Confirm database backups and result-file backup/restore procedures on the chosen host.

This is a demonstration environment. Payments remain invoice/PO preferences, with no live card processing. Do not describe the demo as production-ready. Registration verification, password recovery, rate-limit/load review, operational monitoring and lab acceptance remain launch work.

## Candidate hosting

Render supports full Next.js Node services, managed PostgreSQL and persistent disks. Persistent disks require a paid service and restrict it to one instance; deployments with a disk include a short interruption. Confirm the final resource quote before creating billable resources.

References:
- https://render.com/docs/deploy-nextjs-app
- https://render.com/docs/disks
- https://render.com/pricing
