# Email notifications and customer verification

New customer registrations and newly submitted orders can notify **one configured internal recipient**. Customer verification and order-confirmation emails use separate settings and a separate queue. No mail includes CC or BCC. Password recovery and result-availability emails are not implemented yet.

The sender and recipient are independent of website hosting. A local or hosted website can authenticate to Gmail or an authorized company SMTP mailbox on cPanel. Changing providers does not require moving company mailboxes or changing the order database.

## Configure locally

1. Apply migrations with `npm run db:deploy`.
2. Put mail settings in the ignored `.env.local` file. Do not commit credentials or paste them into chat. Server settings have no `NEXT_PUBLIC_` prefix.
3. Leave `INTERNAL_MAIL_MODE=preview` while preparing. New events are saved as `PREVIEW` without contacting SMTP. Existing customers/orders are not backfilled. Preview messages never become live mail later.
4. Gmail: enable two-step verification and create an application password at https://myaccount.google.com/apppasswords. Use that password, not the normal Google password. Use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`; `SMTP_USER` and `INTERNAL_MAIL_FROM` must be the same Gmail address. Google may not offer application passwords for every account.
5. Once configured, set `INTERNAL_MAIL_MODE=smtp` and restart the local website. Run `npm run mail:test` for one setup message to the sole configured recipient; this creates no order or customer. Confirm inbox/spam delivery before relying on alerts.

```dotenv
INTERNAL_MAIL_MODE="preview"
INTERNAL_MAIL_TO="your-internal-recipient@example.com"
INTERNAL_MAIL_FROM="your-sender@gmail.com"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="your-sender@gmail.com"
SMTP_PASSWORD=""
```

To switch to company mail later, replace the from address, SMTP host, port, authenticated username, and password with the company's verified settings. The company server must permit authenticated sending from the new website host and authorize that From address. Ports 465 (TLS) and 587 (required STARTTLS) are supported, with certificate verification enabled. Sender changes are not accomplished by changing a display name. This code does not log in to cPanel or alter its settings, DNS, accounts, or mail routing.

Changing `INTERNAL_MAIL_TO` affects new notifications. Old pending messages for a different recipient are not redirected or sent, and previews/sent messages cannot be replayed. Use only an existing authorized mailbox.

## Operation and limits

- `npm run mail:status`: settings without secrets and the latest queue states.
- `npm run mail:test`: one diagnostic message, only in SMTP mode.
- `npm run mail:flush`: attempt up to 20 pending live notifications.
- `npm run mail:retry -- <id>`: explicitly retry a failed/abandoned live notification for the current recipient. SMTP uncertainty means a retry can duplicate a message already accepted by the server; SENT means accepted, not proof of inbox delivery.
- Order notifications are persisted in the same database transaction as new orders, with unique event keys. Retried submissions do not queue duplicate notifications. Network email failures never undo orders.
- Signup notifications are queued by an auth after-hook; enqueue failure is logged without failing an already-created account. There is no historical account sweep or automatic backfill.
- Next.js `after` attempts pending mail after order/signup responses. Interrupted attempts and failures remain visible for manual retry. The local app needs to be running and online. A hosted production deployment needs a scheduled queue worker/monitoring before notifications are considered production-ready.
- Links to localhost work only on the computer running the app. Change `BETTER_AUTH_URL` to the actual website origin when hosting it.
- Automated smoke tests force preview mode and clear SMTP credentials. They create accounts/orders only in a disposable PostgreSQL schema. Tests never send to the configured real mailbox.

The employee's personal Gmail account is a temporary test sender. Company-owned SMTP credentials or a transactional email provider should replace it for production. No cPanel/mail/DNS changes are required merely to prepare or test this feature with Gmail.

## Customer email verification and order confirmations

Customers can browse services, prepare a draft, register, and sign in before verification. The server checks the current database `emailVerified` value before accepting a new order for any service. Existing orders and account data are retained. Registration and an unverified order submission lead to `/verify-email`; a successful verification never submits the order automatically.

The page uses the signed-in account's email, with no editable recipient. Verification messages are requested through `/api/account/email-verification`, with a 60-second database-enforced resend cooldown and a one-hour link lifetime. The underlying public address-based resend endpoint is disabled. Valid, invalid, and expired links return to the verification page; that page checks the database, not a query flag. Verification does not automatically sign in or replace an existing session. On another device, sign in again; the order draft remains in the original browser's local storage.

```dotenv
CUSTOMER_MAIL_MODE="preview"
# Optional; defaults to INTERNAL_MAIL_FROM. Gmail must still match SMTP_USER.
CUSTOMER_MAIL_FROM=""
# Live local tests require the actual customer's address in this explicit list.
CUSTOMER_MAIL_ALLOWED_RECIPIENTS="your-test-mailbox@example.com"
```

`off` disables customer mail; `preview` stores a message without sending; `smtp` uses the existing SMTP credentials. Customer verification is never redirected to the internal recipient: doing that would incorrectly prove ownership of a different email address. Local live testing permits only the explicitly listed addresses. Production may set the allowlist to `*` only with `NODE_ENV=production`, after the company sender, public HTTPS origin, and delivery have been checked.

Order confirmations go only to the account email, not billing contacts or shared-result addresses. They include the order number, service, sample/reaction or oligo count, and a private order-page link. Oligo confirmations state that the quote is pending. Confirmations are enqueued in the order transaction with a unique event key; retries do not enqueue duplicates. SMTP failure does not undo the saved order. Preview/suppressed rows are never promoted to live delivery. Staff reminders remain independent.

`CustomerNotification` stores delivery state separately from `InternalNotification`. Verification messages contain security-sensitive links; restrict database access and do not paste message bodies or tokens into logs. The verification page reports whether SMTP accepted a request and supports resending after a failure. Automatic order-response dispatch handles pending confirmations; production still needs durable worker/retry monitoring. The internal `mail:*` CLI commands inspect only the staff queue.

`npm run test:smoke` exercises verification, expiry, repeat clicks, the order gate, confirmation deduplication, and all ordering services using a disposable app/schema. Both mail modes are forced to preview and SMTP credentials are cleared.
