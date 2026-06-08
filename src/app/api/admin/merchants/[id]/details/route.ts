// GET /api/admin/merchants/[id]/details
// Full per-client view for the admin: connection status + health, settings,
// subscription status, recent sync history, and stats.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getValidTokens, PaymentSyncService } from "@/lib/quickbooks";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { getMerchantDppCredentialsOrNull } from "@/lib/dpp/credentials";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: merchant } = await supabase
    .from("merchants")
    .select("*")
    .eq("id", id)
    .single();

  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  // Live connection health (best-effort — one QB API call).
  // "disconnected" is reserved for merchants that are actually not connected.
  // A connected merchant whose live check momentarily fails (transient QB error
  // or a token refresh in flight) shows "degraded", not "disconnected" — this
  // avoids false "Disconnected" flapping on every transient hiccup.
  let connectionHealth: "healthy" | "degraded" | "disconnected" = "disconnected";
  let companyName = merchant.company_name;
  if (merchant.qb_connected) {
    connectionHealth = "degraded";
    try {
      const tokens = await getValidTokens(id);
      if (tokens) {
        const health = await new PaymentSyncService(id).checkConnectionHealth();
        connectionHealth = health.healthy ? "healthy" : "degraded";
        if (health.companyName) companyName = health.companyName;
      }
    } catch (err) {
      connectionHealth = "degraded";
      logger.warn("Admin details: health check failed", {
        merchantId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Recent sync history + stats.
  const { data: logs } = await supabase
    .from("sync_log")
    .select("*")
    .eq("merchant_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = logs || [];
  const today = new Date().toISOString().split("T")[0];
  const todayPayments = rows.filter(
    (l) =>
      typeof l.created_at === "string" &&
      l.created_at.startsWith(today) &&
      l.status === "success" &&
      l.entity_type === "Payment"
  );
  const revenueToday = todayPayments.reduce((sum, l) => {
    const amt = Number(l.payload?.amount);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const stats = {
    paymentsToday: todayPayments.length,
    revenueToday,
    syncedInvoices: rows.filter((l) => l.entity_type === "Invoice" && l.status === "success").length,
    pendingSync: rows.filter((l) => l.status === "pending").length,
  };

  // Reminder settings live as top-level merchant columns.
  const reminderSettings = {
    reminders_enabled: merchant.reminders_enabled ?? false,
    reminder_send_initial: merchant.reminder_send_initial ?? null,
    reminder_before_due_days: merchant.reminder_before_due_days ?? null,
    reminder_on_due_date: merchant.reminder_on_due_date ?? null,
    reminder_overdue_3: merchant.reminder_overdue_3 ?? null,
    reminder_overdue_7: merchant.reminder_overdue_7 ?? null,
    reminder_overdue_14: merchant.reminder_overdue_14 ?? null,
    reminder_from_name: merchant.reminder_from_name ?? null,
    reminder_reply_to: merchant.reminder_reply_to ?? null,
  };

  // Operator-only panel: return the stored credentials so the admin can view
  // (eye-toggle) and edit them. Admin-gated + HTTPS.
  const credentials = merchant.dpp_merchant_id
    ? await getMerchantDppCredentialsOrNull(merchant.dpp_merchant_id)
    : null;

  return NextResponse.json({
    merchant: {
      id: merchant.id,
      company_name: companyName,
      email: merchant.email,
      dpp_merchant_id: merchant.dpp_merchant_id,
      qb_realm_id: merchant.qb_realm_id,
      qb_connected: merchant.qb_connected,
      qb_connected_at: merchant.qb_connected_at,
      status: merchant.status,
      created_at: merchant.created_at,
      dpp_subscribed_at: merchant.dpp_subscribed_at,
      dpp_subscription_ids: merchant.dpp_subscription_ids,
      invoice_email_mode: merchant.invoice_email_mode || "paysync",
      logo_url: (merchant as any).logo_url ?? null,
    },
    subscribed: !!merchant.dpp_subscribed_at,
    hasCredentials: !!credentials,
    credentials,
    connectionHealth,
    settings: merchant.settings || {},
    reminderSettings,
    transactions: rows,
    stats,
  });
}
