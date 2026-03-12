// ============================================================
// Payment Sync Service
// ============================================================
// Bridges DPP gateway transactions → QuickBooks Online payments.
// Matches payments against open invoices when possible.

import { QuickBooksClient } from "./client";
import { getValidTokens, storeTokens } from "./token-manager";
import { DPPTransaction, QBPayment, QBPaymentLine, QBCustomer, QBInvoice } from "@/types";
import { logger } from "@/lib/logger";

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
      onTokenRefresh: async (newTokens) => {
        await storeTokens(this.merchantId, newTokens);
      },
    });
  }

  /**
   * Sync a DPP transaction to QuickBooks as a Payment.
   * Attempts to match against open invoices for the customer.
   */
  async syncPayment(transaction: DPPTransaction): Promise<QBPayment> {
    const client = await this.getClient();

    // 1. Find or create the customer in QuickBooks
    const customer = await this.findOrCreateCustomer(client, transaction);

    // 2. Try to match open invoices for this customer
    const lines = await this.matchInvoices(client, customer, transaction);

    // 3. Build the QB Payment object
    const payment: QBPayment = {
      TotalAmt: transaction.amount,
      CustomerRef: {
        value: customer.Id!,
        name: customer.DisplayName,
      },
      PaymentRefNum: transaction.id.substring(0, 21),
      TxnDate: new Date(transaction.created_at).toISOString().split("T")[0],
      PrivateNote: `DPP Gateway payment — ${transaction.payment_method} — ID: ${transaction.id}`,
      Line: lines,
    };

    // 4. Create the payment in QuickBooks
    const result = await client.createPayment(payment);

    logger.info("Payment synced to QuickBooks", {
      merchantId: this.merchantId,
      transactionId: transaction.id,
      qbPaymentId: result.Payment.Id,
      amount: transaction.amount,
      invoicesMatched: lines.length,
    });

    return result.Payment;
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
    transaction: DPPTransaction
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
          const applyAmount = Math.min(transaction.amount, invoiceByNumber.Balance);
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
      }

      // Strategy 2: Exact amount match on a single invoice
      const exactMatch = openInvoices.find(
        (inv) => Math.abs(inv.Balance - transaction.amount) < 0.01
      );

      if (exactMatch && exactMatch.Id) {
        logger.info("Matched payment to invoice by exact amount", {
          invoiceId: exactMatch.Id,
          docNumber: exactMatch.DocNumber,
          amount: transaction.amount,
        });
        return [{
          Amount: transaction.amount,
          LinkedTxn: [{ TxnId: exactMatch.Id, TxnType: "Invoice" }],
        }];
      }

      // Strategy 3: Apply payment across multiple invoices (oldest first)
      const lines: QBPaymentLine[] = [];
      let remaining = transaction.amount;

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
    // Try to find by email first
    if (transaction.customer_email) {
      const existing = await client.findCustomerByEmail(
        transaction.customer_email
      );
      if (existing) return existing;
    }

    // Create a new customer
    const displayName =
      transaction.customer_name ||
      transaction.customer_email ||
      `DPP Customer ${transaction.id.substring(0, 8)}`;

    const newCustomer: QBCustomer = {
      DisplayName: displayName,
      ...(transaction.customer_email && {
        PrimaryEmailAddr: { Address: transaction.customer_email },
      }),
    };

    const result = await client.createCustomer(newCustomer);
    return result.Customer;
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
