'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface EmbedViewProps {
  merchantId: string;
}

interface ConnectionStatus {
  connected: boolean;
  company_name?: string;
  last_sync?: string;
}

interface DashboardStats {
  total_payments_today: number;
  total_revenue_today: number;
  synced_invoices: number;
  pending_sync: number;
  connection_health: 'healthy' | 'degraded' | 'disconnected';
  last_sync_at: string | null;
}

interface SyncEntry {
  id: string;
  type: string;
  amount: number;
  status: 'synced' | 'failed' | 'pending';
  customer_name?: string;
  created_at: string;
}

export default function EmbedView({ merchantId }: EmbedViewProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [connection, setConnection] = useState<ConnectionStatus>({ connected: false });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSyncs, setRecentSyncs] = useState<SyncEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, transRes] = await Promise.all([
        fetch('/api/merchant/status', {
          headers: { 'x-merchant-id': merchantId },
        }),
        fetch('/api/merchant/transactions', {
          headers: { 'x-merchant-id': merchantId },
        }),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setConnection({
          connected: data.connected || data.qb_connected || false,
          company_name: data.company_name,
          last_sync: data.last_sync_at,
        });
        setStats(data.stats || null);
      }

      if (transRes.ok) {
        const data = await transRes.json();
        setRecentSyncs(data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to fetch embed data:', err);
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Notify parent window of connection state changes
  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'dpp-qb-status',
          connected: connection.connected,
          merchantId,
        },
        '*'
      );
    }
  }, [connection.connected, merchantId]);

  const handleConnect = () => {
    const popup = window.open(
      `/api/quickbooks/connect?merchant_id=${merchantId}&popup=true`,
      'qb-connect',
      'width=600,height=700'
    );

    // Poll for popup close, then refresh data
    const checkClosed = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(checkClosed);
        fetchData();
      }
    }, 500);
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect QuickBooks? Payment syncing will stop.')) return;
    try {
      await fetch('/api/quickbooks/disconnect', {
        method: 'POST',
        headers: { 'x-merchant-id': merchantId },
      });
      setConnection({ connected: false });
      fetchData();
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  const h = React.createElement;

  // ─── Styles ───

  const containerStyle: React.CSSProperties = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#f8f9fa',
    minHeight: '100vh',
    padding: '0',
  };

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    backgroundColor: '#fff',
    borderBottom: '1px solid #e2e8f0',
    padding: '0 16px',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: active ? '600' : '400',
    color: active ? '#2E75B6' : '#666',
    borderBottom: active ? '2px solid #2E75B6' : '2px solid transparent',
    background: 'none',
    border: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: active ? '#2E75B6' : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  const contentStyle: React.CSSProperties = {
    padding: '20px 16px',
    maxWidth: '800px',
    margin: '0 auto',
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  };

  const statCardStyle: React.CSSProperties = {
    ...cardStyle,
    textAlign: 'center' as const,
    flex: 1,
    minWidth: '140px',
  };

  const btnPrimary: React.CSSProperties = {
    padding: '10px 24px',
    backgroundColor: '#2E75B6',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  };

  const btnDanger: React.CSSProperties = {
    ...btnPrimary,
    backgroundColor: '#dc3545',
    fontSize: '13px',
    padding: '8px 16px',
  };

  const statusDot = (color: string): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    marginRight: '6px',
  });

  // ─── Loading State ───

  if (loading) {
    return h('div', {
      style: {
        ...containerStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }
    }, h('p', { style: { color: '#888' } }, 'Loading...'));
  }

  // ─── Not Connected State ───

  if (!connection.connected) {
    return h('div', { style: containerStyle },
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '40px 20px',
          textAlign: 'center' as const,
        }
      },
        h('div', {
          style: {
            width: '64px',
            height: '64px',
            backgroundColor: '#e8f4f8',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            fontSize: '28px',
          }
        }, 'QB'),
        h('h2', { style: { margin: '0 0 8px', fontSize: '20px', color: '#333' } },
          'Connect to QuickBooks'
        ),
        h('p', { style: { margin: '0 0 24px', fontSize: '14px', color: '#666', maxWidth: '400px' } },
          'Link your QuickBooks account to automatically sync payments, match invoices, and send branded payment reminders.'
        ),
        h('button', { onClick: handleConnect, style: btnPrimary },
          'Connect QuickBooks'
        ),
      )
    );
  }

  // ─── Connected State — Tabs ───

  const renderDashboard = () =>
    h('div', { style: contentStyle },
      // Connection status bar
      h('div', {
        style: {
          ...cardStyle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }
      },
        h('div', null,
          h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } },
            h('span', { style: statusDot('#2CA01C') }),
            h('span', { style: { fontWeight: '600', fontSize: '14px', color: '#333' } }, 'Connected'),
          ),
          connection.company_name && h('p', {
            style: { margin: 0, fontSize: '13px', color: '#666' }
          }, connection.company_name),
        ),
        h('button', { onClick: handleDisconnect, style: btnDanger }, 'Disconnect'),
      ),

      // Stats row
      stats && h('div', {
        style: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' as const }
      },
        h('div', { style: statCardStyle },
          h('p', { style: { margin: 0, fontSize: '24px', fontWeight: '700', color: '#333' } },
            `$${(stats.total_revenue_today || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
          ),
          h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: '#888' } }, 'Revenue Today'),
        ),
        h('div', { style: statCardStyle },
          h('p', { style: { margin: 0, fontSize: '24px', fontWeight: '700', color: '#333' } },
            stats.total_payments_today || 0
          ),
          h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: '#888' } }, 'Payments Today'),
        ),
        h('div', { style: statCardStyle },
          h('p', { style: { margin: 0, fontSize: '24px', fontWeight: '700', color: '#333' } },
            stats.synced_invoices || 0
          ),
          h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: '#888' } }, 'Synced Invoices'),
        ),
        h('div', { style: statCardStyle },
          h('p', { style: { margin: 0, fontSize: '24px', fontWeight: '700', color: stats.pending_sync > 0 ? '#e67700' : '#333' } },
            stats.pending_sync || 0
          ),
          h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: '#888' } }, 'Pending'),
        ),
      ),

      // Recent syncs
      h('div', { style: cardStyle },
        h('h3', { style: { margin: '0 0 12px', fontSize: '15px', fontWeight: '600', color: '#333' } },
          'Recent Activity'
        ),
        recentSyncs.length === 0
          ? h('p', { style: { color: '#888', fontSize: '13px' } }, 'No recent activity')
          : h('div', null,
              recentSyncs.slice(0, 10).map((sync) =>
                h('div', {
                  key: sync.id,
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid #f0f0f0',
                    fontSize: '13px',
                  }
                },
                  h('div', null,
                    h('span', { style: { fontWeight: '500', color: '#333' } },
                      sync.customer_name || 'Payment'
                    ),
                    h('span', { style: { color: '#888', marginLeft: '8px' } },
                      `$${sync.amount.toFixed(2)}`
                    ),
                  ),
                  h('span', {
                    style: {
                      fontSize: '12px',
                      fontWeight: '500',
                      color: sync.status === 'synced' ? '#2CA01C'
                        : sync.status === 'failed' ? '#dc3545'
                        : '#e67700',
                    }
                  }, sync.status),
                )
              )
            ),
      ),
    );

  const renderSettings = () => {
    // Import and render ReminderSettings inline
    const ReminderSettings = require('@/components/quickbooks/ReminderSettings').default;
    return h('div', { style: contentStyle },
      h(ReminderSettings, null),
    );
  };

  return h('div', { style: containerStyle },
    // Tab bar
    h('div', { style: tabBarStyle },
      h('button', {
        style: tabStyle(activeTab === 'dashboard'),
        onClick: () => setActiveTab('dashboard'),
      }, 'Dashboard'),
      h('button', {
        style: tabStyle(activeTab === 'settings'),
        onClick: () => setActiveTab('settings'),
      }, 'Settings'),
    ),

    // Tab content
    activeTab === 'dashboard' ? renderDashboard() : renderSettings(),
  );
}