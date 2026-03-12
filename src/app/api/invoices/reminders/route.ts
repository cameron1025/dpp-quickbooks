/**
 * POST /api/invoices/reminders
 * 
 * Cron endpoint for the reminder scheduler.
 * Protected by a shared secret to prevent unauthorized triggers.
 * 
 * Railway cron: set up a cron job to POST to this endpoint hourly.
 * Add CRON_SECRET to Railway env vars.
 * 
 * Example Railway cron config:
 *   Schedule: 0 * * * *  (every hour)
 *   Command: curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *            https://dpp-quickbooks-production.up.railway.app/api/invoices/reminders
 */

import { NextRequest, NextResponse } from 'next/server';
import { runReminderScheduler } from '@/lib/reminder-scheduler';

export async function POST(request: NextRequest) {
  // Validate cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Reminder Cron] Starting scheduled run');
    const result = await runReminderScheduler();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Reminder Cron] Failed:', err);
    return NextResponse.json(
      { error: 'Scheduler failed', message: err.message },
      { status: 500 }
    );
  }
}