// ============================================================
// Payment Sync Service
// ============================================================
// Bridges DPP gateway transactions â†’ QuickBooks Online payments.
// DPP gateway integration is a placeholder â€” you wire that up.

import { QuickBooksClient } from "./client";
import { getValidTokens, storeTokens } from "./token-manager";
import { DPPTransaction, QBPayment, QBCustomer } from "@/types";
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
   */
  async syncPayment(transaction: DPPTransaction): Promise<QBPayment> {
    const client = await this.getClient();

    // 1. Find or create the customer in QuickBooks
    const customer = await this.findOrCreateCustomer(client, transaction);

    // 2. Build the QB Payment object
    const payment: QBPayment = {
      TotalAmt: transaction.amount,
      CustomerRef: {
        value: customer.Id!,
        name: customer.DisplayName,
      },
      PaymentRefNum: transaction.id.substring(0, 21),
      TxnDate: new Date(transaction.created_at).toISOString().split("T")[0],
      PrivateNote: `DPP Gateway payment â€” ${transaction.payment_method} â€” ID: ${transaction.id}`,
      Line: [],
      // CurrencyRef will use the company default if not specified
    };

    // 3. Create the payment in QuickBooks
    const result = await client.createPayment(payment);

    logger.info("Payment synced to QuickBooks", {
      merchantId: this.merchantId,
      transactionId: transaction.id,
      qbPaymentId: result.Payment.Id,
      amount: transaction.amount,
    });

    return result.Payment;
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

