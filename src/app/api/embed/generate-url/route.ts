/**
 * GET /api/embed/generate-url
 * 
 * Generates a signed embed URL for testing.
 * Only works when EMBED_SECRET is configured.
 * 
 * Query params:
 *   merchant — DPP merchant ID
 * 
 * In production, DPP generates these URLs server-side.
 * This endpoint is for your own testing/demo purposes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedUrl } from '@/lib/embed-auth';

export async function GET(request: NextRequest) {
  const merchantId = request.nextUrl.searchParams.get('merchant');

  if (!merchantId) {
    return NextResponse.json(
      { error: 'Missing merchant parameter' },
      { status: 400 }
    );
  }

  if (!process.env.EMBED_SECRET) {
    return NextResponse.json(
      { error: 'EMBED_SECRET not configured' },
      { status: 500 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || 'https://dpp-quickbooks-production.up.railway.app';

  try {
    const url = generateEmbedUrl(merchantId, baseUrl);
    return NextResponse.json({ url });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}