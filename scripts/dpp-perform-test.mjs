// ============================================================
// scripts/dpp-perform-test.mjs
// ============================================================
// Captures the REAL Deluxe/DPP webhook payload by:
//   1. Getting an OAuth access token (client_credentials)
//   2. Calling the DPP "Perform Test" endpoint, which POSTs a
//      sample webhook payload to a URL you choose (use a
//      https://webhook.site bucket to inspect it).
//
// Secrets are read from the environment (load .env.local), never
// hard-coded. Nothing sensitive is printed.
//
// Usage (PowerShell), after putting creds in .env.local:
//   node -r dotenv/config scripts/dpp-perform-test.mjs <testEndpointUrl> [eventType]
//   (dotenv isn't a dep here, so simplest is to set env inline — see the
//    instructions in chat. The script only needs the 4 env vars below.)
//
// Env vars:
//   DPP_API_BASE        default https://sandbox.api.deluxe.com  (use https://api.deluxe.com for prod)
//   DPP_CLIENT_ID       your Deluxe Client ID
//   DPP_CLIENT_SECRET   your Deluxe Client Secret
//   DPP_PARTNER_TOKEN   your Deluxe partnerToken
//
// Args:
//   testEndpointUrl     where Deluxe posts the sample payload (a webhook.site URL)
//   eventType           "Transaction" (default) or "ACH REJECT"

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Minimal .env.local loader — reads KEY=VALUE lines from the project root,
// ignores comments/blank lines, and does not overwrite already-set env vars.
// Splits on the first '=' only, so values with '=', spaces, or angle brackets
// are preserved verbatim (no shell sourcing involved).
function loadEnvLocal() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const envPath = join(here, "..", ".env.local");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env.local — rely on real environment variables instead.
  }
}

loadEnvLocal();

const API_BASE = process.env.DPP_API_BASE || "https://sandbox.api.deluxe.com";
const CLIENT_ID = process.env.DPP_CLIENT_ID;
const CLIENT_SECRET = process.env.DPP_CLIENT_SECRET;
const PARTNER_TOKEN = process.env.DPP_PARTNER_TOKEN;

const testEndpoint = process.argv[2];
const eventType = process.argv[3] || "Transaction";

function fail(msg) {
  console.error(`\n[dpp-perform-test] ERROR: ${msg}\n`);
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET || !PARTNER_TOKEN) {
  fail(
    "Missing credentials. Set DPP_CLIENT_ID, DPP_CLIENT_SECRET, DPP_PARTNER_TOKEN " +
      "(e.g. in .env.local) before running."
  );
}
if (!testEndpoint) {
  fail(
    "Missing test endpoint URL. Pass a https://webhook.site/<uuid> URL as the first argument."
  );
}

async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API_BASE}/secservices/oauth2/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });

  const text = await res.text();
  if (!res.ok) {
    fail(`Token request failed (HTTP ${res.status}). Body: ${text}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail(`Token response was not JSON: ${text}`);
  }

  if (!json.access_token) fail(`No access_token in response: ${text}`);
  console.log(
    `[dpp-perform-test] Got access token (expires_in=${json.expires_in ?? "?"}s).`
  );
  return json.access_token;
}

async function performTest(accessToken) {
  const res = await fetch(`${API_BASE}/dpp/v1/events/performTest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      partnerToken: PARTNER_TOKEN,
    },
    body: JSON.stringify({ eventType, testEndPoint: testEndpoint }),
  });

  const text = await res.text();
  console.log(`\n[dpp-perform-test] performTest HTTP ${res.status}`);
  console.log(`[dpp-perform-test] eventType="${eventType}"  ->  ${testEndpoint}`);
  console.log(`[dpp-perform-test] response body:\n${text}\n`);

  if (res.ok) {
    console.log(
      "[dpp-perform-test] Success — now open your webhook.site bucket to see the " +
        "exact payload Deluxe posted."
    );
  }
}

(async () => {
  console.log(`[dpp-perform-test] API base: ${API_BASE}`);
  const token = await getAccessToken();
  await performTest(token);
})();
