# DPP Payments × QuickBooks Online Integration

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env.local
# Fill in your Supabase + Intuit credentials

# 3. Run the database migration
# Paste scripts/001_schema.sql into Supabase SQL Editor

# 4. Start development
npm run dev
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App (Railway)                  │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌───────────────────────┐ │
│  │ Dashboard │  │ Learn More│  │ Settings              │ │
│  │ (React)   │  │ (Static)  │  │ (Sync config)         │ │
│  └─────┬─────┘  └───────────┘  └───────────────────────┘ │
│        │                                                  │
│  ┌─────┴─────────────────────────────────────────────┐   │
│  │                 API Routes                          │   │
│  │  /api/quickbooks/connect    → OAuth initiation      │   │
│  │  /api/quickbooks/callback   → Token exchange        │   │
│  │  /api/quickbooks/disconnect → User disconnect       │   │
│  │  /api/auth/disconnect-webhook → App Store disconnect│   │
│  │  /api/webhooks/quickbooks   → HMAC-validated hooks  │   │
│  │  /api/merchant/status       → Dashboard data        │   │
│  │  /api/health                → Railway health check  │   │
│  └───────────────────────────────────────────────────┘   │
│                        │                                  │
│  ┌─────────────────────┴──────────────────────────────┐  │
│  │              Core Libraries                         │  │
│  │  quickbooks/oauth.ts    → OAuth 2.0 + OpenID       │  │
│  │  quickbooks/client.ts   → QB API with auto-refresh │  │
│  │  quickbooks/webhooks.ts → HMAC-SHA256 validation   │  │
│  │  quickbooks/token-mgr   → Encrypted token storage  │  │
│  │  quickbooks/payment-sync→ DPP → QB sync service    │  │
│  │  encryption.ts          → AES-256-GCM              │  │
│  │  sanitize.ts            → XSS + Zod validation     │  │
│  │  rate-limit.ts          → Per-IP rate limiting      │  │
│  │  logger.ts              → Structured logging        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────┬────────────────┘
               │                          │
        ┌──────┴──────┐          ┌────────┴────────┐
        │  Supabase   │          │  QuickBooks API │
        │  (Postgres) │          │  (Intuit)       │
        │  - merchants│          │  - Payments     │
        │  - qb_tokens│          │  - Invoices     │
        │  - sync_log │          │  - Customers    │
        │  - webhooks │          └─────────────────┘
        └─────────────┘
               │
        ┌──────┴──────┐
        │ DPP Gateway │  ← You wire this up
        │ (Placeholder)│
        └─────────────┘
```

---

## Intuit App Store — 14 Technical Requirements Checklist

Track your progress toward App Store submission. Each item maps to
Intuit's technical review criteria.

### Section 1: UI Components

| # | Requirement | Status | File(s) |
|---|-------------|--------|---------|
| 1.1 | **"Connect to QuickBooks" button** uses approved Intuit branding (text-only, green #2CA01C, no logo inside button) | ✅ Done | `components/quickbooks/ConnectButton.tsx` |
| 1.2 | **"Disconnect" button/link** is in the same location as Connect. After disconnect, Connect button reappears. | ✅ Done | `components/quickbooks/ConnectButton.tsx`, `ConnectionStatus.tsx` |
| 1.3 | **QuickBooks spelled correctly** throughout — never abbreviated as "QB" or "QBO" in user-facing text | ✅ Done | All UI files |
| 1.4 | **"Learn more" page** exists with: app overview, how it integrates with QuickBooks, step-by-step usage | ✅ Done | `app/learn-more/page.tsx` |

### Section 2: OAuth 2.0 Connection

| # | Requirement | Status | File(s) |
|---|-------------|--------|---------|
| 2.1 | **OAuth 2.0 flow** initiates correctly from "Connect to QuickBooks" button | ✅ Done | `api/quickbooks/connect/route.ts` |
| 2.2 | **CSRF protection** via cryptographic state parameter validated on callback | ✅ Done | `api/quickbooks/connect/route.ts`, `callback/route.ts` |
| 2.3 | **Disconnect handling — both paths**: (a) user disconnects from app, (b) user disconnects from App Store | ✅ Done | `api/quickbooks/disconnect/route.ts`, `api/auth/disconnect-webhook/route.ts` |
| 2.4 | **App Store disconnect → static page**: user is redirected, not left in a broken state | ✅ Done | `api/auth/disconnect-webhook/route.ts` |
| 2.5 | **Token refresh** handles expired access tokens automatically without user intervention | ✅ Done | `lib/quickbooks/client.ts`, `token-manager.ts` |

### Section 3: OpenID Connect (if using Sign In with Intuit)

| # | Requirement | Status | File(s) |
|---|-------------|--------|---------|
| 3.1 | **Email verification check**: `emailVerified` must be `true` before granting access | ✅ Done | `api/quickbooks/callback/route.ts` |
| 3.2 | **"Sign in with Intuit" button** uses approved branding (text-only, dark) | ✅ Done | `components/quickbooks/SignInButton.tsx` |

### Section 4: Webhooks & Data

| # | Requirement | Status | File(s) |
|---|-------------|--------|---------|
| 4.1 | **HMAC-SHA256 webhook validation** on all incoming QuickBooks webhooks | ✅ Done | `lib/quickbooks/webhooks.ts`, `api/webhooks/quickbooks/route.ts` |
| 4.2 | **Webhook endpoint responds quickly** (200 OK) and processes asynchronously | ✅ Done | `api/webhooks/quickbooks/route.ts` |

### Section 5: Security Hardening

| # | Requirement | Status | File(s) |
|---|-------------|--------|---------|
| 5.1 | **Security headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options | ✅ Done | `next.config.js` |
| 5.2 | **Tokens encrypted at rest** (AES-256-GCM) | ✅ Done | `lib/encryption.ts` |
| 5.3 | **Input sanitization** / XSS prevention | ✅ Done | `lib/sanitize.ts` |
| 5.4 | **Rate limiting** on API endpoints | ✅ Done | `lib/rate-limit.ts` |
| 5.5 | **No sensitive data in URLs or logs** | ✅ Done | All route handlers |
| 5.6 | **`poweredByHeader: false`** in Next.js config | ✅ Done | `next.config.js` |

---

## Remaining Work (for you)

### DPP Gateway Integration
- [ ] Wire up `DPP_GATEWAY_URL` and `DPP_GATEWAY_API_KEY` in `.env.local`
- [ ] Implement the DPP webhook receiver at `/api/webhooks/dpp`
- [ ] Connect `PaymentSyncService.syncPayment()` to your real transaction flow

### Before Intuit Submission
- [ ] Run the schema SQL in your Supabase project
- [ ] Switch `QB_ENVIRONMENT` to `production` with production keys
- [ ] Set `QB_REDIRECT_URI` to your Railway production URL
- [ ] Set `QB_WEBHOOK_VERIFIER_TOKEN` from Intuit developer portal
- [ ] Deploy to Railway and verify health check at `/api/health`
- [ ] Test the full OAuth connect → sync → disconnect flow end-to-end
- [ ] Test App Store disconnect path (Intuit will test this during review)
- [ ] Run through all 14 checklist items above manually

### Railway Deployment
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link project
railway login
railway link

# Set environment variables
railway variables set QB_CLIENT_ID=xxx
railway variables set QB_CLIENT_SECRET=xxx
# ... (all vars from .env.example)

# Deploy
railway up
```

---

## File Structure

```
dpp-qb-fresh/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout + metadata
│   │   ├── globals.css                   # Tailwind + brand styles
│   │   ├── dashboard/page.tsx            # Main merchant dashboard
│   │   ├── learn-more/page.tsx           # Intuit-required info page
│   │   └── api/
│   │       ├── health/route.ts           # Railway health check
│   │       ├── merchant/status/route.ts  # Dashboard data
│   │       ├── quickbooks/
│   │       │   ├── connect/route.ts      # OAuth initiation
│   │       │   ├── callback/route.ts     # Token exchange
│   │       │   └── disconnect/route.ts   # User disconnect
│   │       ├── auth/
│   │       │   └── disconnect-webhook/   # App Store disconnect
│   │       └── webhooks/
│   │           └── quickbooks/route.ts   # HMAC-validated webhooks
│   ├── components/
│   │   └── quickbooks/
│   │       ├── ConnectButton.tsx          # Approved branding
│   │       ├── SignInButton.tsx           # Approved branding
│   │       └── ConnectionStatus.tsx      # Status card
│   ├── lib/
│   │   ├── quickbooks/
│   │   │   ├── oauth.ts                  # OAuth 2.0 + OpenID
│   │   │   ├── client.ts                 # API client
│   │   │   ├── webhooks.ts              # HMAC validation
│   │   │   ├── token-manager.ts         # Encrypted storage
│   │   │   └── payment-sync.ts          # DPP → QB bridge
│   │   ├── encryption.ts                # AES-256-GCM
│   │   ├── sanitize.ts                  # XSS + Zod
│   │   ├── rate-limit.ts               # Per-IP limiting
│   │   ├── logger.ts                    # Structured logging
│   │   └── supabase.ts                  # Client helpers
│   ├── middleware.ts                     # Auth + security
│   └── types/index.ts                   # TypeScript types
├── scripts/
│   └── 001_schema.sql                   # Supabase migration
├── next.config.js                       # Security headers + CSP
├── tailwind.config.ts                   # QB brand palette
├── Dockerfile                           # Railway production build
├── railway.toml                         # Railway config
├── .env.example                         # Environment template
└── package.json
```
