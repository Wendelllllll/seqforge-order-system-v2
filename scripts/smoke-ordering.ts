import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { blankOrder, blankReaction } from "../src/lib/order-intake";

// Run only against the local demo. Creates clearly named synthetic accounts and orders.
const origin = "http://localhost:3000";
async function request(path: string, cookie = "", body?: unknown, method = body === undefined ? "GET" : "POST") {
  return fetch(origin + path, {
    method, redirect: "manual",
    headers: { "Idempotency-Key": randomUUID(), origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function signIn(email: string, password: string) {
  const response = await request("/api/auth/sign-in/email", "", { email, password });
  assert.equal(response.status, 200, "Demo sign-in should succeed");
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}
async function main() {
  const stamp = Date.now();
  const email = `smoke-${stamp}@demo.local`;
  const password = "SyntheticTest!2026";
  const signup = await request("/api/auth/sign-up/email", "", {
    email, password, name: "Synthetic Workflow Test", firstName: "Synthetic", lastName: "Test",
    organization: "Demo only", labName: "Automated test",
  });
  assert.equal(signup.status, 200);
  const customer = await signIn(email, password);
  const otherCustomer = await signIn("scientist@demo.local", "DemoCustomer!2026");
  const admin = await signIn("admin@seqforge.local", "SeqForgeDemo!2026");
  const order = blankOrder();
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
  const submit = (body: unknown) => fetch(origin + "/api/orders", { method: "POST", headers: { cookie: customer, origin, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
  const created = await submit({ ...order, pricingSnapshot: { subtotalCents: 1 } });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const retry = await submit(order);
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).id, id);
  assert.equal((await submit({ ...order, orderName: "Changed payload" })).status, 409);
  for (const path of [`/orders/${id}`, `/manifest/${id}`]) {
    const mine = await request(path, customer);
    assert.equal(mine.status, 200);
    const html = await mine.text();
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
  assert.equal(adminView.status, 200);
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
  console.log("PASS: customer submission, persisted manifest, admin review/status/upload, result delivery, and cross-customer isolation.");
  console.log(`Synthetic order: ${origin}/orders/${id}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
