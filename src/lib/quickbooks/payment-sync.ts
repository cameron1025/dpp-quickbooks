// ============================================================
// Payment Sync Service
// ============================================================
// Bridges DPP gateway transactions → QuickBooks Online payments.
// Matches payments against open invoices when possible.

import { QuickBooksClient } from "./client";
import { getValidTokens, forceRefreshTokens } from "./token-manager";
import {
  DPPTransaction,
  MerchantSettings,
  QBCustomer,
  QBInvoice,
  QBPayment,
  QBPaymentLine,
  QBRefundReceipt,
  QBSalesReceipt,
} from "@/types";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";

/**
 * Result of syncing a DPP transaction to QuickBooks:
 * - `payment`: applied to one or more open invoices (matchedCount > 0)
 * - `sales_receipt`: no invoice matched, recorded as a sale (e.g. terminal swipe)
 */
export type SyncPaymentResult =
  | { kind: "payment"; id: string; matchedCount: number; surcharge?: number; surchargeId?: string }
  | { kind: "sales_receipt"; id: string };

export class PaymentSyncService {
  private merchantId: string;

  constructor(merchantId: string) {
    this.merchantId = merchantId;
  }

  /**
   * Get an authenticated QB client for this merchant.
   */
  private async getClient(): Promise<QuickBooksClient> {
    const tokens = await getValidTokens(this.merchantId);
    if (!tokens) {
      throw new Error(`No valid QuickBooks tokens for merchant ${this.merchantId}`);
    }
    return new QuickBooksClient(tokens, {
      refreshTokens: () => forceRefreshTokens(this.merchantId),
    });
  }

  /**
   * Sync a DPP transaction to QuickBooks.
   *
   * - If it matches an open invoice → records a Payment applied to that invoice.
   * - If it doesn't (in-person terminal swipe, walk-in sale, or any unmatched
   *   payment) → records a Sales Receipt so the sale posts to income instead of
   *   sitting as an unapplied credit.
   */
  async syncPayment(
    transaction: DPPTransaction,
    settings?: MerchantSettings | null
  ): Promise<SyncPaymentResult> {
    const client = await this.getClient();

    // Resolve the customer: use the transaction's customer when present,
    // otherwise the shared "Walk-in Customer" (anonymous in-person swipes).
    const hasCustomerInfo = !!(transaction.customer_email || transaction.customer_name);
    const customer = hasCustomerInfo
      ? await this.findOrCreateCustomer(client, transaction)
      : await this.findOrCreateWalkInCustomer(client);

    // A terminal swipe with no invoice number is a point-of-sale sale — record
    // it as a sale rather than risk a false amount-match to an unrelated invoice.
    const terminalWalkIn =
      !!transaction.metadata?.terminal_id && !transaction.metadata?.invoice_number;

    // Card surcharge: when surcharging is enabled on the Deluxe account, Deluxe
    // adds a fee on top, so the CHARGED total exceeds the invoice balance. Match
    // and apply on the BASE amount (charged − surcharge) so the invoice is paid in
    // full; the surcharge is recorded separately below so the full deposit
    // reconciles. (ACH/debit/wallets are never surcharged → surcharge = 0.)
    const surcharge = this.surchargeAmount(transaction);
    const baseAmount = Math.round((transaction.amount - surcharge) * 100) / 100;

    const lines = terminalWalkIn
      ? []
      : await this.matchInvoices(client, customer, transaction, baseAmount);

    // Matched an invoice → Payment (base amount) applied to it.
    if (lines.length > 0) {
      const appliedTotal =
        Math.round(lines.reduce((sum, l) => sum + (l.Amount || 0), 0) * 100) / 100;
      const payment: QBPayment = {
        TotalAmt: appliedTotal,
        CustomerRef: { value: customer.Id!, name: customer.DisplayName },
        PaymentRefNum: transaction.id.substring(0, 21),
        TxnDate: new Date(transaction.created_at).toISOString().split("T")[0],
        PrivateNote: `DPP Gateway payment — ${transaction.payment_method} — ID: ${transaction.id}`,
        Line: lines,
      };
      const result = await client.createPayment(payment);
      logger.info("Payment synced to QuickBooks", {
        merchantId: this.merchantId,
        transactionId: transaction.id,
        qbPaymentId: result.Payment.Id,
        amount: appliedTotal,
        invoicesMatched: lines.length,
      });

      // Record the surcharge as its own sales receipt so the FULL charged amount
      // lands in QB and the bank deposit reconciles (invoice payment + surcharge).
      let surchargeId: string | undefined;
      if (surcharge > 0) {
        const sr = await this.recordSurcharge(client, transaction, customer, settings, surcharge);
        surchargeId = sr.Id || undefined;
        logger.info("Recorded card surcharge as a sales receipt", {
          merchantId: this.merchantId,
          transactionId: transaction.id,
          surcharge,
          qbSalesReceiptId: surchargeId,
        });
      }

      return {
        kind: "payment",
        id: result.Payment.Id!,
        matchedCount: lines.length,
        ...(surcharge > 0 && { surcharge, surchargeId }),
      };
    }

    // No invoice matched → record a Sales Receipt for the FULL charged amount
    // (surcharge included — it's all income, with no invoice to apply against).
    const receipt = await this.recordSale(client, transaction, customer, settings);
    return { kind: "sales_receipt", id: receipt.Id! };
  }

  /**
   * Record an invoice-less payment as a QuickBooks Sales Receipt — a sale +
   * payment in one entry, posting to income + the deposit account. Used for
   * in-person terminal swipes and any payment with no matching invoice.
   */
  private async recordSale(
    client: QuickBooksClient,
    transaction: DPPTransaction,
    customer: QBCustomer,
    settings?: MerchantSettings | null
  ): Promise<QBSalesReceipt> {
    const itemRef = await this.resolveSalesItem(client, settings);
    const isTerminal = !!transaction.metadata?.terminal_id;

    const receipt: QBSalesReceipt = {
      CustomerRef: { value: customer.Id!, name: customer.DisplayName },
      TxnDate: new Date(transaction.created_at).toISOString().split("T")[0],
      PaymentRefNum: transaction.id.substring(0, 21),
      PrivateNote: `DPP ${isTerminal ? "terminal " : ""}sale — ${transaction.payment_method} — ID: ${transaction.id}`,
      ...(settings?.default_deposit_account && {
        DepositToAccountRef: { value: settings.default_deposit_account },
      }),
      Line: [
        {
          Amount: transaction.amount,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: { ItemRef: itemRef },
          Description: `Payment received via DPP${isTerminal ? " terminal" : ""} — ${transaction.payment_method}`,
        },
      ],
    };

    const result = await client.createSalesReceipt(receipt);
    logger.info("Sale recorded in QuickBooks (no invoice matched)", {
      merchantId: this.merchantId,
      transactionId: transaction.id,
      qbSalesReceiptId: result.SalesReceipt.Id,
      amount: transaction.amount,
      terminal: isTerminal,
    });
    return result.SalesReceipt;
  }

  /**
   * Parse the card surcharge amount (added by Deluxe when surcharging is enabled
   * on the account) from the transaction metadata. Returns 0 when absent or
   * non-positive — i.e. ACH/debit/wallets and surcharge-disabled accounts.
   */
  private surchargeAmount(transaction: DPPTransaction): number {
    const raw = transaction.metadata?.surcharge;
    const n = raw ? parseFloat(String(raw)) : 0;
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }

  /**
   * Record a card surcharge as its own QuickBooks Sales Receipt so the FULL
   * charged amount (invoice payment + surcharge) reconciles against the bank
   * deposit. Posts to the configured sales item / income account.
   */
  private async recordSurcharge(
    client: QuickBooksClient,
    transaction: DPPTransaction,
    customer: QBCustomer,
    settings: MerchantSettings | null | undefined,
    surcharge: number
  ): Promise<QBSalesReceipt> {
    const itemRef = await this.resolveSalesItem(client, settings);
    const receipt: QBSalesReceipt = {
      CustomerRef: { value: customer.Id!, name: customer.DisplayName },
      TxnDate: new Date(transaction.created_at).toISOString().split("T")[0],
      PaymentRefNum: `${transaction.id.substring(0, 18)}-sc`,
      PrivateNote: `DPP card surcharge — ${transaction.payment_method} — ID: ${transaction.id}`,
      ...(settings?.default_deposit_account && {
        DepositToAccountRef: { value: settings.default_deposit_account },
      }),
      Line: [
        {
          Amount: surcharge,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: { ItemRef: itemRef },
          Description: "Card processing surcharge",
        },
      ],
    };
    const result = await client.createSalesReceipt(receipt);
    return result.SalesReceipt;
  }

  /**
   * Refund a DPP transaction in QuickBooks as a RefundReceipt.
   * Supports partial refunds (uses the transaction amount as-is).
   */
  async refundPayment(
    transaction: DPPTransaction,
    settings?: MerchantSettings | null
  ): Promise<QBRefundReceipt> {
    const client = await this.getClient();

    // 1. Resolve the customer — prefer the one on the originally synced
    //    payment so the refund lands on the right account; fall back to
    //    email lookup / create.
    const customer = await this.resolveRefundCustomer(client, transaction);

    // 2. Resolve the line item (a Service item is required on a RefundReceipt).
    const itemRef = await this.resolveRefundItem(client, settings);

    // 3. Build the RefundReceipt.
    const refund: QBRefundReceipt = {
      CustomerRef: {
        value: customer.Id!,
        name: customer.DisplayName,
      },
      TxnDate: new Date(transaction.created_at).toISOString().split("T")[0],
      PaymentRefNum: transaction.id.substring(0, 21),
      PrivateNote: `DPP Gateway refund — ${transaction.payment_method} — ID: ${transaction.id}`,
      ...(settings?.default_deposit_account && {
        DepositToAccountRef: { value: settings.default_deposit_account },
      }),
      Line: [
        {
          Amount: transaction.amount,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: { ItemRef: itemRef },
          Description: `Refund for transaction ${transaction.id}`,
        },
      ],
    };

    const result = await client.createRefundReceipt(refund);

    logger.info("Refund synced to QuickBooks", {
      merchantId: this.merchantId,
      transactionId: transaction.id,
      qbRefundReceiptId: result.RefundReceipt.Id,
      amount: transaction.amount,
    });

    return result.RefundReceipt;
  }

  /**
   * Resolve the customer for a refund. Looks up the original synced payment
   * in sync_log → fetches its CustomerRef from QB. Falls back to email
   * lookup / create when the original cannot be found.
   */
  private async resolveRefundCustomer(
    client: QuickBooksClient,
    transaction: DPPTransaction
  ): Promise<QBCustomer> {
    try {
      const supabase = getSupabaseAdmin();
      const { data: original } = await supabase
        .from("sync_log")
        .select("qb_entity_id")
        .eq("merchant_id", this.merchantId)
        .eq("entity_type", "Payment")
        .eq("entity_id", transaction.id)
        .eq("status", "success")
        .not("qb_entity_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (original?.qb_entity_id) {
        const { Payment } = await client.getPayment(original.qb_entity_id);
        if (Payment?.CustomerRef?.value) {
          const { Customer } = await client.getCustomer(Payment.CustomerRef.value);
          if (Customer) return Customer;
        }
      }
    } catch (error) {
      logger.warn("Could not resolve original payment customer for refund, falling back", {
        transactionId: transaction.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return this.findOrCreateCustomer(client, transaction);
  }

  /**
   * Resolve the QB Item used for the refund line. Uses the merchant's
   * configured default_refund_item when set, otherwise auto-picks the first
   * Service item in the company.
   */
  private async resolveRefundItem(
    client: QuickBooksClient,
    settings?: MerchantSettings | null
  ): Promise<{ value: string }> {
    if (settings?.default_refund_item) {
      return { value: settings.default_refund_item };
    }

    const result = await client.queryItems(
      "SELECT * FROM Item WHERE Type = 'Service' MAXRESULTS 1"
    );
    const item = result.QueryResponse.Item?.[0];

    if (!item?.Id) {
      throw new Error(
        "No Service item found in QuickBooks to use on the refund receipt. " +
          "Configure a default_refund_item in merchant settings."
      );
    }

    return { value: item.Id };
  }

  /**
   * Resolve the QB Item used on a sales-receipt line. Prefers the merchant's
   * default_sales_item, then default_refund_item, else the first Service item.
   */
  private async resolveSalesItem(
    client: QuickBooksClient,
    settings?: MerchantSettings | null
  ): Promise<{ value: string }> {
    if (settings?.default_sales_item) return { value: settings.default_sales_item };
    if (settings?.default_refund_item) return { value: settings.default_refund_item };

    const result = await client.queryItems(
      "SELECT * FROM Item WHERE Type = 'Service' MAXRESULTS 1"
    );
    const item = result.QueryResponse.Item?.[0];
    if (!item?.Id) {
      throw new Error(
        "No Service item found in QuickBooks to use on the sales receipt. " +
          "Configure a default_sales_item in merchant settings."
      );
    }
    return { value: item.Id };
  }

  /**
   * Find or create the shared "Walk-in Customer" used for anonymous in-person
   * swipes that carry no customer details.
   */
  private async findOrCreateWalkInCustomer(
    client: QuickBooksClient
  ): Promise<QBCustomer> {
    const name = "Walk-in Customer";
    try {
      const existing = await client.findCustomerByName(name);
      if (existing) return existing;
    } catch (error) {
      logger.warn("Walk-in customer lookup failed, creating a new one", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const result = await client.createCustomer({ DisplayName: name });
    return result.Customer;
  }

  /**
   * Reverse a previously-synced QB Payment (used when an ACH transaction is
   * later rejected). Deleting the payment restores any linked invoice
   * balances. Returns the deleted QB Payment id.
   */
  async reversePayment(qbPaymentId: string): Promise<string> {
    const client = await this.getClient();
    const { Payment } = await client.getPayment(qbPaymentId);

    if (!Payment?.Id || !Payment?.SyncToken) {
      throw new Error(
        `Cannot reverse QB payment ${qbPaymentId}: not found or missing SyncToken`
      );
    }

    await client.deletePayment(Payment.Id, Payment.SyncToken);

    logger.info("Reversed QB payment after ACH reject", {
      merchantId: this.merchantId,
      qbPaymentId: Payment.Id,
    });

    return Payment.Id;
  }

  /**
   * Find open invoices for the customer and match them against the payment amount.
   *
   * Matching strategy:
   * 1. Exact match — one invoice with balance equal to payment amount
   * 2. Invoice number match — DPP invoice number matches QB DocNumber
   * 3. Multi-invoice match — apply payment across oldest invoices first
   * 4. No match — return empty lines (standalone payment)
   */
  private async matchInvoices(
    client: QuickBooksClient,
    customer: QBCustomer,
    transaction: DPPTransaction,
    // Amount to match/apply to invoices = the charged total minus any card
    // surcharge, so it equals the invoice balance.
    matchAmount: number
  ): Promise<QBPaymentLine[]> {
    if (!customer.Id) return [];

    try {
      // Query open invoices for this customer (Balance > 0)
      const query = `SELECT * FROM Invoice WHERE CustomerRef = '${customer.Id}' AND Balance > '0' ORDERBY DueDate ASC MAXRESULTS 50`;
      const result = await client.queryInvoices(query);
      const openInvoices = result.QueryResponse.Invoice || [];

      if (openInvoices.length === 0) {
        logger.info("No open invoices found for customer, creating standalone payment", {
          customerId: customer.Id,
          amount: transaction.amount,
        });
        return [];
      }

      logger.info("Found open invoices for customer", {
        customerId: customer.Id,
        invoiceCount: openInvoices.length,
        totalOutstanding: openInvoices.reduce((sum, inv) => sum + inv.Balance, 0),
        paymentAmount: transaction.amount,
      });

      // Strategy 1: Check for invoice number match via DPP metadata
      const dppInvoiceNumber = transaction.metadata?.invoice_number;
      if (dppInvoiceNumber) {
        const invoiceByNumber = openInvoices.find(
          (inv) => inv.DocNumber === dppInvoiceNumber ||
                   inv.DocNumber === dppInvoiceNumber.replace(/^0+/, "")
        );

        if (invoiceByNumber && invoiceByNumber.Id) {
          const applyAmount = Math.min(matchAmount, invoiceByNumber.Balance);
          logger.info("Matched payment to invoice by number", {
            invoiceId: invoiceByNumber.Id,
            docNumber: invoiceByNumber.DocNumber,
            invoiceBalance: invoiceByNumber.Balance,
            applyAmount,
          });
          return [{
            Amount: applyAmount,
            LinkedTxn: [{ TxnId: invoiceByNumber.Id, TxnType: "Invoice" }],
          }];
        }

        // Invoice number was provided but didn't match any open invoice —
        // surface it so the round-trip can be debugged, then fall through.
        logger.warn("DPP invoice_number did not match any open QB invoice", {
          customerId: customer.Id,
          dppInvoiceNumber,
          openDocNumbers: openInvoices.map((inv) => inv.DocNumber),
        });
      } else {
        logger.warn("DPP payment has no invoice_number; falling back to amount/oldest matching", {
          customerId: customer.Id,
          transactionId: transaction.id,
          amount: transaction.amount,
        });
      }

      // Strategy 2: Exact amount match on a single invoice (base amount)
      const exactMatch = openInvoices.find(
        (inv) => Math.abs(inv.Balance - matchAmount) < 0.01
      );

      if (exactMatch && exactMatch.Id) {
        logger.info("Matched payment to invoice by exact amount", {
          invoiceId: exactMatch.Id,
          docNumber: exactMatch.DocNumber,
          amount: matchAmount,
        });
        return [{
          Amount: matchAmount,
          LinkedTxn: [{ TxnId: exactMatch.Id, TxnType: "Invoice" }],
        }];
      }

      // Strategy 3: Apply payment across multiple invoices (oldest first)
      const lines: QBPaymentLine[] = [];
      let remaining = matchAmount;

      for (const invoice of openInvoices) {
        if (remaining <= 0) break;
        if (!invoice.Id) continue;

        const applyAmount = Math.min(remaining, invoice.Balance);
        // Round to 2 decimal places to avoid floating point issues
        const roundedAmount = Math.round(applyAmount * 100) / 100;

        lines.push({
          Amount: roundedAmount,
          LinkedTxn: [{ TxnId: invoice.Id, TxnType: "Invoice" }],
        });

        remaining = Math.round((remaining - roundedAmount) * 100) / 100;

        logger.info("Applied payment to invoice", {
          invoiceId: invoice.Id,
          docNumber: invoice.DocNumber,
          invoiceBalance: invoice.Balance,
          applied: roundedAmount,
          remaining,
        });
      }

      if (lines.length > 0) {
        logger.info("Payment matched across invoices", {
          invoicesMatched: lines.length,
          totalApplied: transaction.amount - remaining,
          unappliedAmount: remaining,
        });
      }

      return lines;
    } catch (error) {
      // If invoice matching fails, fall back to standalone payment
      logger.warn("Invoice matching failed, creating standalone payment", {
        customerId: customer.Id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Find an existing customer by email or create a new one.
   */
  private async findOrCreateCustomer(
    client: QuickBooksClient,
    transaction: DPPTransaction
  ): Promise<QBCustomer> {
    // Placeholder emails (synthesised when the gateway sends no email) never
    // match a real QB customer and must not be written onto one.
    const email = transaction.customer_email;
    const realEmail =
      email && !email.endsWith("@dpp-placeholder.com") ? email : undefined;

    // 1. Find by email.
    if (realEmail) {
      const byEmail = await client.findCustomerByEmail(realEmail);
      if (byEmail) return byEmail;
    }

    // 2. Find by display name. The invoice's customer almost always already
    //    exists in QB, so match them instead of creating a duplicate — creating
    //    one fails with QB's "Duplicate Name Exists" error AND would leave the
    //    payment unmatched (a new customer has no invoices).
    const displayName =
      transaction.customer_name ||
      realEmail ||
      `DPP Customer ${transaction.id.substring(0, 8)}`;

    const byName = await client.findCustomerByName(displayName);
    if (byName) return byName;

    // 3. Create — and if QB says the name already exists (e.g. an email mismatch
    //    hid an existing customer), fetch that customer rather than failing.
    const newCustomer: QBCustomer = {
      DisplayName: displayName,
      ...(realEmail && { PrimaryEmailAddr: { Address: realEmail } }),
    };

    try {
      const result = await client.createCustomer(newCustomer);
      return result.Customer;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate name/i.test(msg) || /\b6240\b/.test(msg)) {
        const existing = await client.findCustomerByName(displayName);
        if (existing) return existing;
      }
      throw err;
    }
  }

  /**
   * Check the health of the QuickBooks connection.
   */
  async checkConnectionHealth(): Promise<{
    healthy: boolean;
    companyName?: string;
    error?: string;
  }> {
    try {
      const client = await this.getClient();
      const info = await client.getCompanyInfo();
      return {
        healthy: true,
        companyName: (info.CompanyInfo as any).CompanyName,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get available accounts for deposit/income mapping.
   */
  async getAccounts(type?: string) {
    const client = await this.getClient();
    const result = await client.getAccounts(type);
    return result.QueryResponse.Account || [];
  }
}
