# AWS test deployment: seqforgebio.com

The AWS test deployment was brought online on **2026-11-01**, with infrastructure/reboot checks completed at approximately **22:27 UTC**, initial UI/internal-mail checks through **22:29 UTC**, and subsequent real-account verification and administrator setup recorded below. It runs one Linux Next.js container behind Caddy, with a **separate, private managed PostgreSQL database**. Only seqforgebio.com and its www alias are involved; seqforge.com, the old website and company email hosting were not moved. A single instance is not highly available. The checks below establish an operational test environment, not full production acceptance.

The created resources are an Ubuntu 24.04.4, 4 GB / 2 vCPU instance named `seqforge-test-web` and an encrypted PostgreSQL 18.6 managed database named `seqforge-test-db`, in Oregon (`us-west-2`). The static website IP is `44.240.100.124`. Docker Engine 29.9.2 and Compose 5.6.1 are installed; Docker is enabled at boot and 2 GiB swap is configured.

[中文：网站、GoDaddy 与设计伙伴交接](HANDOFF_ZH.md). **Pushing or merging to GitHub does not automatically deploy this site.** No continuous-deployment pipeline is configured. The repository contains application source and deployment instructions; the running AWS release changes only through an explicit build/migration/release operation. This documentation update itself does not change the running containers or their on-host source manifest.

## Deployment evidence — 2026-11-01

| Item | Verified value |
| --- | --- |
| Release directory | `/opt/seqforge/releases/20261101-5` |
| Running app image | `seqforge-web:20261101-5` |
| App image ID | `sha256:0d79ff9869905b3c55ec5119e739913334d7f95e02e4c982a899cb272cde5b72` |
| Previous healthy app / rollback | `seqforge-web:20261101-4` (`sha256:d90195a41323c9a7449c0fcf5b711349f921f48ebc84aaaf34121f20cee74e67`) |
| Node base image | `node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da` |
| Caddy image | `caddy@sha256:36c24ad91a7ff7bc4c87fe22bfa8df3c4b18da0773d73fc12ee2c52b98c0bb7e` (Caddy 2.11.7) |
| Runtime versions | Node 22.23.4, Next.js 16.4.3, Prisma Client 6.19.3 |
| Original release-2 source ZIP SHA-256 | `ca550e4f3f9b62b8bc1693c52ac7bf1bcc5d23b612f7ab7cb32893aac944c03c` |

- Release-5 removes the obsolete homepage Sample Planner entry, dialog and handlers, plus the scroll story's corner slogan. Only `public/brand/index.html`, `lab.js`, `scroll-chapter.js` and `scroll-chapter.css` changed; the story's titles remain unchanged. The step navigation stays centered on desktop and avoids inherited mobile menu styling. Changed scripts/styles use content-versioned URLs. All four served hashes and HTTPS health checks passed; desktop/mobile review and retained story interactions passed without creating orders. The source manifest SHA-256 is `22936d8d9bd15d40cbedf6d12e169aa87248aad7ef2be41ac78fecaa495f66a2`; runtime, database and Caddy are unchanged.
- Release-4 simplifies the seal-section heading to one sentence, “From your bench to your next step.” It replaces only `public/brand/index.html` and `public/brand/seal-cards.css` on top of release-3. Both served asset hashes match, the homepage and health endpoint return 200, and desktop/mobile visual checks passed. The source manifest SHA-256 is `c38d968bc3feb5a4f0721dfded7bcd50ab944ee147cb03891ea84fd9fd78fc29`; the build/runtime, database and Caddy configuration are unchanged.
- Release-3 is a static homepage update based on the verified release-2 image. It replaces only `public/brand/index.html`, `home-recovery.css`, `lab.js`, `scroll-mesh.js` and `seal-cards.css`: the new brand slogan, removal of motion controls, and fixed seal poses using existing artwork. The Next.js build ID remains `nG-weIHVO1e23_dSTkEQT`; no dependency installation, application rebuild or database migration was required. The release source manifest SHA-256 is `aa046c5ddfaef9df70b57b60d7e8a7570720072c1b9f6b1789604150b4dfc863`. Only the app container was replaced; Caddy retains its existing release-2 configuration bind. Use the normal full-build procedure below for future application changes; this static-only shortcut applies only to directly served `public/` assets.
- Linux dependency installation, production compilation, TypeScript and all 27 static-page generations passed. Linux npm installation reported 16 moderate advisories, with no high/critical advisories; the separate runtime-only audit reported zero. Release-1 is retained unused and must **not** be started or used as a rollback target because it contains the superseded vulnerable dependencies.
- All **11 committed migrations** applied successfully to the dedicated new database. Only the approved dropbox seed ran: `ucsd-muir-biology`, `ucsd-tata-hall`, `ucr-genomics`, `ucr-boyce-hall`; all four IDs were confirmed through `/api/dropboxes`. No development database, customer or order records were copied or seeded.
- Public HTTPS checks returned apex homepage **200** and `/api/health` **200** with `{"status":"ok"}`. `https://www.seqforgebio.com/login?next=%2Fdashboard` returned **308** to the matching apex path/query. Certificate verification passed for both hostnames; the apex resolved to the assigned static IP.
- Browser review confirmed the homepage and all three service-order forms, Sanger Standard/Pre-mixed choices without Ready to Load, Whole Plasmid default prices of **$5/sample up to 12 kb** and **$15/sample above 12 kb**, and standard Oligo at **$0.25/base**. This was a UI/display review, not a submitted customer order or full service acceptance.
- Exactly one guarded internal setup email test was sent to the owner-designated test mailbox. SMTP accepted **1**, failed **0**; the TEST notification was recorded SENT after one attempt at **22:28:59 UTC**. Receipt of this separate setup-test message remains unconfirmed; actual account-verification receipt is established separately below. SMTP acceptance alone does not establish inbox delivery.
- The owner-designated real account registered on the cloud site and completed actual email verification. A reviewed, guarded Serializable transaction promoted only that existing verified account from customer to administrator, without changing its password or verified state. One existing session was revoked; the post-check found zero remaining sessions. Opening `/admin` with the old session redirected to login as intended. Administrator provisioning is complete; the user's first new login and administrator UI access remain pending.
- One controlled reboot changed the host boot ID. Docker, app and Caddy resumed automatically; the app became healthy and public HTTPS/redirect checks passed again. A private probe written by container UID 1000 into the persistent result directory retained SHA-256 `115873a179f9454965f12ca9b3f2001f8a712fabdd51bd5e4f75a0de16185baf` across reboot and was then removed. This verifies reboot persistence and write permissions, **not** backup restoration or the customer result-upload/download workflow. No synthetic order or result record was created.
- The reviewed ZIP remains unchanged. Caddy's www redirect and this operational README were applied as explicit deployment-file updates; the host `SOURCE-MANIFEST.sha256` is refreshed for those files and verified after each update. These files are outside the application Docker build context.

Real user registration, email verification and administrator provisioning are complete. Remaining checks include the first post-promotion administrator login, password-reset delivery, full service/price acceptance and actual customer result delivery. AWS console checks confirmed daily instance backups retaining **7 snapshots** and managed database backup retention of **7 days**; a restore test has **not** been performed. Billing-alert delivery requires a verified recipient and should be checked separately by the account owner; do not assume alert emails are active.

## GoDaddy DNS and environment boundaries

The following records belong to **seqforgebio.com only** and were connected to AWS on November 1, 2026:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `44.240.100.124` | `600` seconds |
| CNAME | `www` | `seqforgebio.com` (the apex) | Existing value retained |

GoDaddy supplies DNS, not the application runtime. In Domain Portfolio, select **seqforgebio.com → DNS** and review the existing A record; do not add duplicate competing apex records. Keep the existing www alias. DNS changes must be made at the authoritative provider if nameservers are managed elsewhere. The [official GoDaddy A-record guide](https://www.godaddy.com/en-uk/help/add-or-edit-an-a-record-42546) describes the current controls and propagation behavior. A TTL of 600 is a cache duration, not a guaranteed propagation deadline.

Caddy obtains/renews HTTPS certificates on AWS and redirects www to the canonical apex. Normal code releases do not require a DNS edit or a purchased GoDaddy hosting/SSL product. The application must keep `BETTER_AUTH_URL=https://seqforgebio.com` until a separately planned domain cutover.

Do not apply these records to **seqforge.com**, change its nameservers, or replace its DNS zone. The main domain's MX target was verified on November 1 as **seqforge.com itself**. An apex A-record change can therefore redirect incoming mail even when the MX record is left untouched. Before a future main-domain move, inspect MX targets and their A/AAAA records, mail/webmail hostnames, SPF, DKIM and DMARC, and plan the web/mail separation explicitly. Moving the website does not move the mail service automatically.

The AWS database is separate from local development. Accounts, permissions, orders, files, rate overrides and browser drafts do not synchronize through GitHub or DNS. Changes to server secrets, SMTP settings or customer data require a separate authorized operational action; none belongs in the public repository.

## Before first deployment

- Use a dedicated test database, not localhost's working database or a database dump containing existing customers. Choose the same AWS Region as the instance; leave database public access disabled. Confirm the actual engine/version is supported by the installed Prisma 6 client.
- Attach a static IP. Allow inbound TCP 80/443 publicly and SSH 22 only from the administrator's IP. Do not publish 3000 or 5432. Check the Lightsail firewall as well as the host firewall; Docker publishing must not bypass the intended policy. Outbound HTTPS, DNS, database TLS and approved SMTP must work.
- Install Docker Engine and the **Compose plugin >=2.30** using [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/); enable Docker at boot. Access to the Docker socket is effectively root access.
- Deploy a reviewed source revision that includes all intended changes and the package lock. The current local working tree may contain changes not yet in GitHub. Use this Dockerfile to build on Linux; do not upload local node_modules, .next, .env, storage, databases, or git history as a deployment bundle.
- Provision an empty `seqforge` database and an application user able to apply this app's migrations within that database. Do not use an AWS account password or reuse a demo account password. Separate migration/runtime DB roles can be introduced later.
- Download the current AWS CA bundle from the links in [Lightsail's certificate guide](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-download-ssl-certificate-for-managed-database.html). Retain the complete official bundle as `/etc/seqforge/rds-ca-bundle.pem`. For this Prisma 6 client, select the **single official root CA matching the managed database's served chain** and store that root as `/etc/seqforge/rds-ca.pem`, mode 0644. Verify the endpoint chain and hostname against the selected root before using it. These are public certificates, not private keys; use the actual managed database endpoint hostname.

The URL uses Prisma 6's `sslmode=require`, `sslaccept=strict` and `sslcert` CA path. `require` alone does not enforce certificate verification for this driver. Do not solve a certificate failure by turning verification off. These options differ from psql's `sslmode=verify-full`; see [Prisma PostgreSQL SSL options](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql#configuring-an-ssl-connection) and [AWS PostgreSQL TLS guidance](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-connecting-to-postgres-database-using-ssl.html).

**CA compatibility finding:** this Prisma 6.19 native TLS `sslcert` path reads one PEM root. The official Oregon bundle starts with ECC384, but this database serves an RSA2048 chain; passing the whole bundle caused strict verification to fail even though a client supporting the full bundle succeeded. The deployed root is **Amazon RDS us-west-2 Root CA RSA2048 G1**, SHA-256 fingerprint `86:E2:2F:41:C7:9B:0D:E5:77:70:54:18:9C:FA:DB:DD:F6:33:A8:A1:DC:09:EF:13:4D:B0:7A:75:6E:49:4A:BE`. It was extracted from the retained official bundle, checked against the actual server chain with hostname verification, and then successfully used by Prisma migrations and application health checks. Do not overwrite this mounted file with the multi-root bundle, trust the leaf/intermediate as a root, or disable verification. Re-evaluate the selected official root during AWS CA rotation.

## Transfer current Windows source safely

`git archive` includes committed files only and would omit current uncommitted progress. `package-source.ps1` instead packages an explicit source allowlist, including new source/migrations, and rejects links, common secret/data files and recognizable private keys. It checks `LinkType`/`Target` metadata and native reparse tags, allowing only Microsoft's documented Cloud Files tag family for OneDrive placeholders; symlinks, junctions, other redirections and unknown reparse types remain rejected, including parent directories. Cloud files must be readable/hydrated to package successfully. It includes no local env files, dependencies, results, development databases, git history or personal/QA documents. Review the source first; no automatic scanner can identify every secret embedded in code.

Run it after edits stop, with a new destination outside the repository:

```powershell
powershell -NoProfile -File .\deploy\aws\package-source.ps1 -Destination "$env:TEMP\seqforge-source-RELEASE.zip"
```

Upload only that reviewed archive over the approved SSH connection, unpack into a new release directory, and run `sha256sum -c SOURCE-MANIFEST.sha256` there. The archive has no secrets, but source is still private. It intentionally is not a Git checkout and does not include local tests/docs. Keep the original reviewed commit or working snapshot and release identifier for traceability. The separate Dockerfile allowlist also excludes local secrets from the build context.

## Host files and secrets

For a **new host only**, run the following on Ubuntu, not the Windows development machine. Do not replace an already configured env file with a template. Source may live in `/opt/seqforge/releases/<release-id>`; persistent results and secrets must remain outside releases.

```sh
sudo install -d -m 0755 /etc/seqforge
sudo install -d -m 0700 /var/backups/seqforge
sudo install -d -o 1000 -g 1000 -m 0700 /srv/seqforge/seqforgebio/results
if ! sudo test -e /etc/seqforge/seqforgebio.env; then sudo install -m 0600 deploy/aws/app.env.example /etc/seqforge/seqforgebio.env; fi
if ! sudo test -e /etc/seqforge/deploy.env; then sudo install -m 0600 deploy/aws/deploy.env.example /etc/seqforge/deploy.env; fi
sudoedit /etc/seqforge/seqforgebio.env
sudoedit /etc/seqforge/deploy.env
```

Fill the database URL and generate a new random auth secret with a password manager or `openssl rand -base64 48`. Put it directly in the protected file. Do not paste secrets into chat, Git, screenshots, or shell command arguments. Percent-encode credentials within the database URL. The app env file uses raw mode: do not surround values with quotes. `BETTER_AUTH_URL`, result path and demo-account hiding are fixed in Compose.

Mail is intentionally `off` in the template. Before inviting testers, configure an authorized sender in this protected env file using the existing [mail configuration guide](../../EMAIL_NOTIFICATIONS.md). The SMTP service can remain with the current provider independently of AWS. Enable customer/internal `smtp` modes only after sender/recipient settings are reviewed. An empty customer recipient list blocks sending; `*` permits any customer address. Initial internal notifications should go only to the explicitly approved internal test mailbox. The approved runtime SMTP configuration was transferred separately into the protected host env file; source archives and application images contain no SMTP credentials. One internal test has already been sent as recorded above; await recipient confirmation rather than automatically repeating it. Real account-verification delivery has since been confirmed; password-reset delivery still awaits its own real-user check.

## Build, migrate, start

From the repository root on the host, after the protected files and CA certificate exist:

Building Next.js/TypeScript temporarily uses more memory than serving the site. On this 4 GB host, check `free -h`, `swapon --show` and free disk space before building, and avoid simultaneous builds. The reviewed `bootstrap-host.sh` configured a 2 GiB swap file on the new approved host; its explicit host/OS guards must be reviewed before reuse elsewhere. Swap is not a substitute for RAM. If builds exhaust memory or disrupt the running app, build on a separate Linux builder of the same CPU architecture and transfer the resulting versioned Docker image. Do not enlarge AWS resources automatically. Keep previous release images and enough free disk space for the next build.

```sh
sudo docker compose --env-file /etc/seqforge/deploy.env -f deploy/aws/compose.yaml build app
sudo docker compose --env-file /etc/seqforge/deploy.env -f deploy/aws/compose.yaml run --rm --no-deps app npm run db:deploy
sudo docker compose --env-file /etc/seqforge/deploy.env -f deploy/aws/compose.yaml run --rm --no-deps app npm run db:seed-dropboxes
sudo docker compose --env-file /etc/seqforge/deploy.env -f deploy/aws/compose.yaml up -d --no-build
sudo docker compose --env-file /etc/seqforge/deploy.env -f deploy/aws/compose.yaml ps
```

`db:deploy` applies committed migrations without resetting data. `db:seed-dropboxes` inserts only the four user-approved buildings when missing, preserving existing admin edits; precise box positions and pickup schedules remain unconfirmed. **Never run `npm run setup`, `db:seed`, `db:migrate`, `prisma migrate reset`, or copy the development database here.** Demo seeding is deliberately absent from the image.

Point only the approved `seqforgebio.com` A record to the instance's static IP when ready; its existing `www.seqforgebio.com` CNAME may point to the apex. Review existing A/AAAA records so traffic cannot reach a different server. Caddy will obtain/renew HTTPS certificates automatically with ports 80/443 reachable. The www hostname redirects to `https://seqforgebio.com` with HTTP 308, preserving the path and query string. The app and authentication continue using the apex origin only. Do not change seqforge.com, its nameservers, MX, mail host records, or cPanel.

For future administrators, register and verify the intended real account through the site, then explicitly promote that exact account using an authorized, reviewed database operation. This package deliberately creates no admin password and does not mark anyone verified. The initial owner-designated administrator has completed this process; its existing session was revoked so the user must sign in again before checking the administrator UI.

Review all initial service prices and the quote-only specifications in Admin before accepting orders. A fresh database does not copy price changes, customer-specific rates or other administrator settings from the development database; confirm the intended defaults with the business owner.

## Acceptance before inviting customers

```sh
curl --fail --show-error https://seqforgebio.com/api/health
sudo docker compose --env-file /etc/seqforge/deploy.env -f deploy/aws/compose.yaml logs --tail=100 app caddy
```

Health must return `{"status":"ok"}` (including database connectivity). Check registration, actual verification and password-reset receipt, login, authorization, all supported order forms/prices, dropbox selection, result upload/download and actual notification delivery. Confirm sender links use the HTTPS test domain. Test reboot recovery and persistence of an authorized uploaded result. Logs can contain customer metadata: keep them private and redact before sharing.

Use the existing isolated `npm run test:smoke` workflow for synthetic order submission; never send synthetic orders into the working or deployed customer queue. The `noindex` header discourages search engines but does not make a public test site private. Use only authorized real testers and avoid importing customer data until access/backup checks pass.

The dated evidence above records the Linux build, migrations, strict database TLS, HTTPS, private-volume permissions and reboot recovery that were actually checked. Complete the remaining real user/email/business acceptance and backup restoration checks separately before accepting production readiness. A health check alone cannot prove those features.

## Updates and rollback

GitHub is the source-of-truth handoff, not a deployment trigger. Review and test a specific commit, place its source in a **new** release directory, and build a new tag without replacing the running tag. Prefer a committed revision; if a reviewed working-source ZIP is needed, keep its manifest and archive hash. Never copy Windows dependencies/build output or production secrets into the build context.

For example, from the new release directory, `sudo docker build -f deploy/aws/Dockerfile -t seqforge-web:RELEASE_ID .` builds the image without reading runtime credentials or changing the running container. Replace `RELEASE_ID` with a unique reviewed identifier. Only after a successful build and the required backup/migration review should the maintainer update `APP_IMAGE` in the protected deploy env file, run the explicit migration command and use `up -d --no-build`. Do not run a build using the currently deployed tag.

1. Record the current source commit, `APP_IMAGE` and image digest. Keep at least the previous successful image locally. Save the previous release's deployment files too. Official Node 22/Debian and Caddy 2 major versions are pinned; tags can receive patches. Record resolved digests for a reproducible release and review/rebuild security updates regularly.
2. Before a migration, make a managed database snapshot and a matching result-file backup. Check whether the migration remains compatible with the prior app. Schedule a short maintenance window for incompatible changes.
3. Build a new, uniquely tagged image from the next reviewed source release. Update `APP_IMAGE` in `/etc/seqforge/deploy.env`, run `db:deploy` explicitly, then `up -d --no-build`. Migrations do not run on every restart. Brief interruption is expected on this single instance.
4. If only application code needs rollback and the schema is compatible, restore the previous image tag and run `up -d --no-build` using that release's Compose files. Do not rebuild the old tag. Browsers may need a reload after replacement.
5. If the schema is incompatible, restore to a **separate** database/instance first, verify it, then plan the cutover. Blindly restoring over live data can lose orders created after the backup; prefer a forward fix. Never use a reset or an unreviewed down migration.

Do not use `docker compose down -v` or indiscriminate Docker pruning: those can remove TLS state or rollback images. Persistent result files are a host bind mount independent of containers/releases; preserve their ownership (UID/GID 1000).

## Backups and operation

- Enable and verify managed DB backup retention and recovery in AWS; take a manual snapshot before migrations. Database backups **do not contain uploaded result files**. Also enable/review instance backup or another approved encrypted off-host result backup with a defined retention period. A backup left only on this VM is not disaster recovery.
- For a consistent manual checkpoint, stop the app during a maintenance window, take the managed database snapshot and archive the result directory, then start the app. With root-only `/var/backups/seqforge` already created, `sudo tar -C /srv/seqforge/seqforgebio -czf /var/backups/seqforge/results-YYYYMMDD-HHMM.tar.gz results` creates a local archive; replace the timestamp and transfer it to the approved private backup destination. Do not put archives under public/ or publish a download link.
- Test restoration into a separate empty database and separate result directory. Start a separate isolated stack, confirm an authorized order and result checksum, then record the backup ID/time and recovery steps. Set business-approved recovery objectives and retention before real orders.
- Monitor HTTPS health, disk space, container/database errors, backup success and certificate renewal. `unless-stopped` restarts a crashed container and resumes it after Docker restarts; **an unhealthy but still-running container is not automatically restarted**. Alerting/remediation needs an assigned owner.
- The current mail implementation lacks a continuously running customer-queue retry/recovery worker. `mail:status/flush/retry` manages internal notifications only. Configure and test a reliable customer retry/monitoring path before relying on unattended production notifications; this package does not silently create one.
- Oligo special-spec quotes/production approval and other business acceptance gaps must be handled by the existing application workflow and an agreed laboratory process. Hosting does not resolve them.
- Keep billing alerts, receipts, account ownership and backup charges under the company's oversight. This package creates no AWS resources or paid backup services itself.
