import { createHmac, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { blankOrder, blankReaction } from "../src/lib/order-intake";
import { parseSangerPaste } from "../src/lib/sanger-entry";
import { newPlasmidSample } from "../src/lib/whole-plasmid";

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
    headers: { "Idempotency-Key": randomUUID(), "X-Pricing-Revision": initialPricingRevision, origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
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
    assert.deepEqual(await sent.json(), { ok: true, delivery: "preview" });
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
    if (exerciseFailures) {
      const cooldown = await request("/api/account/email-verification", cookie, { next });
      assert.equal(cooldown.status, 429);
      assert.equal((await cooldown.json()).code, "VERIFICATION_COOLDOWN");
      assert.ok(Number(cooldown.headers.get("retry-after")) > 0);

      const invalid = new URL(verification);
      invalid.searchParams.set("token", "invalid-verification-token");
      const invalidResponse = await request(invalid.pathname + invalid.search);
      assert.ok([302, 303, 307].includes(invalidResponse.status));
      assert.ok(new URL(invalidResponse.headers.get("location") || "", origin).searchParams.has("error"));
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified, false);

      const now = Math.floor(Date.now() / 1000);
      const unsigned = [
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify({ email, iat: now - 7200, exp: now - 3600 })).toString("base64url"),
      ].join(".");
      const expired = new URL(verification);
      expired.searchParams.set("token", `${unsigned}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET || "").update(unsigned).digest("base64url")}`);
      const expiredResponse = await request(expired.pathname + expired.search);
      assert.ok([302, 303, 307].includes(expiredResponse.status));
      assert.match(new URL(expiredResponse.headers.get("location") || "", origin).searchParams.get("error") || "", /expired/i);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified, false);
    }

    // An email may open in another tab/browser. It verifies the mailbox but must
    // not manufacture a login session or submit the user's saved draft.
    const verified = await request(verification.pathname + verification.search);
    assert.ok([302, 303, 307].includes(verified.status));
    assert.equal(new URL(verified.headers.get("location") || "", origin).toString(), callback.toString());
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified, true);
    assert.deepEqual(await (await request("/api/account/email-verification", cookie)).json(), { email, verified: true }, "An existing session sees fresh verification state");
    assert.equal(await db.order.count(), beforeOrders, "Verifying a mailbox never automatically places an order");
    assert.equal(await db.session.count({ where: { userId: user.id } }), beforeSessions, "Verification does not silently switch or sign in accounts");
    const replay = await request(verification.pathname + verification.search);
    assert.ok([302, 303, 307].includes(replay.status));
    assert.equal(replay.headers.getSetCookie().length, 0);
    assert.equal(await db.session.count({ where: { userId: user.id } }), beforeSessions);
    const alreadyVerified = await request("/api/account/email-verification", cookie, { next });
    assert.equal(alreadyVerified.status, 200);
    assert.deepEqual(await alreadyVerified.json(), { ok: true, verified: true });
    const count = await db.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "CustomerNotification" WHERE "userId" = ${user.id} AND "kind" = 'VERIFY_EMAIL'`;
    assert.equal(count[0].count, 1, "Cooldown, token replay and verified-state checks do not duplicate emails");
  } finally { await db.$disconnect(); }
}

async function main() {
  const startingSchedule = await (await request("/api/pricing")).json();
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
  const admin = await signIn("admin@seqforge.local", "SeqForgeDemo!2026");
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
  const submit = (body: unknown) => fetch(origin + "/api/orders", { method: "POST", headers: { cookie: customer, origin, "Content-Type": "application/json", "Idempotency-Key": key, "X-Pricing-Revision": initialPricingRevision }, body: JSON.stringify(body) });
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
    method: "POST", headers: { cookie: customer, origin, "Content-Type": "application/json", "Idempotency-Key": oligoKey },
    body: JSON.stringify(body),
  });
  const oligoResponse = await submitOligo({ ...oligo, pricingSnapshot: { subtotalCents: 1, pendingQuote: false } });
  assert.equal(oligoResponse.status, 201, "Quote-pending Oligo orders do not require a sequencing rate revision");
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
      assert.ok(/pending.{0,50}(?:lab|quote|confirmation)|(?:price|quote).{0,50}pending/i.test(html), "Oligo price is explicitly pending confirmation");
      assert.ok(!html.includes("$0.00") && !html.includes("$0.01"), "Pending quotes are never shown as free or client-supplied prices");
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
    assert.equal(savedPrice.pendingQuote, true);
    assert.equal(savedPrice.subtotalCents, null);
    assert.deepEqual(savedPrice.lines, []);
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
  const form = new FormData();
  form.set("file", new File(["Synthetic sequencing result\n"], "synthetic-result.txt", { type: "text/plain" }));
  const upload = await fetch(origin + `/api/admin/orders/${id}/result`, { method: "POST", headers: { cookie: admin, origin }, body: form });
  assert.equal(upload.status, 200);
  const detail = await (await request(`/orders/${id}`, customer)).text();
  const resultId = detail.match(/href="\/api\/results\/([^"]+)"/)?.[1];
  assert.ok(resultId, "Customer should see the uploaded result");
  const download = await request(`/api/results/${resultId}`, customer);
  assert.equal(download.status, 200);
  assert.match(await download.text(), /Synthetic sequencing result/);
  const forbiddenDownload = await request(`/api/results/${resultId}`, otherCustomer);
  assert.equal(forbiddenDownload.status, 403);
  assert.ok(!(await forbiddenDownload.text()).includes("Synthetic sequencing result"));
  const schedule = await (await request("/api/pricing")).json();
  assert.equal(schedule.revision, startingSchedule.revision);
  const update = { ...schedule, rates: { ...schedule.rates, "plasmid-plate": 650 }, reason: "Isolated pricing regression" };
  assert.equal((await request("/api/admin/pricing", "", update, "PUT")).status, 403);
  assert.equal((await request("/api/admin/pricing", customer, update, "PUT")).status, 403);
  assert.equal((await request("/api/admin/pricing", admin, { ...update, rates: { ...update.rates, "plasmid-plate": -1 } }, "PUT")).status, 400);
  const changed = await request("/api/admin/pricing", admin, update, "PUT");
  assert.equal(changed.status, 200); assert.equal((await changed.json()).revision, schedule.revision + 1);
  assert.equal((await request("/api/admin/pricing", admin, update, "PUT")).status, 409);
  const stale = await request("/api/orders", customer, wholePlasmid);
  assert.equal(stale.status, 409); assert.equal((await stale.json()).code, "PRICE_CHANGED");
  const repriced = await fetch(origin + "/api/orders", { method: "POST", headers: { cookie: customer, origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID(), "X-Pricing-Revision": String(schedule.revision + 1) }, body: JSON.stringify(wholePlasmid) });
  assert.equal(repriced.status, 201);
  const repricedId = (await repriced.json()).id;
  assert.ok((await (await request(`/orders/${repricedId}`, customer)).text()).includes("$6.50"));
  assert.ok((await (await request(`/orders/${plasmidId}`, customer)).text()).includes("$5.00"), "Historical prices never change");
  assert.equal((await (await submit(order)).json()).id, id, "Retry after repricing returns the original order");
  assert.equal((await request("/api/orders", customer, { ...oligo, orderName: `SMOKE-OLIGO-AFTER-RATE-CHANGE-${stamp}` })).status, 201, "Unrelated sequencing rate changes do not block a quote-pending Oligo request");
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
  assert.deepEqual(await savedCustom.json(), { customerId, revision: 1, overrides: customInput.overrides });
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
    assert.deepEqual(customAudit.previousOverrides, {}); assert.deepEqual(customAudit.overrides, customInput.overrides);
    assert.ok((await (await request(profilePath, admin)).text()).includes(customInput.reason), "The customer profile displays its price-change audit");

    const resetPrice = await request(customPricingPath, admin, { revision: 1, overrides: {}, reason: "Restore standard rates in isolated test" }, "PUT");
    assert.equal(resetPrice.status, 200);
    assert.deepEqual(await resetPrice.json(), { customerId, revision: 2, overrides: {} });
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
    for (const item of customerMessages) {
      assert.equal(item.status, "PREVIEW");
      assert.equal(item.attempts, 0);
      assert.notEqual(item.recipient, "staff@example.test");
    }
  } finally { await mailDb.$disconnect(); }
  console.log("PASS: session-bound verification, unverified submission guard, cooldown, invalid/expired/replayed links, preserved return flow, one customer confirmation per order, and zero real customer sends.");
  console.log("PASS: internal-only registration/order preview notifications, deduplication, and zero real sends.");
  console.log("PASS: customer price permissions, private self-only quotes, scoped overrides, audit, stale-account/revision rejection, immutable snapshots, and reset.");
  console.log("PASS: customer search, saved contacts, scoped history, empty profiles, and admin-only access.");
  console.log("PASS: Oligo guest entry, validation, Standard/Modified persistence, pending quotes, idempotency, history/filtering, ownership, and production hold.");
  console.log("PASS: submission, immutable prices, price-change confirmation, admin price permissions/history, order search/filters, results, and customer isolation.");
  console.log(`Synthetic order: ${origin}/orders/${id}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
