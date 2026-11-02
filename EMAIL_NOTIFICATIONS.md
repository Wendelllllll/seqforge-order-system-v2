# Email notifications and customer verification

New customer registrations and newly submitted orders can notify **one configured internal recipient**. Customer verification, order-confirmation, result-ready, hold/resolution and password-recovery emails use separate customer settings and records. No mail includes CC or BCC.

The sender and recipient are independent of website hosting. A local or hosted website can authenticate to Gmail or an authorized company SMTP mailbox on cPanel. Changing providers does not require moving company mailboxes or changing the order database.

## Public Contact form

`/contact` submits inquiries to `POST /api/contact`. The recipient is fixed on the server to **info@seqforge.com**, independently of `INTERNAL_MAIL_TO`. Set `CONTACT_MAIL_MODE=smtp` in the protected runtime env file to enable it; missing/`off` disables delivery and returns an honest error with a direct email alternative. There is no simulated-success preview mode. `CONTACT_MAIL_FROM` optionally overrides the sender; otherwise it uses `INTERNAL_MAIL_FROM`, then `CUSTOMER_MAIL_FROM`. All existing SMTP TLS and test guards apply. No mailbox, cPanel or DNS change is required.

Mail contains the visitor's name, email, organization, service and message as plain text. The validated email is used only as Reply-To, never as the authenticated From or a recipient. Staff can reply directly. Form addresses are not verified accounts. There are no CC/BCC recipients, customer auto-replies, order/account records or attachments. The browser reports success only after SMTP acceptance, which is not proof of inbox delivery. Failure keeps the form text and allows retry or direct email.

The endpoint requires the configured public Origin, JSON, a UUID idempotency key and bounded fields/body (32 KiB). A hidden honeypot rejects automated fills. Limits allow five attempts per email per hour, at least 60 seconds apart, and 60 attempts globally per hour. Limits count SMTP failures too. Retrying the same accepted or in-flight key and payload does not resend; changed content requires a new key. Error logs contain only sanitized codes.

Limits and 24-hour successful-request deduplication are bounded **process-local memory**, appropriate to the current single application process; they reset on process restart and are not shared across replicas. This contact form has no durable inquiry queue or automatic retry worker. A transport failure after remote acceptance can still duplicate an email on retry. Use shared durable controls before scaling to multiple app processes. Automated coverage uses fake transports and never sends real inquiries. Verify actual receipt with an explicitly authorized user submission after enabling each environment.

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

The page uses the signed-in account's email, with no editable recipient. Verification messages are requested through `/api/account/email-verification`, with a 60-second database-enforced resend cooldown and a one-hour link lifetime. The underlying public address-based resend endpoint is disabled. Opening a link (GET/HEAD) only displays `/verify-email/confirm`; it cannot verify an account. The customer must select **Confirm my email**, which submits a trusted-origin POST to `/api/account/email-verification/confirm`. This prevents ordinary link scanners from verifying accounts just by following URLs. Better Auth still checks the token signature and expiry. Valid, invalid, and expired confirmations return to the verification page; that page checks the database, not a query flag. Verification does not automatically sign in or replace an existing session. On another device, sign in again; the order draft remains in the original browser's local storage.

```dotenv
CUSTOMER_MAIL_MODE="preview"
# Optional; defaults to INTERNAL_MAIL_FROM. Gmail must still match SMTP_USER.
CUSTOMER_MAIL_FROM=""
# Use a comma-separated list, or "*" to allow every customer's own email address.
CUSTOMER_MAIL_ALLOWED_RECIPIENTS="your-test-mailbox@example.com"
```

`off` disables customer mail; `preview` stores a message without sending; `smtp` uses the existing SMTP credentials. Customer verification is never redirected to the internal recipient: doing that would incorrectly prove ownership of a different email address. Set `CUSTOMER_MAIL_ALLOWED_RECIPIENTS="*"` to remove recipient-list restrictions for a local demonstration or a hosted site; an empty value is invalid in SMTP mode. This setting does not change internal staff recipients or resend suppressed/preview messages. Automated tests still prohibit live SMTP, even with `*`. For production, configure the company sender and public HTTPS origin and check delivery.

Order confirmations go only to the account email, not billing contacts or shared-result addresses. They include the order number, service, sample/reaction or oligo count, and a private order-page link. Oligo confirmations show any known standard synthesis subtotal and distinguish separately quoted specifications from a final approved amount. Confirmations are enqueued in the order transaction with a unique event key; retries do not enqueue duplicates. SMTP failure does not undo the saved order. Preview/suppressed rows are never promoted to live delivery. Staff reminders remain independent.

For Sanger and Whole Plasmid, staff first upload and check a result, then explicitly set the order to Completed. That status transaction releases the result and inserts one `RESULT_READY` event (`result-ready:<orderId>`). The message goes only to the order owner's account email and links to the private order page without attaching results. Repeated/concurrent completion, moving back to QC and completing again do not create another initial notification. Existing completed orders are not automatically notified after deployment. Uploading alone sends no message, and completion without a result is rejected. Administrators can preview uploaded results; customers can download only while the order is Completed. Oligo production/completion remains held for its separate quote-approval workflow.

`CustomerNotification` stores delivery state separately from `InternalNotification`. Verification messages contain security-sensitive links; restrict database access and do not paste message bodies or tokens into logs. The verification page reports whether SMTP accepted a request and supports resending after a failure. After-response dispatch handles pending order confirmations and results-ready notices; production still needs durable worker/retry monitoring. The internal `mail:*` CLI commands inspect only the staff queue.

`npm run test:smoke` exercises verification, expiry, repeat clicks, the order gate, standard Oligo prices, explicit result publication and notification deduplication using a disposable app/schema. Both mail modes are forced to preview and SMTP credentials are cleared.

## Order attention and password recovery

`ORDER_ATTENTION` and `ORDER_RESUMED` are enqueued with each committed hold/message-change/resolution history event. They go only to the account email and include the administrator's customer-facing explanation plus the private order link. Retried status actions do not duplicate events. Pending `RESULT_READY` messages wait until the order is Completed again if staff withdrew the result before dispatch.

Password-reset requests return the same message for known and unknown addresses. A known account receives a `PASSWORD_RESET` record and a direct `/reset-password` link through the configured customer sender. Its status is PREVIEW, SUPPRESSED, SENT or FAILED (SENDING during an attempt); SMTP failures are recorded and the user can request a fresh link after the cooldown. Reset mail is not swept by the order-notification dispatcher. Recovery links expire after one hour; GET/HEAD never changes the password. Explicit POST consumes the token, ends existing sessions and invalidates sibling reset links. The normal login password is never emailed or logged, and recovery does not verify the account email.

Dropbox confirmation emails include the saved location, address and instructions. Blank placement/schedule fields tell the customer to confirm with SeqForge rather than promising an unconfirmed pickup time.
