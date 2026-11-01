# Design handoff: email verification page

Updated November 1, 2026. **Email-verification visual review remains a design task.** The current connection/animation treatment is implemented; confirm the final appearance with the owner while preserving the working verification flow.

中文交接：优先修改「邮箱验证」页面。希望有正式、可信的科研服务网站感觉，可以保留一点品牌亲和力和很克制的海豹元素。之前的大海豹、星星、气泡、漂浮信封和俏皮文案太卡通；后来的白底深蓝版本仍待设计伙伴重新调整。验证、返回原订单和草稿保存逻辑已经接好，请保留。

## Where to start

Local page: [`http://localhost:3000/verify-email`](http://localhost:3000/verify-email).

Live test site: [seqforgebio.com](https://seqforgebio.com). Read the [Chinese owner/designer handoff](deploy/aws/HANDOFF_ZH.md) for AWS, GoDaddy and release responsibilities. GitHub push currently does **not** update the live site automatically. Design work should be reviewed locally with email preview and then released deliberately; the live site sends real account mail.

Order-return example: [`/verify-email?next=%2Forders%2Fnew%3Fservice%3Dsanger%26type%3Dstandard`](http://localhost:3000/verify-email?next=%2Forders%2Fnew%3Fservice%3Dsanger%26type%3Dstandard).

| File | Design responsibility |
| --- | --- |
| [`src/components/email-verification.tsx`](src/components/email-verification.tsx) | Primary composition, account email, actions and status messages. The sidebar mounts the `seqforge-connection` custom element and passes its current state; keep the preceding account/network effects intact. |
| [`src/components/email-verification.module.css`](src/components/email-verification.module.css) | Scoped layout, type, colors, spacing, responsive/focus states and motion. `.content` is the action area and `.guide` contains the connection artwork. Some older decorative rules remain; inspect actual rendered markup before changing them. |
| [`public/brand/verification-connection.js`](public/brand/verification-connection.js) | Current connection/sidebar animation, shadow-DOM styling, interactive seal treatment, sound controls and verified-state presentation. Keep the `state` interface and reduced-motion/fallback behavior working. |
| [`src/components/email-confirmation.tsx`](src/components/email-confirmation.tsx) | Email-link confirmation screen and its explicit confirmation action; visual changes must preserve the scanner-safe POST flow. |
| [`src/app/verify-email/page.tsx`](src/app/verify-email/page.tsx) | Server route, metadata, current signed-in account and real database verification state. Keep this behavior when restyling. |
| [`src/components/brand.tsx`](src/components/brand.tsx) | Shared SeqForge logo component. Changes affect other pages. |
| [`src/app/globals.css`](src/app/globals.css) | Shared website styles. Prefer the scoped verification stylesheet for this task to avoid changing ordering/admin screens accidentally. |
| [`src/components/auth-form.tsx`](src/components/auth-form.tsx) | Registration sends customers to verification; login/register preserve the order-return path. Related behavior, not the main redesign target. |

Existing assets include [`logo.webp`](public/brand/assets/logo.webp), [`seal-report.png`](public/brand/assets/seal-report.png), [`seal-transparent.png`](public/brand/assets/seal-transparent.png), and the verified-state [`email-success.riv`](public/brand/assets/email-success.riv). The current sidebar uses the connection custom element and locally bundled Rive runtime, rather than the older static seal-panel description. The seal can remain subtle or be omitted if the composition works better without it.

Public marketing pages live under `public/brand/`, while live account/order/admin behavior lives under `src/app/` and `src/components/`. See [frontend integration](FRONTEND_INTEGRATION.md) before changing routes or shared styles. Homepage/service price displays must continue to use the application pricing rules rather than newly hardcoded design values.

## Visual direction

- Put the verification task, account email and primary action first. Use a clear information hierarchy and direct English copy.
- Aim for a professional scientific service: restrained navy/teal, readable typography, deliberate spacing, and a coherent relationship to the rest of SeqForge.
- Scientific line work and connection animation are illustrative, not real sample data or required design elements.
- Avoid a mascot-led hero, confetti, stars, bubbles, continuous bobbing, and phrases such as “seal mail.” Small purposeful transitions are welcome.
- Reconsider the overall composition freely. The present two-column card, sidebar, curves and seal placement are provisional.

## States the design must cover

1. Signed out: sign in to continue, keeping the intended order destination.
2. Signed in / unverified: email address shown; sending, sent, cooldown and resend states.
3. Mail unavailable, disallowed test address or network error: actionable feedback with a usable retry/switch-account path.
4. Invalid or expired verification link: request a new link; do not show success.
5. Preview mode: explicitly state that no real email was sent.
6. Verified: announce success and provide an explicit return-to-order or dashboard action.
7. Session expiry or account change in another tab: preserve the existing account checks and sign-in behavior.

Keep visible keyboard focus, semantic buttons/links, live status announcements, error alerts, wrapping for long email addresses, comfortable touch targets, and `prefers-reduced-motion`. On mobile, the action area should appear before secondary artwork/instructions.

## Functional behavior to preserve

- Guests can fill orders before signing in. Drafts remain in the original browser for up to 30 days and are separated by service/account; they are not synced across devices.
- Registration and attempted submission by an unverified customer lead to this page. All service submissions require the current database email-verification flag.
- The page uses `GET` and `POST /api/account/email-verification`. The server chooses the current account's email; the browser must not supply an arbitrary recipient.
- Sending is acknowledged only after the API reports it; preview is not delivery. The resend cooldown is 60 seconds, and verification links last one hour.
- A `verified=1` URL parameter is not proof of verification. Keep the real database/status checks, email-match checks and restricted `next` destination helpers.
- Email links first open the passive confirmation page in `src/app/verify-email/confirm/page.tsx` and `src/components/email-confirmation.tsx`, sharing the verification stylesheet. Keep its explicit **Confirm my email** POST; never submit automatically on mount or verify during GET/HEAD, since email scanners may follow links before delivery.
- Verification does not automatically submit an order or switch the signed-in account. Returning to an order restores the existing continue/reset and review flow.
- Keep authentication, order API enforcement, recipient restrictions and notification queues intact during visual changes. Relevant logic lives in `src/lib/auth.ts`, `src/lib/order-resume.ts`, `src/lib/verification-return.ts`, `src/lib/customer-mail.ts`, `src/lib/customer-notifications.ts` and `src/app/api/`.

## Running and reviewing safely

Follow [`PC_HANDOFF_ZH.md`](PC_HANDOFF_ZH.md) for a fresh computer and [`README.md`](README.md) for current feature/setup details. Install Node.js 22.13+ and PostgreSQL, create a separate local database, run `npm ci`, and use `npm run setup` to prepare the local environment and apply migrations. Configure the generated `.env` as instructed, then run `npm run dev`.

GitHub contains source and migrations, not local credentials, customer data, result uploads, browser drafts or login sessions. Do not copy production data merely to review a design.

Customer mail is off by default. See [`EMAIL_NOTIFICATIONS.md`](EMAIL_NOTIFICATIONS.md) for local preview or SMTP testing with a recipient list or explicit `*` to allow all customer addresses. A signed-in, unverified visit to this page automatically requests a verification message; use preview mode for visual work. The local demo address cannot receive email. Do not disable verification or mark real accounts verified to bypass testing.

**Do not submit synthetic orders to the working app on `localhost:3000` or its working database.** Run `npm run test:smoke` for submission/verification checks; it creates a disposable app, PostgreSQL schema and result storage, forces email preview mode and cleans up afterwards. Use that isolated setup for manual synthetic submissions too; do not bypass the direct-script guard.

For presentation-only edits, run scoped ESLint and TypeScript checks and inspect desktop/mobile layouts. When changing the flow, also run the isolated smoke test. Follow [`AGENTS.md`](AGENTS.md); this installed Next.js version's guides are under `node_modules/next/dist/docs/`.

## Current implementation snapshot

- Sanger Standard/Pre-mixed, Whole Plasmid and independent Oligo ordering, with manual entry and mapped spreadsheet paste/CSV upload. Ready to load is retired.
- Persistent drafts, login handoff, order review and deduplicated submission.
- Global and customer-specific sequencing rates, saved historical order prices, admin search/filtering, customer profiles and order history.
- Standard Oligo at 25 nmol/Desalted/no modification is $0.25/base; other specifications need a separate quote. Specifications/shipping are captured, but the full quote/approval/production workflow is still future work.
- Dropboxes default for Sanger/Whole Plasmid, with public map/list and admin location management; exact box placement and pickup schedules remain to be confirmed.
- Password recovery, customer verification/order/hold/result notifications and staff registration/order alerts are implemented. Results are released after an uploaded file is checked and the order is explicitly completed. Actual customer email/result acceptance and reliable unattended customer-mail retry handling still require work.
- Needs-attention holds, private result handling, administrator pricing/customer management and immutable historical order snapshots are implemented. There is no online card payment or LIMS/instrument integration.

The AWS test deployment is live with HTTPS, managed PostgreSQL and private persistent result storage. A real owner-designated account has verified its email and been provisioned as administrator; cloud accounts and data are independent of local development. Read the [dated deployment evidence and remaining checks](deploy/aws/README.md) before claiming full production acceptance. Design commits do not deploy themselves, and this handoff does not authorize changes to the old seqforge.com site, company email or their DNS records.
