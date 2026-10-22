# Design handoff: email verification page

Updated October 22, 2026. **This page's visual design needs revision. The current implementation is a functional placeholder, not an approved final design.**

中文交接：优先修改「邮箱验证」页面。希望有正式、可信的科研服务网站感觉，可以保留一点品牌亲和力和很克制的海豹元素。之前的大海豹、星星、气泡、漂浮信封和俏皮文案太卡通；后来的白底深蓝版本仍待设计伙伴重新调整。验证、返回原订单和草稿保存逻辑已经接好，请保留。

## Where to start

Local page: [`http://localhost:3000/verify-email`](http://localhost:3000/verify-email).

Order-return example: [`/verify-email?next=%2Forders%2Fnew%3Fservice%3Dsanger%26type%3Dstandard`](http://localhost:3000/verify-email?next=%2Forders%2Fnew%3Fservice%3Dsanger%26type%3Dstandard).

| File | Design responsibility |
| --- | --- |
| [`src/components/email-verification.tsx`](src/components/email-verification.tsx) | Primary page composition, headings, instructions, buttons, status messages, decorative trace SVG and small seal. Presentation starts at `const title` and the returned `<main>`; the preceding functions/effects implement the working flow. |
| [`src/components/email-verification.module.css`](src/components/email-verification.module.css) | Scoped layout, type, colors, spacing, responsive rules, focus states and motion. `.content` is the main action area; `.guide` is the secondary instructions panel; `.trace` and `.supportNote` are the current science/seal accents. |
| [`src/app/verify-email/page.tsx`](src/app/verify-email/page.tsx) | Server route, metadata, current signed-in account and real database verification state. Keep this behavior when restyling. |
| [`src/components/brand.tsx`](src/components/brand.tsx) | Shared SeqForge logo component. Changes affect other pages. |
| [`src/app/globals.css`](src/app/globals.css) | Shared website styles. Prefer the scoped verification stylesheet for this task to avoid changing ordering/admin screens accidentally. |
| [`src/components/auth-form.tsx`](src/components/auth-form.tsx) | Registration sends customers to verification; login/register preserve the order-return path. Related behavior, not the main redesign target. |

Existing assets: [`public/brand/assets/logo.webp`](public/brand/assets/logo.webp), [`public/brand/assets/seal-report.png`](public/brand/assets/seal-report.png), and [`public/brand/assets/seal-transparent.png`](public/brand/assets/seal-transparent.png). The current page uses `seal-report.png` as a small support accent. The seal can remain subtle or be omitted if the new composition works better without it.

## Visual direction

- Put the verification task, account email and primary action first. Use a clear information hierarchy and direct English copy.
- Aim for a professional scientific service: restrained navy/teal, readable typography, deliberate spacing, and a coherent relationship to the rest of SeqForge.
- Scientific line work is optional decoration; the current trace SVG is illustrative, not real sample data or a required design element.
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
- Verification does not automatically submit an order or switch the signed-in account. Returning to an order restores the existing continue/reset and review flow.
- Keep authentication, order API enforcement, recipient restrictions and notification queues intact during visual changes. Relevant logic lives in `src/lib/auth.ts`, `src/lib/order-resume.ts`, `src/lib/verification-return.ts`, `src/lib/customer-mail.ts`, `src/lib/customer-notifications.ts` and `src/app/api/`.

## Running and reviewing safely

Follow [`PC_HANDOFF_ZH.md`](PC_HANDOFF_ZH.md) for a fresh computer and [`README.md`](README.md) for current feature/setup details. Install Node.js 22.13+ and PostgreSQL, create a separate local database, run `npm ci`, and use `npm run setup` to prepare the local environment and apply migrations. Configure the generated `.env` as instructed, then run `npm run dev`.

GitHub contains source and migrations, not local credentials, customer data, result uploads, browser drafts or login sessions. Do not copy production data merely to review a design.

Customer mail is off by default. See [`EMAIL_NOTIFICATIONS.md`](EMAIL_NOTIFICATIONS.md) for local preview or explicitly allowlisted SMTP testing. A signed-in, unverified visit to this page automatically requests a verification message; use preview mode for visual work. The local demo address cannot receive email. Do not disable verification or mark real accounts verified to bypass testing.

**Do not submit synthetic orders to the working app on `localhost:3000` or its working database.** Run `npm run test:smoke` for submission/verification checks; it creates a disposable app, PostgreSQL schema and result storage, forces email preview mode and cleans up afterwards. Use that isolated setup for manual synthetic submissions too; do not bypass the direct-script guard.

For presentation-only edits, run scoped ESLint and TypeScript checks and inspect desktop/mobile layouts. When changing the flow, also run the isolated smoke test. Follow [`AGENTS.md`](AGENTS.md); this installed Next.js version's guides are under `node_modules/next/dist/docs/`.

## Current implementation snapshot

- Sanger Standard/Pre-mixed, Whole Plasmid and independent Oligo ordering, with manual entry and mapped spreadsheet paste/CSV upload. Ready to load is retired.
- Persistent drafts, login handoff, order review and deduplicated submission.
- Global and customer-specific sequencing rates, saved historical order prices, admin search/filtering, customer profiles and order history.
- Oligo specifications and shipping details; price remains pending a laboratory quote. A full quote/approval workflow is still future work.
- Separate staff alerts, customer verification and order-confirmation queues; restricted local SMTP testing. Password recovery and result-availability emails remain future work.

This repository handoff is **not a production deployment**. Hosting, public HTTPS domain configuration, company-owned production mail and operational setup remain separate launch work. Existing company mail, DNS and the old website have not been changed by this design work.
