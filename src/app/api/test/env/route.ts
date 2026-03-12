import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    has_client_id: !!process.env.QB_CLIENT_ID,
    client_id_length: process.env.QB_CLIENT_ID?.length || 0,
    has_secret: !!process.env.QB_CLIENT_SECRET,
    redirect_uri: process.env.QB_REDIRECT_URI,
    environment: process.env.QB_ENVIRONMENT,
  });
}