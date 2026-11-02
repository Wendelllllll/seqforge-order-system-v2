import { createHmac, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { blankOrder, blankReaction } from "../src/lib/order-intake";
import { parseSangerPaste } from "../src/lib/sanger-entry";
import { newPlasmidSample } from "../src/lib/whole-plasmid";
import { runPasswordResetSmoke } from "./smoke-password-reset";
import { runDropboxAttentionSmoke } from "./smoke-dropboxes-attention";
import { DEFAULT_OLIGO_PRICING, DEFAULT_ADD_ONS } from "../src/lib/rate-schedule";
import { runPricingCatalogSmoke } from "./smoke-pricing-catalog";
import { runLargeSangerSmoke } from "./smoke-large-sanger";
import { runFragmentSmoke } from "./smoke-fragment";

// Only the isolated runner may supply the test server and disposable database schema.
const origin = process.env.SEQFORGE_SMOKE_ORIGIN || "";
const testSchema = process.env.SEQFORGE_SMOKE_SCHEMA || "";
if (!/^seqforge_smoke_[a-f0-9]{32}$/.test(testSchema)
  || new URL(process.env.DATABASE_URL || "postgresql://invalid").searchParams.get("schema") !== testSchema
  || !/^http:\/\/localhost:\d+$/.test(origin)
  || new URL(origin).port === "3000") {
  throw new Error("Run npm run test:smoke. Direct smoke tests against the working application are disabled.");
}
assert.equal(process.env.INTERNAL_MAIL_MODE, "preview", "Synthetic staff mail must stay in preview");
assert.equal(process.env.CUSTOMER_MAIL_MODE, "preview", "Synthetic customer mail must stay in preview");
assert.equal(process.env.CUSTOMER_MAIL_ALLOWED_RECIPIENTS, "", "A smoke run must not inherit live recipient permissions");
assert.equal(process.env.SMTP_PASSWORD, "", "A smoke run must never inherit a real sending credential");
let initialPricingRevision = "";
async function request(path: string, cookie = "", body?: unknown, method = body === undefined ? "GET" : "POST", extraHeaders: Record<string, string> = {}) {
  return fetch(origin + path, {
    method, redirect: "manual",
    headers: { "Idempotency-Key": randomUUID(), "X-Pricing-Revision": initialPricingRevision, "X-Pricing-Catalog-Version": "2", origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function signIn(email: string, password: string) {
  const response = await request("/api/auth/sign-in/email", "", { email, password });
  assert.equal(response.status, 200, "Demo sign-in should succeed");
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

async function verifyCustomer(cookie: string, email: string, next: string, exerciseFailures = false) {
  const db = new PrismaClient();
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.emailVerified, false);
    const beforeOrders = await db.order.count();
    const beforeSessions = await db.session.count({ where: { userId: user.id } });
    const status = await request("/api/account/email-verification", cookie);
    assert.equal(status.status, 200);
    assert.match(status.headers.get("cache-control") || "", /private.*no-store/);
    assert.deepEqual(await status.json(), { email, verified: false });
    if (exerciseFailures) {
      assert.equal((await request("/api/account/email-verification")).status, 401);
      assert.equal((await request("/api/account/email-verification", "", { next })).status, 401);
      assert.equal((await request("/api/account/email-verification", cookie, { next }, "POST", { origin: "https://untrusted.example" })).status, 403);
      assert.equal((await request("/api/auth/send-verification-email", "", { email, callbackURL: "/dashboard" })).status, 403, "The raw endpoint cannot bypass the signed-in flow");
    }
    const sent = await request("/api/account/email-verification", cookie, { next, email: "forged-recipient@example.test" });
    assert.equal(sent.status, 200);
    assert.deepEqual(await sent.json(), { ok: true, email, delivery: "preview" });
    const messages = await db.$queryRaw<{ bodyText: string; recipient: string; status: string; attempts: number }[]>`
      SELECT "bodyText", "recipient", "status", "attempts" FROM "CustomerNotification" WHERE "userId" = ${user.id} AND "kind" = 'VERIFY_EMAIL'`;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].recipient, email, "A request body cannot redirect a verification token to another recipient");
    assert.equal(messages[0].status, "PREVIEW");
    assert.equal(messages[0].attempts, 0);
    const links = [...messages[0].bodyText.matchAll(/https?:\/\/[^\s<>]+/g)].map(match => new URL(match[0]));
    const verification = links.find(link => link.origin === origin && link.pathname === "/api/auth/verify-email");
    assert.ok(verification, "Preview mail must contain the real application verification link");
    const callback = new URL(verification.searchParams.get("callbackURL") || "", origin);
    assert.equal(callback.origin, origin);
    assert.equal(callback.pathname, "/verify-email");
    assert.equal(callback.searchParams.get("next"), next, "Email links retain the selected order flow");
    assert.equal(callback.searchParams.get("verified"), "1");
    const token = verification.searchParams.get("token");
    assert.ok(token, "Preview mail must include a signed verification token");

    async function confirmEmail(confirmationToken: string | undefined, returnTo = next, requestOrigin: string | null = origin) {
      const body = new URLSearchParams({ next: returnTo });
      if (confirmationToken !== undefined) body.set("token", confirmationToken);
      return fetch(`${origin}/api/account/email-verification/confirm`, {
        method: "POST", redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...(requestOrigin === null ? {} : { origin: requestOrigin }) },
        body,
      });
    }

    function redirectLocation(response: Response, pathname: string) {
      assert.equal(response.status, 303, "Verification transitions must use a redirect that returns to GET");
      const location = response.headers.get("location");
      assert.ok(location, "Verification transitions must include a destination");
      const destination = new URL(location, origin);
      assert.equal(destination.origin, origin, "Verification cannot redirect to another site");
      assert.equal(destination.pathname, pathname);
      return destination;
    }

    async function assertVerificationState(expected: boolean, action: string) {
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified, expected, action);
      assert.equal(await db.order.count(), beforeOrders, `${action}: no order is submitted`);
      assert.equal(await db.session.count({ where: { userId: user.id } }), beforeSessions, `${action}: no login session is created`);
      const count = await db.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "CustomerNotification" WHERE "userId" = ${user.id} AND "kind" = 'VERIFY_EMAIL'`;
      assert.equal(count[0].count, 1, `${action}: no extra verification email is queued`);
    }

    // Email scanners can follow the link and render its destination. Neither
    // GET nor HEAD, with or without the customer's session, confirms a mailbox.
    const scanned = await fetch(verification, { redirect: "manual" });
    const confirmation = redirectLocation(scanned, "/verify-email/confirm");
    assert.equal(confirmation.searchParams.get("token"), token);
    assert.equal(confirmation.searchParams.get("next"), next);
    assert.equal(confirmation.searchParams.has("verified"), false);
    assert.equal(scanned.headers.getSetCookie().length, 0);
    const scannedHead = await fetch(verification, { method: "HEAD", redirect: "manual" });
    assert.equal(redirectLocation(scannedHead, "/verify-email/confirm").toString(), confirmation.toString());
    assert.equal(scannedHead.headers.getSetCookie().length, 0);
    const signedInScan = await request(verification.pathname + verification.search, cookie);
    assert.equal(redirectLocation(signedInScan, "/verify-email/confirm").toString(), confirmation.toString());
    for (const pageCookie of ["", cookie]) {
      const confirmationPage = await request(confirmation.pathname + confirmation.search, pageCookie);
      assert.equal(confirmationPage.status, 200);
      const html = await confirmationPage.text();
      assert.ok(html.includes("Confirm my email"), "The email link displays a deliberate confirmation button");
      const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi)?.find(candidate => /action="\/api\/account\/email-verification\/confirm"/.test(candidate));
      assert.ok(form, "Confirmation uses the dedicated form endpoint");
      assert.ok(/<form\b[^>]*method="post"/i.test(form), "Confirmation requires a native POST form");
      const inputs = form.match(/<input\b[^>]*>/gi) || [];
      for (const name of ["token", "next"]) {
        assert.ok(inputs.some(input => /type="hidden"/i.test(input) && input.includes(`name="${name}"`)), `Confirmation preserves ${name} as a hidden form field`);
      }
    }
    await assertVerificationState(false, "Scanning an email link and its confirmation page does not verify the account");

    if (exerciseFailures) {
      const cooldown = await request("/api/account/email-verification", cookie, { next });
      assert.equal(cooldown.status, 429);
      assert.equal((await cooldown.json()).code, "VERIFICATION_COOLDOWN");
      assert.ok(Number(cooldown.headers.get("retry-after")) > 0);

      for (const requestOrigin of [null, "https://untrusted.example", "null"]) {
        assert.equal((await confirmEmail(token, next, requestOrigin)).status, 403, "Confirmation rejects missing, foreign and null origins");
        await assertVerificationState(false, "An untrusted confirmation cannot verify the account");
      }

      const missingToken = new URL(verification);
      missingToken.searchParams.delete("token");
      const missingDestination = redirectLocation(await request(missingToken.pathname + missingToken.search), "/verify-email");
      assert.equal(missingDestination.searchParams.get("error"), "INVALID_TOKEN");
      assert.equal(missingDestination.searchParams.get("next"), next);

      for (const invalidToken of [undefined, "", "invalid-verification-token", "x".repeat(4097)]) {
        const invalidDestination = redirectLocation(await confirmEmail(invalidToken), "/verify-email");
        assert.equal(invalidDestination.searchParams.get("error"), "INVALID_TOKEN");
        assert.equal(invalidDestination.searchParams.get("next"), next);
        assert.equal(invalidDestination.searchParams.has("token"), false);
        await assertVerificationState(false, "An invalid confirmation cannot verify the account");
      }

      const now = Math.floor(Date.now() / 1000);
      const unsigned = [
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify({ email, iat: now - 7200, exp: now - 3600 })).toString("base64url"),
      ].join(".");
      const expired = new URL(verification);
      expired.searchParams.set("token", `${unsigned}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET || "").update(unsigned).digest("base64url")}`);
      const expiredLanding = redirectLocation(await request(expired.pathname + expired.search), "/verify-email/confirm");
      assert.equal(expiredLanding.searchParams.get("token"), expired.searchParams.get("token"), "GET leaves token validation to the deliberate confirmation");
      const expiredDestination = redirectLocation(await confirmEmail(expired.searchParams.get("token")!), "/verify-email");
      assert.match(expiredDestination.searchParams.get("error") || "", /expired/i);
      assert.equal(expiredDestination.searchParams.get("next"), next);
      await assertVerificationState(false, "An expired confirmation cannot verify the account");

      for (const unsafeCallback of ["https://untrusted.example/verify-email?next=/orders/new", "//untrusted.example/verify-email", `${origin}/admin`, `${origin}/verify-email?next=https://untrusted.example`]) {
        const unsafeLink = new URL(verification);
        unsafeLink.searchParams.set("callbackURL", unsafeCallback);
        const safeLanding = redirectLocation(await request(unsafeLink.pathname + unsafeLink.search), "/verify-email/confirm");
        assert.equal(safeLanding.searchParams.get("token"), token);
        assert.equal(safeLanding.searchParams.get("next"), "/dashboard", "Untrusted callbacks fall back to the account dashboard");
      }
      for (const unsafeNext of ["https://untrusted.example", "//untrusted.example", "/admin"]) {
        const safeFailure = redirectLocation(await confirmEmail("invalid-verification-token", unsafeNext), "/verify-email");
        assert.equal(safeFailure.searchParams.get("next"), "/dashboard", "Confirmation sanitizes submitted return destinations");
        assert.equal(safeFailure.searchParams.get("error"), "INVALID_TOKEN");
      }
      await assertVerificationState(false, "Invalid return paths and passive links cannot verify the account");
    }

    // A deliberate confirmation can run in another browser without signing in,
    // manufacturing a login session, or submitting the customer's saved draft.
    const verified = await confirmEmail(token);
    assert.equal(redirectLocation(verified, "/verify-email").toString(), callback.toString());
    assert.equal(verified.headers.getSetCookie().length, 0);
    await assertVerificationState(true, "Only a trusted deliberate POST verifies the account");
    assert.deepEqual(await (await request("/api/account/email-verification", cookie)).json(), { email, verified: true }, "An existing session sees fresh verification state");
    const replayScan = await request(verification.pathname + verification.search);
    assert.equal(redirectLocation(replayScan, "/verify-email/confirm").toString(), confirmation.toString());
    const replay = await confirmEmail(token);
    assert.equal(redirectLocation(replay, "/verify-email").toString(), callback.toString());
    assert.equal(replay.headers.getSetCookie().length, 0);
    await assertVerificationState(true, "Replaying a link leaves an already verified account unchanged");
    if (exerciseFailures) {
      const safeReplay = redirectLocation(await confirmEmail(token, "https://untrusted.example"), "/verify-email");
      assert.equal(safeReplay.searchParams.get("next"), "/dashboard");
      assert.equal(safeReplay.searchParams.get("verified"), "1");
      assert.equal(safeReplay.searchParams.has("token"), false);
      assert.equal(redirectLocation(await confirmEmail("invalid-verification-token"), "/verify-email").searchParams.get("error"), "INVALID_TOKEN");
      await assertVerificationState(true, "An invalid later confirmation never revokes existing verification");
    }
    const alreadyVerified = await request("/api/account/email-verification", cookie, { next });
    assert.equal(alreadyVerified.status, 200);
    assert.deepEqual(await alreadyVerified.json(), { ok: true, email, verified: true });
    const count = await db.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "CustomerNotification" WHERE "userId" = ${user.id} AND "kind" = 'VERIFY_EMAIL'`;
    assert.equal(count[0].count, 1, "Cooldown, token replay and verified-state checks do not duplicate emails");
  } finally { await db.$disconnect(); }
}

async function main() {
  const admin = await signIn("admin@seqforge.local", "SeqForgeDemo!2026");
  const legacySchedule = await (await request("/api/pricing")).json();
  const initialize = await request("/api/admin/pricing", admin, { revision: legacySchedule.revision, rates: legacySchedule.rates, oligo: DEFAULT_OLIGO_PRICING, addOns: DEFAULT_ADD_ONS, reason: "Initialize isolated catalog test" }, "PUT");
  assert.equal(initialize.status, 200);
  const startingSchedule = await (await request("/api/pricing")).json();
  assert.deepEqual(startingSchedule.oligo, DEFAULT_OLIGO_PRICING, "Public Oligo pricing follows managed length tiers");
  assert.ok(Number.isInteger(startingSchedule.revision) && startingSchedule.revision > 0);
  initialPricingRevision = String(startingSchedule.revision);
  const stamp = Date.now();
  const email = `smoke-${stamp}@demo.local`;
  const password = "SyntheticTest!2026";
  const signup = await request("/api/auth/sign-up/email", "", {
    email, password, name: "Synthetic Workflow Test", firstName: "Synthetic", lastName: "Test",
    organization: "Demo only", labName: "Automated test",
  });
  assert.equal(signup.status, 200);
  const customerId = (await signup.json()).user.id as string;
  const customer = await signIn(email, password);
  const otherCustomer = await signIn("scientist@demo.local", "DemoCustomer!2026");
  const order = blankOrder();
  order.fulfillment = { deliveryMethod: "Pickup", pickupLocation: "Demo institute, building A, room 101", pickupInstructions: "Reception", contactName: "Demo Scientist", contactPhone: "555-0100", piName: "Demo PI", billingOrganization: "Demo University", billingContactName: "Demo Finance", billingEmail: "finance@demo.local", billingAddress: "1 Demo Way, Demo City", paymentMethod: "Invoice" };
  order.fulfillment.pickupLocation = `V4-PICKUP-${stamp}`;
  assert.equal((await request("/api/account/order-defaults", "", order.fulfillment, "PUT")).status, 401);
  assert.equal((await request("/api/account/order-defaults", admin, order.fulfillment, "PUT")).status, 401);
  assert.equal((await request("/api/account/order-defaults", customer, { ...order.fulfillment, paymentMethod: "Credit card" }, "PUT")).status, 400);
  assert.equal((await fetch(origin + "/api/account/order-defaults", { method: "PUT", headers: { cookie: customer, origin: "https://example.invalid", "Content-Type": "application/json" }, body: JSON.stringify(order.fulfillment) })).status, 403);
  assert.equal((await request("/api/account/order-defaults", customer, { ...order.fulfillment, userId: "forged-other-account" }, "PUT")).status, 200);
  assert.ok((await (await request("/account", customer)).text()).includes(order.fulfillment.pickupLocation));
  assert.ok((await (await request("/orders/new", customer)).text()).includes("What would you like to order?"));
  assert.ok(!(await (await request("/account", otherCustomer)).text()).includes(order.fulfillment.pickupLocation));
  const sangerOptions = await request("/orders/new?service=sanger");
  assert.equal(sangerOptions.status, 200);
  const sangerOptionsHtml = await sangerOptions.text();
  assert.ok(sangerOptionsHtml.includes("Standard") && sangerOptionsHtml.includes("Pre-mixed"));
  assert.ok(!sangerOptionsHtml.includes("Ready to load"), "The retired submission type is absent from current service choices");
  for (const service of ["sanger", "nanopore", "molecular"]) {
    const servicePage = await request(`/services/${service}`);
    assert.equal(servicePage.status, 200);
    const serviceHtml = await servicePage.text();
    assert.ok(!/Sample planner|Download order plan|Online ordering is being finalized|id="(?:sf-order|ob-builder)"/i.test(serviceHtml), "Service pages do not offer the disconnected sample planner");
    const targetService = service === "nanopore" ? "whole-plasmid" : service === "molecular" ? "oligo" : "sanger";
    assert.ok(serviceHtml.includes(`/orders/new?service=${targetService}`), "Supported service calls to action link to real ordering");
  }
  const retiredEntry = await request("/orders/new?service=sanger&type=ready-to-load");
  assert.equal(retiredEntry.status, 307);
  assert.equal(retiredEntry.headers.get("location"), "/orders/new?service=sanger&retired=ready-to-load");
  const retiredNotice = await request("/orders/new?service=sanger&retired=ready-to-load");
  assert.equal(retiredNotice.status, 200);
  assert.ok((await retiredNotice.text()).includes("This submission type is no longer offered."));
  const publicPricingScript = await (await request("/brand/lab.js")).text();
  assert.ok(!publicPricingScript.includes("Ready to load") && !publicPricingScript.includes("sanger-ready-"), "Public pricing has no retired option");
  order.orderName = `SMOKE-DEMO-${stamp}`;
  order.container = "Plate";
  order.priority = "Same day requested";
  Object.assign(order.samples[0], { sampleName: "Synthetic clone", plateLabel: "Demo-P1", well: "A1", concentration: "100", templateLength: "3200" });
  Object.assign(order.samples[0].reactions[0], { primerSource: "SeqForge universal primer", primerName: "M13F" });
  order.samples[0].reactions.push({ ...blankReaction(), primerSource: "Stored at SeqForge", primerName: "Stored-demo", storedPrimerReference: "DEMO-STORED-7" });
  assert.equal((await request("/api/orders", "", order)).status, 401);
  assert.equal((await request("/api/orders", admin, order)).status, 401);
  const unverifiedSubmission = await request("/api/orders", customer, order);
  assert.equal(unverifiedSubmission.status, 403);
  assert.equal((await unverifiedSubmission.json()).code, "EMAIL_NOT_VERIFIED");
  const guardDb = new PrismaClient();
  try { assert.equal(await guardDb.order.count({ where: { userId: customerId } }), 0, "An unverified customer cannot create an order"); }
  finally { await guardDb.$disconnect(); }
  await verifyCustomer(customer, email, "/orders/new?service=sanger&type=standard", true);
  await verifyCustomer(otherCustomer, "scientist@demo.local", "/orders/new?service=oligo&type=modified");
  assert.equal((await request("/api/orders", customer, { ...order, priority: "Forged" })).status, 400);
  assert.equal((await fetch(origin + "/api/orders", { method: "POST", headers: { "Idempotency-Key": randomUUID(), cookie: customer, "Content-Type": "application/json", origin }, body: "{" })).status, 400);
  assert.equal((await fetch(origin + "/api/orders", { method: "POST", headers: { "Idempotency-Key": randomUUID(), cookie: customer, "Content-Type": "application/json", origin: "https://example.invalid" }, body: JSON.stringify(order) })).status, 403);
  const key = randomUUID();
  const submit = (body: unknown) => fetch(origin + "/api/orders", { method: "POST", headers: { cookie: customer, origin, "Content-Type": "application/json", "Idempotency-Key": key, "X-Pricing-Revision": initialPricingRevision, "X-Pricing-Catalog-Version": "2" }, body: JSON.stringify(body) });
  const created = await submit({ ...order, pricingSnapshot: { subtotalCents: 1 } });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const retry = await submit(order);
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).id, id);
  assert.equal((await submit({ ...order, orderName: "Changed payload" })).status, 409);
  assert.equal((await request("/api/orders", customer, { ...order, orderName: order.orderName.toLowerCase() })).status, 201);
  assert.equal((await request("/api/account/order-defaults", customer, { ...order.fulfillment, pickupLocation: `UPDATED-${stamp}` }, "PUT")).status, 200);
  for (const path of [`/orders/${id}`, `/manifest/${id}`]) {
    const mine = await request(path, customer);
    assert.equal(mine.status, 200);
    const html = await mine.text();
    assert.ok(html.includes(order.fulfillment.pickupLocation), "Order retains original pickup snapshot after account changes");
    assert.ok(html.includes(order.fulfillment.billingEmail));
    assert.ok(html.includes("DEMO-STORED-7"), "Stored-primer details should persist");
    assert.ok(html.includes("Same day requested"));
    assert.ok(html.includes("$9.00"), "Server calculates two plate Standard reactions despite forged client pricing");
    const other = await request(path, otherCustomer);
    assert.equal(other.status, 404);
    assert.ok(!(await other.text()).includes(order.orderName), "Other customers must not receive order content");
    const anonymous = await request(path);
    assert.ok([307, 303].includes(anonymous.status));
    assert.ok(!(await anonymous.text()).includes(order.orderName));
  }
  const adminView = await request(`/admin/orders/${id}`, admin);
  const premix = { ...order, orderName: `SMOKE-PREMIX-${stamp}`, submissionMode: "Pre-mixed" as const, priority: "Standard" as const };
  const pasted = parseSangerPaste("Sample name\tLength (bp)\tConcentration\tPrimer\nSynthetic mix A\t3200\t100\tT7\nSynthetic mix B\t4100\t80\tM13R", premix);
  assert.deepEqual(pasted.errors, []);
  premix.samples = pasted.samples;
  const retiredSubmission = await request("/api/orders", customer, { ...premix, submissionMode: "Ready to load" });
  assert.equal(retiredSubmission.status, 400, "Stale clients cannot submit a retired order type");
  assert.ok((await retiredSubmission.text()).includes("no longer offered"));
  const premixResponse = await request("/api/orders", customer, premix);
  assert.equal(premixResponse.status, 201);
  const premixId = (await premixResponse.json()).id;
  for (const path of [`/orders/${premixId}`, `/admin/orders/${premixId}`, `/manifest/${premixId}`]) {
    const html = await (await request(path, path.startsWith("/admin") ? admin : customer)).text();
    assert.ok(html.includes("Synthetic mix A") && html.includes("Synthetic mix B"), "Pasted pre-mixed samples persist");
    assert.ok(html.includes("B1"), "Vertical plate position persists");
    assert.ok(html.includes("$7.00"), "Server prices two pre-mixed plate reactions");
  }
  assert.equal(adminView.status, 200);
  const wholePlasmid = { ...order, service: "WHOLE_PLASMID", submissionMode: "Whole plasmid", priority: "Standard", orderName: `SMOKE-WHOLE-PLASMID-${stamp}`, samples: [{ ...newPlasmidSample([], "Plate"), sampleName: "Synthetic whole plasmid", templateLength: "5000", concentration: "100", notes: "Whole plasmid note" }] };
  assert.equal((await request("/api/orders", "", wholePlasmid)).status, 401);
  assert.equal((await request("/api/orders", customer, { ...wholePlasmid, service: "SANGER" })).status, 400);
  const plasmidResponse = await request("/api/orders", customer, { ...wholePlasmid, pricingSnapshot: { subtotalCents: 1 } });
  assert.equal(plasmidResponse.status, 201);
  const plasmidId = (await plasmidResponse.json()).id;
  for (const path of [`/orders/${plasmidId}`, `/admin/orders/${plasmidId}`, `/manifest/${plasmidId}`]) {
    const html = await (await request(path, path.startsWith("/admin") ? admin : customer)).text();
    assert.ok(html.includes("Whole Plasmid Sequencing"));
    assert.ok(html.includes("Synthetic whole plasmid") && html.includes("Whole plasmid note"));
    assert.ok(html.includes("$5.00"), "Server prices the whole plasmid sample at $5 despite forged pricing");
    assert.ok(!html.includes("Sanger sequencing ·"));
  }
  assert.equal((await request(`/orders/${plasmidId}`, otherCustomer)).status, 404);
  const largePlasmid = { ...wholePlasmid, orderName: `SMOKE-LARGE-PLASMID-${stamp}`, samples: [{ ...wholePlasmid.samples[0], templateLength: "12001" }] };
  const largeResponse = await request("/api/orders", customer, { ...largePlasmid, pricingSnapshot: { subtotalCents: 500 } });
  assert.equal(largeResponse.status, 201);
  const largeId = (await largeResponse.json()).id;
  for (const path of [`/orders/${largeId}`, `/admin/orders/${largeId}`, `/manifest/${largeId}`]) {
    const html = await (await request(path, path.startsWith("/admin") ? admin : customer)).text();
    assert.ok(html.includes("$15.00"), "The server charges $15 above 12 kb and preserves that price across views");
  }
  for (const type of ["standard", "modified"]) {
    const entry = await request(`/orders/new?service=oligo&type=${type}`);
    assert.equal(entry.status, 200, "Guests can prepare Oligo orders before signing in");
    const html = await entry.text();
    assert.ok(html.includes("Create an Oligo synthesis order"), "The public Oligo entry route renders before browser draft hydration");
    assert.ok(!html.includes("The order form for this service is not available yet."), "Oligo entry is a real order flow");
  }
  const oligo = {
    ...order, service: "OLIGO" as const, submissionMode: "Oligo standard" as const,
    priority: "Standard" as const, container: "Tubes" as const, samples: [],
    orderName: `SMOKE-OLIGO-${stamp}`, specialInstructions: "Please confirm the quote before synthesis.",
    fulfillment: { ...order.fulfillment, pickupLocation: "", pickupInstructions: "" },
    oligoShippingAddress: `OLIGO-DELIVERY-${stamp}, 1 Demo Way, San Diego, CA 92101, US`,
    oligoFormat: "Dry" as const,
    oligos: [{
      name: `Oligo-${stamp}-forward`, sequence: "acgt acgt\nacgtacgtacgt",
      synthesisScale: "25 nmol", purification: "Desalted", modification5: "", modification3: "",
      modificationInternal: "", notes: "Synthetic test oligo, disposable environment only",
    }],
  };
  assert.equal((await request("/api/orders", "", oligo)).status, 401);
  assert.equal((await request("/api/orders", admin, oligo)).status, 401);
  for (const invalid of [
    { ...oligo, oligos: [{ ...oligo.oligos[0], sequence: "ACGT/5Phos/123" }] },
    { ...oligo, oligos: [oligo.oligos[0], { ...oligo.oligos[0], name: oligo.oligos[0].name.toUpperCase() }] },
    { ...oligo, oligoShippingAddress: "" },
    { ...oligo, oligos: [{ ...oligo.oligos[0], modification5: "Phosphate" }] },
    { ...oligo, submissionMode: "Oligo modified" },
    { ...oligo, samples: order.samples },
  ]) assert.equal((await request("/api/orders", customer, invalid)).status, 400, "Invalid Oligo specifications are rejected before saving");
  const oligoKey = randomUUID();
  const submitOligo = (body: unknown) => fetch(origin + "/api/orders", {
    method: "POST", headers: { cookie: customer, origin, "Content-Type": "application/json", "Idempotency-Key": oligoKey, "X-Pricing-Revision": initialPricingRevision, "X-Pricing-Catalog-Version": "2" },
    body: JSON.stringify(body),
  });
  const oligoResponse = await submitOligo({ ...oligo, pricingSnapshot: { subtotalCents: 1, pendingQuote: false } });
  assert.equal(oligoResponse.status, 201, "Oligo orders use the reviewed managed price revision");
  const oligoId = (await oligoResponse.json()).id;
  const oligoRetry = await submitOligo(oligo);
  assert.equal(oligoRetry.status, 201);
  assert.equal((await oligoRetry.json()).id, oligoId, "Retrying an Oligo submission preserves the same order");
  assert.equal((await submitOligo({ ...oligo, orderName: "Changed Oligo payload" })).status, 409);
  const modifiedOligo = {
    ...oligo, submissionMode: "Oligo modified" as const, orderName: `SMOKE-OLIGO-MODIFIED-${stamp}`,
    oligoFormat: "Resuspended" as const,
    oligos: [{ ...oligo.oligos[0], name: `Oligo-${stamp}-modified`, sequence: "ACGTRYSWKMBDHVN", purification: "HPLC", modification5: "Phosphate", modificationInternal: "Biotin at base 7; confirm feasibility" }],
  };
  const modifiedResponse = await request("/api/orders", customer, modifiedOligo);
  assert.equal(modifiedResponse.status, 201);
  const modifiedOligoId = (await modifiedResponse.json()).id;
  for (const [oligoOrderId, expected] of [[oligoId, oligo], [modifiedOligoId, modifiedOligo]] as const) {
    for (const path of [`/orders/${oligoOrderId}`, `/manifest/${oligoOrderId}`, `/admin/orders/${oligoOrderId}`]) {
      const response = await request(path, path.startsWith("/admin") ? admin : customer);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(expected.oligos[0].name) && html.includes(expected.oligoShippingAddress), "Oligo names and outbound delivery survive submission");
      assert.ok(html.includes(expected.oligos[0].sequence.replace(/\s/g, "").toUpperCase()), "The saved normalized sequence is visible");
      if (expected.submissionMode === "Oligo standard") {
        assert.ok(html.includes("$5.00") && html.includes("$0.25"), "Twenty standard bases cost $5 at $0.25/base in customer, admin and print views");
      } else {
        assert.ok(/pending.{0,50}(?:lab|quote|confirmation)|(?:price|quote).{0,50}pending/i.test(html), "Modified Oligo pricing remains explicitly pending confirmation");
      }
      assert.ok(!html.includes("$0.00") && !html.includes("$0.01"), "Oligos are never shown as free or priced from a client-supplied snapshot");
      assert.ok(!html.includes("Samples and primers ·") && !html.includes("Sanger sequencing ·"), "Oligo manifests do not invent sequencing samples or reactions");
      if (expected.submissionMode === "Oligo modified") assert.ok(html.includes("Phosphate") && html.includes("Biotin at base 7"));
    }
    for (const path of [`/orders/${oligoOrderId}`, `/manifest/${oligoOrderId}`]) {
      assert.equal((await request(path, otherCustomer)).status, 404);
      assert.ok([303, 307].includes((await request(path)).status));
    }
  }
  assert.equal((await request(`/api/admin/orders/${oligoId}/status`, admin, { status: "RECEIVED" }, "PATCH")).status, 200);
  for (const status of ["PROCESSING", "SEQUENCED", "QC", "COMPLETED"]) {
    assert.equal((await request(`/api/admin/orders/${oligoId}/status`, admin, { status }, "PATCH")).status, 409, "Quote-pending Oligos cannot enter production");
  }
  const blockedOligoResult = new FormData();
  blockedOligoResult.set("file", new File(["Synthetic Oligo result"], "oligo-result.txt", { type: "text/plain" }));
  assert.equal((await fetch(origin + `/api/admin/orders/${oligoId}/result`, { method: "POST", headers: { cookie: admin, origin }, body: blockedOligoResult })).status, 409, "Result upload cannot bypass the pending-quote hold");
  const isolatedDb = new PrismaClient();
  try {
    const savedOligo = await isolatedDb.order.findUniqueOrThrow({ where: { id: oligoId }, include: { samples: { include: { reactions: true } }, result: true } });
    assert.equal(savedOligo.service, "OLIGO");
    assert.equal(savedOligo.samples.length, 0, "Oligos are separate synthesis items, not placeholder DNA samples");
    assert.deepEqual(savedOligo.oligoSnapshot, { items: [{ ...oligo.oligos[0], sequence: "ACGTACGTACGTACGTACGT" }], shippingAddress: oligo.oligoShippingAddress, format: oligo.oligoFormat, searchNames: oligo.oligos[0].name });
    const savedPrice = savedOligo.pricingSnapshot as { pendingQuote: boolean; subtotalCents: number | null; lines: unknown[] };
    assert.notEqual(savedPrice.pendingQuote, true);
    assert.equal(savedPrice.subtotalCents, 500);
    assert.equal(savedPrice.lines.length, 1);
    const modifiedPrice = (await isolatedDb.order.findUniqueOrThrow({ where: { id: modifiedOligoId } })).pricingSnapshot as { pendingQuote: boolean; subtotalCents: number | null };
    assert.equal(modifiedPrice.pendingQuote, true);
    assert.equal(modifiedPrice.subtotalCents, null);
    assert.equal(savedOligo.status, "RECEIVED");
    assert.equal(savedOligo.result, null);
  } finally { await isolatedDb.$disconnect(); }
  const oligoFilter = await (await request(`/admin/orders?service=OLIGO&q=${encodeURIComponent(oligo.orderName)}`, admin)).text();
  assert.ok(oligoFilter.includes(`/admin/orders/${oligoId}`));
  assert.ok(!oligoFilter.includes(`/admin/orders/${id}`));
  const oligoHistory = await (await request(`/admin/customers/${customerId}?service=OLIGO`, admin)).text();
  assert.ok(oligoHistory.includes(`/admin/orders/${oligoId}`) && oligoHistory.includes(`/admin/orders/${modifiedOligoId}`));
  assert.ok(!oligoHistory.includes(`/admin/orders/${plasmidId}`));
  for (const path of ["/orders", "/dashboard", "/admin"]) {
    const html = await (await request(path, path === "/admin" ? admin : customer)).text();
    assert.ok(html.includes(path === "/admin" ? `/admin/orders/${oligoId}` : `/orders/${oligoId}`), `${path} includes the Oligo order`);
  }
  for (const path of ["/dashboard", "/orders", "/admin"]) {
    const html = await (await request(path, path === "/admin" ? admin : customer)).text();
    assert.ok(html.includes("Whole Plasmid Sequencing"), `${path} identifies the service`);
  }
  assert.ok((await adminView.text()).includes("DEMO-STORED-7"));
  const adminManifest = await request(`/manifest/${id}`, admin);
  assert.equal(adminManifest.status, 200);
  const customerAdminView = await request(`/admin/orders/${id}`, otherCustomer);
  assert.ok([307, 303].includes(customerAdminView.status));
  assert.ok(!(await customerAdminView.text()).includes(order.orderName));
  assert.equal((await request(`/api/admin/orders/${id}/status`, customer, { status: "RECEIVED" }, "PATCH")).status, 403);
  assert.equal((await request(`/api/admin/orders/${id}/status`, admin, { status: "RECEIVED" }, "PATCH")).status, 200);
  assert.ok((await (await request(`/orders/${id}`, customer)).text()).includes("Received"));
  assert.equal((await request(`/api/admin/orders/${id}/status`, admin, { status: "COMPLETED" }, "PATCH")).status, 409, "Completion requires an uploaded result");
  const form = new FormData();
  form.set("file", new File(["Synthetic sequencing result\n"], "synthetic-result.txt", { type: "text/plain" }));
  const upload = await fetch(origin + `/api/admin/orders/${id}/result`, { method: "POST", headers: { cookie: admin, origin }, body: form });
  assert.equal(upload.status, 200);
  const resultDb = new PrismaClient();
  let unpublishedResultId = "";
  try {
    const saved = await resultDb.order.findUniqueOrThrow({ where: { id }, include: { result: true } });
    assert.equal(saved.status, "RECEIVED", "Uploading does not publish or complete the order");
    assert.ok(saved.result);
    unpublishedResultId = saved.result.id;
    const notices = await resultDb.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "CustomerNotification" WHERE "kind" = 'RESULT_READY'`;
    assert.equal(notices[0].count, 0, "No result email is queued before the administrator completes the order");
  } finally { await resultDb.$disconnect(); }
  assert.ok(!(await (await request(`/orders/${id}`, customer)).text()).includes(`/api/results/${unpublishedResultId}`), "Unpublished results stay out of customer pages");
  assert.ok([403, 404].includes((await request(`/api/results/${unpublishedResultId}`, customer)).status));
  assert.equal((await request(`/api/results/${unpublishedResultId}`, admin)).status, 200, "Administrators can inspect uploaded results before publication");
  const completions = await Promise.all(Array.from({ length: 4 }, () => request(`/api/admin/orders/${id}/status`, admin, { status: "COMPLETED" }, "PATCH")));
  assert.ok(completions.every(response => response.status === 200), "Concurrent completion requests are idempotent");
  const detail = await (await request(`/orders/${id}`, customer)).text();
  const resultId = detail.match(/href="\/api\/results\/([^"]+)"/)?.[1];
  assert.ok(resultId, "Customer should see the uploaded result");
  const download = await request(`/api/results/${resultId}`, customer);
  assert.equal(download.status, 200);
  assert.match(await download.text(), /Synthetic sequencing result/);
  const forbiddenDownload = await request(`/api/results/${resultId}`, otherCustomer);
  assert.equal(forbiddenDownload.status, 403);
  assert.ok(!(await forbiddenDownload.text()).includes("Synthetic sequencing result"));
  const replacement = new FormData();
  replacement.set("file", new File(["Corrected synthetic result\n"], "synthetic-corrected.txt", { type: "text/plain" }));
  assert.equal((await fetch(origin + `/api/admin/orders/${id}/result`, { method: "POST", headers: { cookie: admin, origin }, body: replacement })).status, 409, "A published result cannot be silently overwritten");
  assert.equal((await request(`/api/admin/orders/${id}/status`, admin, { status: "QC" }, "PATCH")).status, 200);
  assert.ok([403, 404].includes((await request(`/api/results/${resultId}`, customer)).status), "Moving back to QC withdraws customer access");
  assert.equal((await fetch(origin + `/api/admin/orders/${id}/result`, { method: "POST", headers: { cookie: admin, origin }, body: replacement })).status, 200);
  assert.equal((await request(`/api/admin/orders/${id}/status`, admin, { status: "COMPLETED" }, "PATCH")).status, 200);
  assert.match(await (await request(`/api/results/${resultId}`, customer)).text(), /Corrected synthetic result/);
  const schedule = await (await request("/api/pricing")).json();
  assert.equal(schedule.revision, startingSchedule.revision);
  const update = { revision: schedule.revision, rates: { ...schedule.rates, "plasmid-plate": 650 }, reason: "Isolated pricing regression" };
  assert.equal((await request("/api/admin/pricing", "", update, "PUT")).status, 403);
  assert.equal((await request("/api/admin/pricing", customer, update, "PUT")).status, 403);
  assert.equal((await request("/api/admin/pricing", admin, { ...update, rates: { ...update.rates, "plasmid-plate": -1 } }, "PUT")).status, 400);
  assert.equal((await request("/api/admin/pricing", admin, { ...update, oligo: { ...schedule.oligo, longUnitCents: -1 } }, "PUT")).status, 400, "Oligo prices must be valid nonnegative USD cents");
  const changed = await request("/api/admin/pricing", admin, update, "PUT");
  assert.equal(changed.status, 200); assert.equal((await changed.json()).revision, schedule.revision + 1);
  assert.equal((await request("/api/admin/pricing", admin, update, "PUT")).status, 409);
  const stale = await request("/api/orders", customer, wholePlasmid);
  assert.equal(stale.status, 409); assert.equal((await stale.json()).code, "PRICE_CHANGED");
  const repriced = await fetch(origin + "/api/orders", { method: "POST", headers: { cookie: customer, origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID(), "X-Pricing-Revision": String(schedule.revision + 1), "X-Pricing-Catalog-Version": "2" }, body: JSON.stringify(wholePlasmid) });
  assert.equal(repriced.status, 201);
  const repricedId = (await repriced.json()).id;
  assert.ok((await (await request(`/orders/${repricedId}`, customer)).text()).includes("$6.50"));
  assert.ok((await (await request(`/orders/${plasmidId}`, customer)).text()).includes("$5.00"), "Historical prices never change");
  assert.equal((await (await submit(order)).json()).id, id, "Retry after repricing returns the original order");
  const oligoRevisionDb = new PrismaClient();
  try {
    for (const [kind, original] of [["STANDARD", oligo], ["MODIFIED", modifiedOligo]] as const) {
      const refreshedOligo = { ...original, orderName: `SMOKE-OLIGO-${kind}-AFTER-RATE-CHANGE-${stamp}` };
      const refreshedKey = randomUUID();
      const beforeRejected = await oligoRevisionDb.order.count();
      const staleOligo = await request("/api/orders", customer, refreshedOligo, "POST", { "Idempotency-Key": refreshedKey });
      assert.equal(staleOligo.status, 409, "Every new Oligo order requires review of the current pricing revision, including quote-pending specifications");
      const latestPrice = await staleOligo.json();
      assert.equal(latestPrice.code, "PRICE_CHANGED");
      assert.equal(latestPrice.schedule.revision, schedule.revision + 1);
      assert.equal(await oligoRevisionDb.order.count(), beforeRejected, "A stale Oligo review does not save an order");
      const resubmittedOligo = await request("/api/orders", customer, refreshedOligo, "POST", {
        "Idempotency-Key": refreshedKey,
        "X-Pricing-Revision": String(latestPrice.schedule.revision),
        "X-Customer-Pricing-Revision": String(latestPrice.schedule.customerRevision ?? 0),
        "X-Pricing-Customer-Id": customerId,
      });
      assert.equal(resubmittedOligo.status, 201, "Reviewing the returned current price allows the preserved Oligo draft to be submitted");
      assert.equal(await oligoRevisionDb.order.count(), beforeRejected + 1);
    }
    assert.equal((await (await submitOligo(oligo)).json()).id, oligoId, "A saved Oligo retry still returns the original order after repricing");
  } finally { await oligoRevisionDb.$disconnect(); }
  const pricingPage = await request("/admin/pricing", admin);
  assert.equal(pricingPage.status, 200); assert.ok((await pricingPage.text()).includes("Isolated pricing regression"));
  const filtered = await (await request(`/admin/orders?service=WHOLE_PLASMID&q=${encodeURIComponent(wholePlasmid.orderName)}`, admin)).text();
  assert.ok(filtered.includes(`/admin/orders/${plasmidId}`)); assert.ok(!filtered.includes(`/admin/orders/${id}`));
  const noMatch = await (await request("/admin/orders?q=no-such-test-order", admin)).text();
  assert.ok(noMatch.includes("No matching orders"));
  assert.ok([303, 307].includes((await request("/admin/pricing", customer)).status));
  const directory = await request(`/admin/customers?q=${encodeURIComponent(email)}`, admin);
  assert.equal(directory.status, 200);
  const directoryHtml = await directory.text();
  assert.ok(directoryHtml.includes(`/admin/customers/${customerId}`));
  assert.ok(!directoryHtml.includes("mailto:scientist@demo.local"));
  assert.ok(!directoryHtml.includes("mailto:admin@seqforge.local"));
  const profilePath = `/admin/customers/${customerId}`;
  const profile = await request(profilePath, admin);
  assert.equal(profile.status, 200);
  const profileHtml = await profile.text();
  assert.ok(profileHtml.includes(email) && profileHtml.includes("Order history"));
  assert.ok(profileHtml.includes(`UPDATED-${stamp}`), "Profile shows saved current defaults");
  assert.ok(profileHtml.includes(order.fulfillment.billingEmail));
  assert.ok(profileHtml.includes(`/admin/orders/${id}`) && profileHtml.includes(`/admin/orders/${plasmidId}`));
  const otherId = (await (await request("/api/auth/get-session", otherCustomer)).json()).user.id;
  const lockedHistory = await (await request(`${profilePath}?customer=${otherId}&service=WHOLE_PLASMID`, admin)).text();
  assert.ok(lockedHistory.includes(`/admin/orders/${plasmidId}`), "History cannot be redirected to another customer by query parameters");
  assert.ok(!lockedHistory.includes(`/admin/orders/${id}`), "Service filter remains effective within customer history");
  const emptyProfile = await (await request(`/admin/customers/${otherId}`, admin)).text();
  assert.ok(emptyProfile.includes("No orders yet") && emptyProfile.includes("No reusable delivery or billing details"));
  assert.ok(!emptyProfile.includes(`/admin/orders/${id}`));
  const inactive = await (await request("/admin/customers?orders=without", admin)).text();
  assert.ok(inactive.includes("mailto:scientist@demo.local") && !inactive.includes(`mailto:${email}`));
  assert.ok((await (await request("/admin/customers?q=no-such-customer", admin)).text()).includes("No matching customers"));
  const adminId = (await (await request("/api/auth/get-session", admin)).json()).user.id;
  for (const invalidId of ["missing-customer", adminId]) {
    const invalid = await request(`/admin/customers/${invalidId}`, admin);
    assert.equal(invalid.status, 404);
  }
  for (const path of ["/admin/customers", profilePath]) for (const unauthorized of ["", customer, otherCustomer]) {
    const response = await request(path, unauthorized);
    assert.ok([303, 307].includes(response.status));
    assert.ok(!(await response.text()).includes(email), "Customer contact data is admin-only");
  }

  const customPricingPath = `/api/admin/customers/${customerId}/pricing`;
  const customInput = { revision: 0, overrides: { "plasmid-plate": 400, "sanger-standard-plate": 300 }, reason: "Isolated customer contract rate" };
  for (const unauthorized of ["", customer, otherCustomer]) {
    assert.equal((await request(customPricingPath, unauthorized, customInput, "PUT")).status, 403, "Only an admin can set customer prices");
  }
  assert.equal((await request(customPricingPath, admin, customInput, "PUT", { origin: "https://example.invalid" })).status, 403);
  assert.equal((await fetch(origin + customPricingPath, { method: "PUT", headers: { cookie: admin, "Content-Type": "application/json" }, body: JSON.stringify(customInput) })).status, 403, "Price edits require an origin");
  for (const invalid of [
    { ...customInput, overrides: { "plasmid-plate": -1 } },
    { ...customInput, overrides: { "sanger-ready-plate": 200 } },
    { ...customInput, reason: " " },
    { ...customInput, customerId: otherId },
  ]) assert.equal((await request(customPricingPath, admin, invalid, "PUT")).status, 400);
  for (const invalidId of ["missing-customer", adminId]) {
    assert.equal((await request(`/api/admin/customers/${invalidId}/pricing`, admin, customInput, "PUT")).status, 404);
  }
  assert.equal((await request("/api/account/pricing")).status, 401);
  assert.equal((await request("/api/account/pricing", admin)).status, 401);
  const publicBeforeCustom = await (await request("/api/pricing")).json();
  const savedCustom = await request(customPricingPath, admin, customInput, "PUT");
  assert.equal(savedCustom.status, 200);
  assert.deepEqual(await savedCustom.json(), { customerId, revision: 1, overrides: customInput.overrides, oligoOverrides: {}, addOnOverrides: {} });
  const staleCustomEdit = await request(customPricingPath, admin, customInput, "PUT");
  assert.equal(staleCustomEdit.status, 409);
  assert.equal((await staleCustomEdit.json()).pricing.revision, 1);
  const ownPrice = await request(`/api/account/pricing?customerId=${otherId}`, customer);
  assert.equal(ownPrice.status, 200);
  assert.match(ownPrice.headers.get("cache-control") || "", /private/);
  assert.match(ownPrice.headers.get("cache-control") || "", /no-store/);
  assert.match(ownPrice.headers.get("vary") || "", /cookie/i);
  const ownSchedule = await ownPrice.json();
  assert.equal(ownSchedule.customerId, customerId, "A query parameter cannot select another account's price list");
  assert.equal(ownSchedule.customerRevision, 1);
  assert.equal(ownSchedule.rates["plasmid-plate"], 400);
  assert.equal(ownSchedule.rates["plasmid-large-plate"], publicBeforeCustom.rates["plasmid-large-plate"]);
  assert.deepEqual(ownSchedule.overriddenKeys, ["sanger-standard-plate", "plasmid-plate"]);
  const otherScheduleBefore = await (await request(`/api/account/pricing?customerId=${customerId}`, otherCustomer)).json();
  assert.equal(otherScheduleBefore.customerId, otherId);
  assert.equal(otherScheduleBefore.customerRevision, 0);
  assert.equal(otherScheduleBefore.rates["plasmid-plate"], 650);
  assert.deepEqual(await (await request("/api/pricing", customer)).json(), publicBeforeCustom, "Public pricing is unaffected even with a customer session");
  const otherCustom = await request(`/api/admin/customers/${otherId}/pricing`, admin, { revision: 0, overrides: { "plasmid-plate": 525 }, reason: "Different isolated customer rate" }, "PUT");
  assert.equal(otherCustom.status, 200);
  const otherSchedule = await (await request("/api/account/pricing", otherCustomer)).json();
  assert.equal(otherSchedule.customerRevision, 1);
  assert.equal(otherSchedule.rates["plasmid-plate"], 525);

  const pricingDb = new PrismaClient();
  try {
    const beforeRejected = await pricingDb.order.count();
    const currentGlobalHeader = { "X-Pricing-Revision": String(ownSchedule.revision) };
    const staleCustomOrder = await request("/api/orders", customer, wholePlasmid, "POST", { ...currentGlobalHeader, "X-Customer-Pricing-Revision": "0", "X-Pricing-Customer-Id": customerId });
    assert.equal(staleCustomOrder.status, 409);
    const staleCustomPayload = await staleCustomOrder.json();
    assert.equal(staleCustomPayload.code, "PRICE_CHANGED");
    assert.equal(staleCustomPayload.schedule.customerId, customerId);
    assert.equal(staleCustomPayload.schedule.rates["plasmid-plate"], 400);
    const wrongAccountOrder = await request("/api/orders", otherCustomer, wholePlasmid, "POST", { ...currentGlobalHeader, "X-Customer-Pricing-Revision": "1", "X-Pricing-Customer-Id": customerId });
    assert.equal(wrongAccountOrder.status, 409, "Equal customer revision numbers do not allow a quote to cross accounts");
    const wrongAccountPayload = await wrongAccountOrder.json();
    assert.equal(wrongAccountPayload.code, "ACCOUNT_CHANGED");
    assert.equal(wrongAccountPayload.schedule, undefined);
    const wrongAccountOligo = await request("/api/orders", otherCustomer, oligo, "POST", { "X-Pricing-Customer-Id": customerId });
    assert.equal(wrongAccountOligo.status, 409, "Quote-pending Oligos also reject a changed account");
    assert.equal((await wrongAccountOligo.json()).code, "ACCOUNT_CHANGED");
    assert.equal(await pricingDb.order.count(), beforeRejected, "Rejected price checks never create orders");

    const customKey = randomUUID();
    const customOrder = { ...wholePlasmid, orderName: `SMOKE-CUSTOM-PRICE-${stamp}` };
    const customHeaders = { ...currentGlobalHeader, "Idempotency-Key": customKey, "X-Customer-Pricing-Revision": "1", "X-Pricing-Customer-Id": customerId };
    const customOrderResponse = await request("/api/orders", customer, { ...customOrder, pricingSnapshot: { subtotalCents: 1 } }, "POST", customHeaders);
    assert.equal(customOrderResponse.status, 201);
    const customOrderId = (await customOrderResponse.json()).id;
    const customRecord = await pricingDb.order.findUniqueOrThrow({ where: { id: customOrderId } });
    const customSnapshot = customRecord.pricingSnapshot as { subtotalCents: number; customerPricingRevision: number; lines: { customPrice: boolean }[] };
    assert.equal(customSnapshot.subtotalCents, 400);
    assert.equal(customSnapshot.customerPricingRevision, 1);
    assert.equal(customSnapshot.lines[0].customPrice, true);
    const otherOrderResponse = await request("/api/orders", otherCustomer, wholePlasmid, "POST", { ...currentGlobalHeader, "X-Customer-Pricing-Revision": "1", "X-Pricing-Customer-Id": otherId });
    assert.equal(otherOrderResponse.status, 201);
    const otherOrderId = (await otherOrderResponse.json()).id;
    assert.equal(((await pricingDb.order.findUniqueOrThrow({ where: { id: otherOrderId } })).pricingSnapshot as { subtotalCents: number }).subtotalCents, 525);
    const customAudit = await pricingDb.customerPricingChange.findFirstOrThrow({ where: { customerId } });
    assert.equal(customAudit.actorId, adminId); assert.equal(customAudit.reason, customInput.reason);
    assert.deepEqual(customAudit.previousOverrides, { format: 2, overrides: {}, oligoOverrides: {}, addOnOverrides: {} });
    assert.deepEqual(customAudit.overrides, { format: 2, overrides: customInput.overrides, oligoOverrides: {}, addOnOverrides: {} });
    assert.ok((await (await request(profilePath, admin)).text()).includes(customInput.reason), "The customer profile displays its price-change audit");

    const resetPrice = await request(customPricingPath, admin, { revision: 1, overrides: {}, reason: "Restore standard rates in isolated test" }, "PUT");
    assert.equal(resetPrice.status, 200);
    assert.deepEqual(await resetPrice.json(), { customerId, revision: 2, overrides: {}, oligoOverrides: {}, addOnOverrides: {} });
    const resetSchedule = await (await request("/api/account/pricing", customer)).json();
    assert.equal(resetSchedule.customerRevision, 2);
    assert.equal(resetSchedule.rates["plasmid-plate"], 650);
    assert.deepEqual(resetSchedule.overriddenKeys, []);
    assert.equal((await pricingDb.customerPricing.findUniqueOrThrow({ where: { userId: customerId } })).revision, 2);
    assert.equal(await pricingDb.customerPricingChange.count({ where: { customerId } }), 2);
    const customRetry = await request("/api/orders", customer, customOrder, "POST", customHeaders);
    assert.equal(customRetry.status, 201); assert.equal((await customRetry.json()).id, customOrderId);
    assert.deepEqual((await pricingDb.order.findUniqueOrThrow({ where: { id: customOrderId } })).pricingSnapshot, customSnapshot);
    assert.ok((await (await request(`/orders/${customOrderId}`, customer)).text()).includes("$4.00"), "Historical custom prices survive a reset");
    const resetOrder = await request("/api/orders", customer, wholePlasmid, "POST", { ...currentGlobalHeader, "X-Customer-Pricing-Revision": "2", "X-Pricing-Customer-Id": customerId });
    assert.equal(resetOrder.status, 201);
    const resetOrderId = (await resetOrder.json()).id;
    assert.equal(((await pricingDb.order.findUniqueOrThrow({ where: { id: resetOrderId } })).pricingSnapshot as { subtotalCents: number }).subtotalCents, 650);
    assert.equal((await (await request("/api/account/pricing", otherCustomer)).json()).rates["plasmid-plate"], 525, "Resetting one account does not change another account's price");
    assert.deepEqual(await (await request("/api/pricing")).json(), publicBeforeCustom);
  } finally { await pricingDb.$disconnect(); }
  const mailDb = new PrismaClient();
  try {
    const notifications = await mailDb.$queryRaw<{ eventKey: string; kind: string; recipient: string; status: string; attempts: number; bodyText: string }[]>`SELECT "eventKey", "kind", "recipient", "status", "attempts", "bodyText" FROM "InternalNotification"`;
    assert.equal(notifications.filter(item => item.eventKey === `customer:${customerId}`).length, 1, "Signup queues one internal notification");
    const allOrders = await mailDb.order.findMany({ select: { id: true } });
    for (const savedOrder of allOrders) {
      assert.equal(notifications.filter(item => item.eventKey === `order:${savedOrder.id}`).length, 1, "Order retries must not duplicate notifications");
    }
    assert.ok(notifications.length > 0);
    for (const item of notifications) {
      assert.equal(item.recipient, "staff@example.test");
      assert.equal(item.status, "PREVIEW");
      assert.equal(item.attempts, 0, "Smoke tests never open a real mail transport");
    }
    const customerMessages = await mailDb.$queryRaw<{ eventKey: string; userId: string; kind: string; recipient: string; status: string; attempts: number; bodyText: string }[]>`
      SELECT "eventKey", "userId", "kind", "recipient", "status", "attempts", "bodyText" FROM "CustomerNotification"`;
    const ordersWithCustomers = await mailDb.order.findMany({ include: { user: { select: { email: true } } } });
    for (const savedOrder of ordersWithCustomers) {
      const confirmations = customerMessages.filter(item => item.eventKey === `order:${savedOrder.id}`);
      assert.equal(confirmations.length, 1, "Each saved order has exactly one confirmation, including idempotent retries");
      assert.equal(confirmations[0].kind, "ORDER_CONFIRMATION");
      assert.equal(confirmations[0].recipient, savedOrder.user.email, "Confirmation goes to the verified account rather than the billing address or internal staff");
      assert.equal(confirmations[0].userId, savedOrder.userId);
      assert.ok(confirmations[0].bodyText.includes(savedOrder.orderNumber));
      assert.ok(confirmations[0].bodyText.includes(`/orders/${savedOrder.id}`));
    }
    assert.equal(customerMessages.filter(item => item.kind === "ORDER_CONFIRMATION").length, ordersWithCustomers.length);
    assert.equal(customerMessages.filter(item => item.kind === "VERIFY_EMAIL").length, 2);
    const resultMessages = customerMessages.filter(item => item.kind === "RESULT_READY");
    assert.equal(resultMessages.length, 1, "Concurrent, repeated and reopened completion queues only one result-ready email per order");
    assert.equal(resultMessages[0].userId, customerId);
    assert.equal(resultMessages[0].recipient, email, "Result notices go only to the order owner's account email");
    assert.ok(resultMessages[0].bodyText.includes(`/orders/${id}`));
    assert.ok(!resultMessages[0].bodyText.includes("Synthetic sequencing result"), "The message links to the private order rather than exposing result content");
    for (const item of customerMessages) {
      assert.equal(item.status, "PREVIEW");
      assert.equal(item.attempts, 0);
      assert.notEqual(item.recipient, "staff@example.test");
    }
  } finally { await mailDb.$disconnect(); }
  const operationsDb = new PrismaClient();
  try { await runDropboxAttentionSmoke({ base: origin, db: operationsDb, customerCookie: customer, adminCookie: admin, otherCustomerCookie: otherCustomer }); }
  finally { await operationsDb.$disconnect(); }
  await runPricingCatalogSmoke({ origin, customerCookie: customer, adminCookie: admin, customerId, fulfillment: order.fulfillment });
  await runLargeSangerSmoke({ origin, customerCookie: customer, adminCookie: admin, customerId, fulfillment: order.fulfillment });
  await runFragmentSmoke({ origin, customerCookie: customer, adminCookie: admin, customerId, fulfillment: order.fulfillment });
  await runPasswordResetSmoke();
  console.log("PASS: session-bound verification, unverified submission guard, cooldown, invalid/expired/replayed links, preserved return flow, one customer confirmation per order, and zero real customer sends.");
  console.log("PASS: internal-only registration/order preview notifications, deduplication, and zero real sends.");
  console.log("PASS: customer price permissions, private self-only quotes, scoped overrides, audit, stale-account/revision rejection, immutable snapshots, and reset.");
  console.log("PASS: customer search, saved contacts, scoped history, empty profiles, and admin-only access.");
  console.log("PASS: Oligo guest entry, validation, $0.25/base standard pricing, modified quotes, immutable server snapshots, idempotency, ownership, and production hold.");
  console.log("PASS: explicit result publication, private draft downloads, result-ready email deduplication, replacement guard, and zero real sends.");
  console.log("PASS: submission, immutable prices, price-change confirmation, admin price permissions/history, order search/filters, results, and customer isolation.");
  console.log(`Synthetic order: ${origin}/orders/${id}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
