// ============================================================
// DPP × QuickBooks Integration — Type Definitions
// ============================================================

// ── Merchant / Connection ───────────────────────────────────

export interface Merchant {
  id: string;
  created_at: string;
  updated_at: string;
  company_name: string;
  email: string;
  qb_realm_id: string | null;
  qb_connected: boolean;
  qb_connected_at: string | null;
  qb_disconnected_at: string | null;
  dpp_merchant_id: string | null;
  status: "active" | "inactive" | "suspended";
  settings: MerchantSettings;
}

export interface MerchantSettings {
  auto_sync_payments: boolean;
  sync_frequency: "realtime" | "hourly" | "daily";
  default_deposit_account?: string;
  default_income_account?: string;
  webhook_url?: string;
}

// ── OAuth Tokens (encrypted at rest) ────────────────────────

export interface QBTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  id_token?: string;
  created_at: number;
  realm_id: string;
}

export interface QBTokenRecord {
  id: string;
  merchant_id: string;
  realm_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  created_at: string;
  updated_at: string;
}

// ── OpenID Connect Profile ──────────────────────────────────

export interface QBUserProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  givenName: string;
  familyName: string;
  phoneNumber?: string;
}

// ── QuickBooks API Entities ─────────────────────────────────

export interface QBPayment {
  Id?: string;
  TotalAmt: number;
  CustomerRef: { value: string; name?: string };
  CurrencyRef?: { value: string };
  PaymentMethodRef?: { value: string; name?: string };
  DepositToAccountRef?: { value: string };
  Line: QBPaymentLine[];
  TxnDate?: string;
  PrivateNote?: string;
  PaymentRefNum?: string;
}

export interface QBPaymentLine {
  Amount: number;
  LinkedTxn: Array<{
    TxnId: string;
    TxnType: "Invoice" | "CreditMemo" | "JournalEntry";
  }>;
}

export interface QBCustomer {
  Id?: string;
  DisplayName: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  CompanyName?: string;
  BillAddr?: QBAddress;
}

export interface QBAddress {
  Line1?: string;
  Line2?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
  Country?: string;
}

export interface QBInvoice {
  Id?: string;
  DocNumber?: string;
  TotalAmt: number;
  Balance: number;
  DueDate?: string;
  CustomerRef: { value: string; name?: string };
  Line: QBInvoiceLine[];
  EmailStatus?: "NotSet" | "NeedToSend" | "EmailSent";
  BillEmail?: { Address: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
  };
  PrimaryPhone?: { FreeFormNumber?: string };
  Status?: string;
}

export interface QBInvoiceLine {
  Amount: number;
  DetailType: "SalesItemLineDetail" | "SubTotalLineDetail";
  SalesItemLineDetail?: {
    ItemRef: { value: string; name?: string };
    Qty?: number;
    UnitPrice?: number;
  };
  Description?: string;
}

// ── DPP Gateway (placeholder types — you implement) ─────────

export interface DPPTransaction {
  id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  customer_email?: string;
  customer_name?: string;
  payment_method: string;
  created_at: string;
  metadata?: Record<string, string>;
}

export interface DPPWebhookEvent {
  id: string;
  type: "payment.completed" | "payment.failed" | "payment.refunded" | "charge.dispute";
  data: DPPTransaction;
  created_at: string;
  signature: string;
}

// ── Webhook Events ──────────────────────────────────────────

export interface QBWebhookPayload {
  eventNotifications: Array<{
    realmId: string;
    dataChangeEvent: {
      entities: Array<{
        name: string;
        id: string;
        operation: "Create" | "Update" | "Delete" | "Merge" | "Void";
        lastUpdated: string;
      }>;
    };
  }>;
}

// ── API Responses ───────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ── Session / Auth ──────────────────────────────────────────

export interface AppSession {
  merchant_id: string;
  email: string;
  qb_realm_id: string | null;
  qb_connected: boolean;
  expires_at: number;
}

// ── Dashboard Stats ─────────────────────────────────────────

export interface DashboardStats {
  total_payments_today: number;
  total_revenue_today: number;
  synced_invoices: number;
  pending_sync: number;
  connection_health: "healthy" | "degraded" | "disconnected";
  last_sync_at: string | null;
}
