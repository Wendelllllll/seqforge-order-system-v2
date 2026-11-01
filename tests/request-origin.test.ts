import assert from "node:assert/strict";
import { test } from "node:test";
import { hasTrustedRequestOrigin } from "../src/lib/request-origin";

const publicOrigin = "https://demo.example.test";
const internalURL = "http://127.0.0.1:3100/api/account/email-verification";

function request(origin: string | null, url = internalURL, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { ...headers, ...(origin === null ? {} : { origin }) } });
}

test("public browser origin is accepted behind an internal HTTP reverse proxy", () => {
  assert.equal(hasTrustedRequestOrigin(request(publicOrigin), publicOrigin), true);
  assert.equal(hasTrustedRequestOrigin(request(publicOrigin), `${publicOrigin}/`), true);
});

test("configured public origin rejects other hosts, protocols, ports and absent origins", () => {
  for (const origin of [null, "null", "http://127.0.0.1:3100", "http://demo.example.test", "https://demo.example.test:444", "https://untrusted.example.test", `${publicOrigin}.untrusted.example.test`, `${publicOrigin}, https://untrusted.example.test`]) {
    assert.equal(hasTrustedRequestOrigin(request(origin), publicOrigin), false, String(origin));
  }
});

test("unconfigured development uses the request URL origin", () => {
  assert.equal(hasTrustedRequestOrigin(request("http://127.0.0.1:3100"), ""), true);
  assert.equal(hasTrustedRequestOrigin(request(publicOrigin), ""), false);
  assert.equal(hasTrustedRequestOrigin(request(null), ""), false);
});

test("invalid configured URLs fail closed without falling back to the request host", () => {
  for (const configured of ["not-a-url", " ", "//demo.example.test", "javascript:alert(1)", "file:///tmp/demo", "https://user:password@demo.example.test"]) {
    assert.equal(hasTrustedRequestOrigin(request(publicOrigin, `${publicOrigin}/api/orders`), configured), false, configured);
  }
});

test("request host and forwarded headers cannot substitute a different trusted origin", () => {
  const attacker = "https://untrusted.example.test";
  const headers = { host: "untrusted.example.test", "x-forwarded-host": "untrusted.example.test", "x-forwarded-proto": "https" };
  assert.equal(hasTrustedRequestOrigin(request(attacker, `${attacker}/api/orders`, headers), publicOrigin), false);
  assert.equal(hasTrustedRequestOrigin(request(publicOrigin, `${attacker}/api/orders`, headers), publicOrigin), true);
  assert.equal(hasTrustedRequestOrigin(request(attacker, internalURL, headers), ""), false);
});
