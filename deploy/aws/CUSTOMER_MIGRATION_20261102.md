# Active legacy customer import — November 2, 2026

The user authorized a first batch of customers with orders since January 1, 2026. This was an account-data import into the existing AWS database, with no application release or DNS/mailbox changes. At import time the application remained release `20261102-29a`; see [the deployment guide](README.md) for subsequent releases.

## Source and outcome

- The old site's **All orders** export contained 539 records dated January 2–October 30, 2026, referencing 131 distinct old account IDs. The visible all-orders list showed 50 entries and 11 pagination links, but its last-page links point to a different account-list route. Several date/status displays are also inconsistent; the export's populated `date` field agrees with visible order/invoice dates checked. This is the coverage of the currently available export, not proof that previously deleted or separately archived records are included. Obtain an authoritative full database export if broader historical completeness is required.
- A fresh **Users-table** export matched 125 of those IDs with valid, unique email addresses. The user-provided HTML `.xls` supplied billing information and a second credential/identity cross-check. Do not use the old user-list `Orders` count: it was zero for every account.
- **120 ordinary customers imported**, with salted Better Auth scrypt hashes generated locally from the legacy password field. Original password matching and rejection of a different password were checked for every included credential. No real customer login session was created.
- **11 held for review**: 6 order-linked IDs missing from the customer table; 5 with a password field shared by 1,787 old records, which must not be treated as confirmed personal passwords.
- Existing 2 users, 2 credential accounts and 4 orders were preserved; order counters, base pricing and customer-pricing records were unchanged. No old orders/results/invoices/payment details were imported.
- All 120 imported users have `role=customer` and `emailVerified=false`. Login uses the actual email address plus the original password. Legacy usernames are retained only in the private migration manifest, not implemented as a new login alias.
- **No migration emails or staff registration alerts were queued or sent.** Customers verify through the site's existing flow before their first order submission.

## Pricing follow-up before inviting customers

Of the 120 imported accounts, **61 have the old `custom_prices=yes` flag**. Old rate definitions have not been mapped or imported. Until explicitly reviewed and configured, the new site uses its existing default prices for these accounts. Blank/null flags do not prove that no commercial agreement exists. The private review report identifies the flagged accounts. Do not claim full commercial-account migration or send a launch invitation before this follow-up is resolved.

## Backup, audit and privacy

- Completed managed database snapshot: `seqforge-before-customer-import-20261102` (14:45 UTC).
- Root-only server audit folder: `/var/backups/seqforge/customer-import-20261102/`.
- Private Windows working folder: `%LOCALAPPDATA%\SeqForge\customer-migration\20261102-active2026\`, outside OneDrive and Git; it contains source exports, the no-password review, hashed payload and verification evidence. **Do not commit or publicly upload its contents.**
- Batch ID: `retrogen-active-2026-20261102`; completed `2026-11-02T14:50:15.673Z`.
- Included legacy IDs map deterministically to `legacy_retrogen_<old-id>`. Re-running an import must skip existing emails and IDs; it must never replace a password that a customer has since changed or reset verification status.
- The transactional importer directly creates only `User` and `Account` records; it does not call signup APIs or notification hooks. Conflicts abort the transaction rather than silently updating or merging identities.
- The managed snapshot is a disaster recovery option. Do not restore it over subsequent real customer orders to undo a small import; evaluate a targeted correction using the private manifest instead.

## Validation

`node node_modules/tsx/dist/cli.mjs --test tests/legacy-customer-import.test.mjs` passed all 7 checks using a disposable local PostgreSQL schema and no SMTP credentials. Coverage includes read-only preflight, preserving existing accounts, original short-password login, failed wrong-password login, verification only after token confirmation, retry idempotency, malformed/plaintext payload rejection, and rollback on credential insertion failure. The schema is removed after testing.

Live read-only verification confirmed all 120 expected hashes/owners/roles, zero imported sessions/orders/notifications, the existing 2 accounts and 4 orders, a healthy release-29a container and HTTP 200 for `/login`.

The generic importer is `scripts/legacy-customer-import.mjs`. Future batches require a fresh export, private eligibility review, current backup, dry-run, isolated tests, and explicit scoped authorization. Never put real source data in fixtures or use old `Manager`/`Lab-Tech` labels as administrator roles.
