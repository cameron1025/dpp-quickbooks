/**
 * /embed — Embeddable QuickBooks Integration Page
 * 
 * Server component that validates the signed URL, then renders
 * the client-side embed view with dashboard + settings combined.
 * 
 * URL: /embed?merchant=MERCHANT_ID&ts=TIMESTAMP&sig=SIGNATURE
 */

import { validateEmbedAuth } from '@/lib/embed-auth';
import EmbedView from '@/components/quickbooks/EmbedView';

interface EmbedPageProps {
  searchParams: Promise<{
    merchant?: string;
    ts?: string;
    sig?: string;
  }>;
}

export default async function EmbedPage({ searchParams }: EmbedPageProps) {
  const params = await searchParams;
  const { merchant, ts, sig } = params;

  // Validate embed authentication
  const auth = validateEmbedAuth({
    merchant: merchant || '',
    ts: ts || '',
    sig: sig || '',
  });

  if (!auth.valid) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#666',
        padding: '20px',
        textAlign: 'center' as const,
      }}>
        <div>
          <h2 style={{ color: '#333', marginBottom: '8px', fontSize: '18px' }}>
            Unable to Load Integration
          </h2>
          <p style={{ fontSize: '14px' }}>
            {auth.error === 'Link expired'
              ? 'This link has expired. Please refresh the page to get a new link.'
              : 'Authentication failed. Please contact support if this continues.'}
          </p>
        </div>
      </div>
    );
  }

  return <EmbedView merchantId={auth.merchantId!} />;
}