import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedUrl } from '@/lib/embed-auth';

const ALLOWED_ORIGINS = [
  'https://demo.perspectiveproductions.net',
  'https://payments.deluxe.com',
];

function getCorsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (origin && ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const cors = getCorsHeaders(origin);
  const merchantId = request.nextUrl.searchParams.get('merchant');

  if (!merchantId) {
    return NextResponse.json(
      { error: 'Missing merchant parameter' },
      { status: 400, headers: cors }
    );
  }

  if (!process.env.EMBED_SECRET) {
    return NextResponse.json(
      { error: 'EMBED_SECRET not configured' },
      { status: 500, headers: cors }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || 'https://dpp-quickbooks-production.up.railway.app';

  try {
    const url = generateEmbedUrl(merchantId, baseUrl);
    return NextResponse.json({ url }, { headers: cors });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: cors }
    );
  }
}