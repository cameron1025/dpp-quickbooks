import { createClient } from "@supabase/supabase-js";
import { PaymentSyncService } from "./payment-sync";
import { sendSyncFailureEmail } from "../email-notifications";
import { DPPTransaction } from "@/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 120_000;
const JITTER_MAX_MS = 1000;

interface SyncLogEntry {
  id: string;
  merchant_id: string;
  entity_type: string;
  entity_id: string;
  qb_entity_id: string | null;
  status: string;
  retry_count: number;
  error_message: string | null;
  payload: DPPTransaction;
  created_at: string;
}

function getBackoffDelay(attempt: number): number {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * JITTER_MAX_MS;
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

export async function retrySyncEntry(entry: SyncLogEntry): Promise<boolean> {
  const newAttempt = entry.retry_count + 1;

  console.log(
    `[RetrySync] Retrying ${entry.entity_type} ${entry.entity_id} ` +
      `(attempt ${newAttempt}/${MAX_RETRIES}) for merchant ${entry.merchant_id}`
  );

  try {
    const syncService = new PaymentSyncService(entry.merchant_id);

    if (entry.entity_type === "Refund") {
      // Refunds need merchant settings (deposit account / refund item).
      const { data: merchant } = await supabase
        .from("merchants")
        .select("settings")
        .eq("id", entry.merchant_id)
        .single();
      await syncService.refundPayment(entry.payload, merchant?.settings ?? null);
    } else {
      await syncService.syncPayment(entry.payload);
    }

    await supabase
      .from("sync_log")
      .update({
        status: "synced",
        retry_count: newAttempt,
        error_message: null,
        last_retry_at: new Date().toISOString(),
      })
      .eq("id", entry.id);

    console.log(
      `[RetrySync] ${entry.entity_type} ${entry.entity_id} synced on attempt ${newAttempt}`
    );
    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (newAttempt >= MAX_RETRIES) {
      await supabase
        .from("sync_log")
        .update({
          status: "failed_permanent",
          retry_count: newAttempt,
          error_message: `Permanently failed after ${MAX_RETRIES} attempts: ${errorMessage}`,
          last_retry_at: new Date().toISOString(),
        })
        .eq("id", entry.id);

      console.error(
        `[RetrySync] ${entry.entity_type} ${entry.entity_id} permanently failed after ${MAX_RETRIES} attempts`
      );

      await sendSyncFailureEmail({
        merchantId: entry.merchant_id,
        transactionId: entry.entity_id,
        errorMessage,
        attempts: newAttempt,
      });

      return false;
    }

    await supabase
      .from("sync_log")
      .update({
        status: "failed_retrying",
        retry_count: newAttempt,
        error_message: `Attempt ${newAttempt} failed: ${errorMessage}`,
        last_retry_at: new Date().toISOString(),
      })
      .eq("id", entry.id);

    console.warn(
      `[RetrySync] ${entry.entity_type} ${entry.entity_id} failed attempt ${newAttempt}, ` +
        `will retry in ${getBackoffDelay(newAttempt)}ms`
    );

    return false;
  }
}

export async function processFailedSyncs(): Promise<{
  processed: number;
  succeeded: number;
  stillFailing: number;
  permanentlyFailed: number;
}> {
  const { data: failedEntries, error } = await supabase
    .from("sync_log")
    .select("*")
    .in("status", ["failed", "failed_retrying"])
    .lt("retry_count", MAX_RETRIES)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[RetrySync] Error fetching failed entries:", error);
    return { processed: 0, succeeded: 0, stillFailing: 0, permanentlyFailed: 0 };
  }

  if (!failedEntries || failedEntries.length === 0) {
    console.log("[RetrySync] No failed entries to retry");
    return { processed: 0, succeeded: 0, stillFailing: 0, permanentlyFailed: 0 };
  }

  console.log(`[RetrySync] Processing ${failedEntries.length} failed entries`);

  let succeeded = 0;
  let stillFailing = 0;
  let permanentlyFailed = 0;

  for (const entry of failedEntries) {
    if (entry.last_retry_at) {
      const timeSinceLastRetry =
        Date.now() - new Date(entry.last_retry_at).getTime();
      const requiredDelay = getBackoffDelay(entry.retry_count);

      if (timeSinceLastRetry < requiredDelay) {
        continue;
      }
    }

    const success = await retrySyncEntry(entry);
    if (success) {
      succeeded++;
    } else if (entry.retry_count + 1 >= MAX_RETRIES) {
      permanentlyFailed++;
    } else {
      stillFailing++;
    }
  }

  const result = {
    processed: failedEntries.length,
    succeeded,
    stillFailing,
    permanentlyFailed,
  };

  console.log("[RetrySync] Batch complete:", result);
  return result;
}

