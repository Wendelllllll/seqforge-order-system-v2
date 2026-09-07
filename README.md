# SeqForge Order System V2

A local functional prototype for the SeqForge Sanger sequencing order workflow.

SeqForge 新版订单系统的本地功能 Demo，包含客户下单、实验室订单处理和结果交付。当前可以在本地完整演示，尚未部署为生产服务。

Repository: [Wendelllllll/seqforge-order-system-v2](https://github.com/Wendelllllll/seqforge-order-system-v2) (private).

## Project documents / 项目资料

- [PC 接续开发说明（中文）](PC_HANDOFF_ZH.md): Windows installation, next tasks, and switching between computers.
- [Current progress / 当前进度](PROJECT_PROGRESS.md): completed work, verification, and remaining milestones.
- [技术与销售讲解手册（中文）](SEQFORGE_DEMO_TECHNICAL_AND_SALES_GUIDE_ZH.md): architecture, database, product explanation, and demo script.
- [Original project brief / 原始需求](PROJECT_BRIEF.md): original scope and future direction; not a list of completed features.

## Stack

Next.js 16.3.4 (App Router), React 19.2.8, TypeScript, Tailwind CSS 4, Better Auth, Prisma 6, and SQLite. Pages and API routes run in one Node.js application; no separate database server is needed for this demo. The lockfile records exact dependency versions.

## Implemented workflow

1. A customer registers or signs in.
2. The customer creates a Sanger order with one or more samples and primers.
3. The order is persisted in SQLite and appears in customer order history.
4. An administrator opens the order and changes its laboratory status.
5. The updated status appears in the customer portal.
6. The administrator uploads a result file.
7. The customer downloads the result from the completed order.

## Local setup

Install Git and Node.js 22. The repository includes an `.nvmrc` file. On a new computer, clone this private repository using your GitHub account:

```bash
git clone https://github.com/Wendelllllll/seqforge-order-system-v2.git
cd seqforge-order-system-v2
npm ci
npm run setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

These commands work in Windows PowerShell, macOS, and Linux shells. If PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`, or run the commands in Command Prompt.

`npm run setup` creates `.env` with a random local authentication secret if missing, creates the SQLite database if missing, generates Prisma Client, applies committed migrations, and seeds the two demo accounts. Existing configuration is preserved. It is a local-demo command and requires `DATABASE_URL="file:./dev.db"` and `BETTER_AUTH_URL="http://localhost:3000"`.

First installation requires network access for dependencies. Keep port 3000 available because authentication currently trusts this exact localhost origin. Windows execution still needs verification on the target PC.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Customer | `scientist@demo.local` | `DemoCustomer!2026` |
| Administrator | `admin@seqforge.local` | `SeqForgeDemo!2026` |

These credentials are for local demo use only.

## Useful commands

```bash
npm run dev          # Start the local application
npm run setup        # Prepare a new computer or apply committed migrations
npm run db:seed      # Create required demo accounts
npm run db:studio    # Inspect local data through Prisma Studio
npm run verify       # Run lint, generate route types, typecheck, and build
```

## Local data

- SQLite database: `prisma/dev.db`
- Uploaded result files: `storage/results/`
- Both locations are excluded from Git.

The repository includes `demo-result.txt`, a synthetic file that can be used to demonstrate administrator result upload.

GitHub synchronizes code, documentation, database migrations, and the account seed script. It does not synchronize `.env`, existing customers/orders/sessions, uploaded results, `node_modules`, or build caches. Each computer starts with its own demo database. Do not copy Mac dependencies to Windows; install with `npm ci` on each machine.

## Continue development on another computer

Before switching computers, commit and push your work. On the other computer, run `git status` and `git pull --ff-only` on the same branch. If dependencies or migrations changed, stop the app and run `npm ci` followed by `npm run setup`. See the [PC handoff guide](PC_HANDOFF_ZH.md) for detailed commands and troubleshooting.

Next priorities: verify the workflow on PC; improve high-volume sample entry; add automated permission/workflow tests; refine error handling; improve order-number concurrency and result-file consistency. Keep `PROJECT_PROGRESS.md` updated with actual results.

## Prototype boundaries

The prototype does not include production deployment, payments, customer-specific pricing, email notifications, reCAPTCHA, legacy-data migration, plate import, other service types, or ABI/LIMS integration. Do not use real customer data in the local demo.
