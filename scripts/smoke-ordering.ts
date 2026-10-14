import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
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
let initialPricingRevision = "";
async function request(path: string, cookie = "", body?: unknown, method = body === undefined ? "GET" : "POST") {
  return fetch(origin + path, {
    method, redirect: "manual",
    headers: { "Idempotency-Key": randomUUID(), "X-Pricing-Revision": initialPricingRevision, origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function signIn(email: string, password: string) {
  const response = await request("/api/auth/sign-in/email", "", { email, password });
  assert.equal(response.status, 200, "Demo sign-in should succeed");
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
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
  order.orderName = `SMOKE-DEMO-${stamp}`;
  order.container = "Plate";
  order.priority = "Same day requested";
  Object.assign(order.samples[0], { sampleName: "Synthetic clone", plateLabel: "Demo-P1", well: "A1", concentration: "100", templateLength: "3200" });
  Object.assign(order.samples[0].reactions[0], { primerSource: "SeqForge universal primer", primerName: "M13F" });
  order.samples[0].reactions.push({ ...blankReaction(), primerSource: "Stored at SeqForge", primerName: "Stored-demo", storedPrimerReference: "DEMO-STORED-7" });
  assert.equal((await request("/api/orders", "", order)).status, 401);
  assert.equal((await request("/api/orders", admin, order)).status, 401);
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
  console.log("PASS: customer search, saved contacts, scoped history, empty profiles, and admin-only access.");
  console.log("PASS: submission, immutable prices, price-change confirmation, admin price permissions/history, order search/filters, results, and customer isolation.");
  console.log(`Synthetic order: ${origin}/orders/${id}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
