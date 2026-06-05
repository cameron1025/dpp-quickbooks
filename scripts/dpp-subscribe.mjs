// ============================================================
// scripts/dpp-subscribe.mjs
// ============================================================
// Subscribes our webhook URL to Deluxe/DPP events (TRANSACTION + ACH REJECT)
// via POST {base}/dpp/v1/events/subscribe.
//
// Reads credentials + username from the environment (loads .env.local).
// Nothing sensitive is printed.
//
// Usage:
//   node scripts/dpp-subscribe.mjs "<eventUri>"
//   node scripts/dpp-subscribe.mjs --list           (list current subscriptions, if supported)
//
// Env vars (in .env.local):
//   DPP_API_BASE        default https://api.deluxe.com
//   DPP_CLIENT_ID, DPP_CLIENT_SECRET, DPP_PARTNER_TOKEN
//   DPP_USERNAME        the Deluxe account username the subscription is under

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function loadEnvLocal() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* rely on real env */
  }
}
loadEnvLocal();

const API_BASE = process.env.DPP_API_BASE || "https://api.deluxe.com";
const CLIENT_ID = process.env.DPP_CLIENT_ID;
const CLIENT_SECRET = process.env.DPP_CLIENT_SECRET;
const PARTNER_TOKEN = process.env.DPP_PARTNER_TOKEN;
const USERNAME = process.env.DPP_USERNAME;

const eventUri = process.argv[2];

function fail(m) {
  console.error(`\n[dpp-subscribe] ERROR: ${m}\n`);
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET || !PARTNER_TOKEN) {
  fail("Missing DPP_CLIENT_ID / DPP_CLIENT_SECRET / DPP_PARTNER_TOKEN in .env.local.");
}
if (!USERNAME) fail("Missing DPP_USERNAME in .env.local (your Deluxe account username).");
if (!eventUri) fail('Missing eventUri. Pass the webhook URL as the first arg.');

async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API_BASE}/secservices/oauth2/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  if (!res.ok) fail(`Token request failed (HTTP ${res.status}): ${text}`);
  const json = JSON.parse(text);
  if (!json.access_token) fail(`No access_token: ${text}`);
  console.log(`[dpp-subscribe] Got access token (expires_in=${json.expires_in ?? "?"}s).`);
  return json.access_token;
}

async function subscribe(accessToken) {
  const bodyObj = {
    userName: USERNAME,
    events: [
      { eventUri, eventType: "TRANSACTION" },
      { eventUri, eventType: "ACH REJECT" },
    ],
  };
  const res = await fetch(`${API_BASE}/dpp/v1/events/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      partnerToken: PARTNER_TOKEN,
    },
    body: JSON.stringify(bodyObj),
  });
  const text = await res.text();
  console.log(`\n[dpp-subscribe] subscribe HTTP ${res.status}`);
  console.log(`[dpp-subscribe] eventUri: ${eventUri}`);
  console.log(`[dpp-subscribe] response body:\n${text}\n`);
}

(async () => {
  console.log(`[dpp-subscribe] API base: ${API_BASE}`);
  const token = await getAccessToken();
  await subscribe(token);
})();
