// ============================================================
// QuickBooks Online API Client
// ============================================================
// Wraps QB API calls with automatic token refresh, error
// handling, and retry logic.

import { QBCustomer, QBInvoice, QBPayment, QBTokens } from "@/types";
import { refreshAccessToken, isTokenExpired } from "./oauth";
import { logger } from "@/lib/logger";

const QB_BASE_URL = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

// ── API Client ──────────────────────────────────────────────

export class QuickBooksClient {
  private tokens: QBTokens;
  private baseUrl: string;
  private onTokenRefresh?: (tokens: QBTokens) => Promise<void>;

  constructor(
    tokens: QBTokens,
    options?: {
      onTokenRefresh?: (tokens: QBTokens) => Promise<void>;
    }
  ) {
    this.tokens = tokens;
    this.baseUrl =
      process.env.QB_ENVIRONMENT === "production"
        ? QB_BASE_URL.production
        : QB_BASE_URL.sandbox;
    this.onTokenRefresh = options?.onTokenRefresh;
  }

  // ── Core request method with auto-refresh ─────────────────

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    // Auto-refresh if expired
    if (isTokenExpired(this.tokens)) {
      logger.info("Access token expired, refreshing...");
      this.tokens = await refreshAccessToken(this.tokens.refresh_token);
      if (this.onTokenRefresh) {
        await this.onTokenRefresh(this.tokens);
      }
    }

    const url = `${this.baseUrl}/v3/company/${this.tokens.realm_id}/${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.tokens.access_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 401 — retry once with refreshed token
    if (response.status === 401 && retryCount < 1) {
      logger.warn("Got 401, attempting token refresh and retry...");
      this.tokens = await refreshAccessToken(this.tokens.refresh_token);
      if (this.onTokenRefresh) {
        await this.onTokenRefresh(this.tokens);
      }
      return this.request<T>(method, endpoint, body, retryCount + 1);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("QuickBooks API error", {
        status: response.status,
        endpoint,
        body: errorBody,
      });
      throw new QuickBooksApiError(
        `QB API ${response.status}: ${errorBody}`,
        response.status,
        errorBody
      );
    }

    return response.json() as Promise<T>;
  }

  // ── Payments ──────────────────────────────────────────────

  async createPayment(payment: QBPayment): Promise<{ Payment: QBPayment }> {
    return this.request<{ Payment: QBPayment }>(
      "POST",
      "payment",
      payment
    );
  }

  async getPayment(paymentId: string): Promise<{ Payment: QBPayment }> {
    return this.request<{ Payment: QBPayment }>(
      "GET",
      `payment/${paymentId}`
    );
  }

  async queryPayments(
    query: string
  ): Promise<{ QueryResponse: { Payment?: QBPayment[] } }> {
    const encoded = encodeURIComponent(query);
    return this.request("GET", `query?query=${encoded}`);
  }

  // ── Customers ─────────────────────────────────────────────

  async createCustomer(
    customer: QBCustomer
  ): Promise<{ Customer: QBCustomer }> {
    return this.request<{ Customer: QBCustomer }>(
      "POST",
      "customer",
      customer
    );
  }

  async findCustomerByEmail(
    email: string
  ): Promise<QBCustomer | null> {
    const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email}' MAXRESULTS 1`;
    const result = await this.queryPayments(query);
    const customers = (result.QueryResponse as any).Customer;
    return customers?.[0] || null;
  }

  async getCustomer(
    customerId: string
  ): Promise<{ Customer: QBCustomer }> {
    return this.request<{ Customer: QBCustomer }>(
      "GET",
      `customer/${customerId}`
    );
  }

  // ── Invoices ──────────────────────────────────────────────

  async getInvoice(
    invoiceId: string
  ): Promise<{ Invoice: QBInvoice }> {
    return this.request<{ Invoice: QBInvoice }>(
      "GET",
      `invoice/${invoiceId}`
    );
  }

  async queryInvoices(
    query: string
  ): Promise<{ QueryResponse: { Invoice?: QBInvoice[] } }> {
    const encoded = encodeURIComponent(query);
    return this.request("GET", `query?query=${encoded}`);
  }

  // ── Company Info (connection health check) ────────────────

  async getCompanyInfo(): Promise<{ CompanyInfo: Record<string, unknown> }> {
    return this.request<{ CompanyInfo: Record<string, unknown> }>(
      "GET",
      `companyinfo/${this.tokens.realm_id}`
    );
  }

  // ── Accounts (for deposit / income mapping) ───────────────

  async getAccounts(
    accountType?: string
  ): Promise<{ QueryResponse: { Account?: Array<Record<string, unknown>> } }> {
    let query = "SELECT * FROM Account";
    if (accountType) {
      query += ` WHERE AccountType = '${accountType}'`;
    }
    query += " MAXRESULTS 100";
    const encoded = encodeURIComponent(query);
    return this.request("GET", `query?query=${encoded}`);
  }
}

// ── Custom Error ────────────────────────────────────────────

export class QuickBooksApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "QuickBooksApiError";
    this.status = status;
    this.body = body;
  }
}
