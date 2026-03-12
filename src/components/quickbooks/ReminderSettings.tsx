/**
 * ReminderSettings Component
 * 
 * Drop this into the /settings page below the existing sync settings.
 * Uses React.createElement to match the existing dashboard pattern
 * (encoding issues with JSX in Notepad/PowerShell — see Known Quirks).
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';


// Types
interface ReminderConfig {
  reminders_enabled: boolean;
  reminder_send_initial: boolean;
  reminder_before_due_days: number;
  reminder_on_due_date: boolean;
  reminder_overdue_3: boolean;
  reminder_overdue_7: boolean;
  reminder_overdue_14: boolean;
  reminder_from_name: string;
  reminder_reply_to: string;
}

const DEFAULT_CONFIG: ReminderConfig = {
  reminders_enabled: false,
  reminder_send_initial: true,
  reminder_before_due_days: 3,
  reminder_on_due_date: true,
  reminder_overdue_3: true,
  reminder_overdue_7: true,
  reminder_overdue_14: true,
  reminder_from_name: 'Billing',
  reminder_reply_to: '',
};

export default function ReminderSettings() {
  const [config, setConfig] = useState<ReminderConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/merchant/reminder-settings');
      if (res.ok) {
        const data = await res.json();
        setConfig({ ...DEFAULT_CONFIG, ...data });
      }
    } catch (err) {
      console.error('Failed to load reminder settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/merchant/reminder-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Reminder settings saved' });
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || 'Failed to save' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error — please try again' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const update = (field: keyof ReminderConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return React.createElement('div', {
      style: { padding: '20px', color: '#666', fontStyle: 'italic' }
    }, 'Loading reminder settings...');
  }

  // ─── Render with React.createElement (matching project pattern) ───

  const h = React.createElement;

  const sectionStyle = {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '24px',
    marginTop: '24px',
  };

  const labelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 0',
    fontSize: '14px',
    color: '#333',
    cursor: 'pointer',
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    marginTop: '4px',
  };

  const checkboxRow = (label: string, field: keyof ReminderConfig, description?: string) =>
    h('label', { style: labelStyle, key: field },
      h('input', {
        type: 'checkbox',
        checked: config[field] as boolean,
        onChange: (e: any) => update(field, e.target.checked),
        disabled: !config.reminders_enabled && field !== 'reminders_enabled',
        style: { width: '18px', height: '18px', accentColor: '#2E75B6' },
      }),
      h('div', null,
        h('span', { style: { fontWeight: field === 'reminders_enabled' ? '600' : '400' } }, label),
        description && h('p', { style: { margin: '2px 0 0', fontSize: '12px', color: '#888' } }, description),
      ),
    );

  return h('div', { style: sectionStyle },
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
      h('div', null,
        h('h3', { style: { margin: 0, fontSize: '16px', fontWeight: '600', color: '#1a1a2e' } }, 'Invoice Reminders'),
        h('p', { style: { margin: '4px 0 0', fontSize: '13px', color: '#666' } },
          'Automatically email customers when invoices are created in QuickBooks'
        ),
      ),
    ),

    // Master toggle
    checkboxRow('Enable Invoice Reminders', 'reminders_enabled',
      'When enabled, new QB invoices trigger branded payment emails'
    ),

    // Schedule section (disabled when master toggle is off)
    h('div', {
      style: {
        opacity: config.reminders_enabled ? 1 : 0.5,
        pointerEvents: config.reminders_enabled ? 'auto' : 'none',
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #e2e8f0',
      }
    },
      h('h4', { style: { margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#555' } }, 'Email Schedule'),

      checkboxRow('Send email when invoice is created', 'reminder_send_initial',
        'Customer receives a payment request immediately after you save the invoice'
      ),

      // Before due days
      h('div', { style: { ...labelStyle, flexDirection: 'column' as any, alignItems: 'flex-start', gap: '4px' } },
        h('span', null, 'Remind before due date'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('input', {
            type: 'number',
            min: 0,
            max: 30,
            value: config.reminder_before_due_days,
            onChange: (e: any) => update('reminder_before_due_days', parseInt(e.target.value) || 0),
            style: { ...inputStyle, width: '70px' },
          }),
          h('span', { style: { fontSize: '13px', color: '#666' } }, 'days before due (0 = disabled)'),
        ),
      ),

      checkboxRow('Remind on due date', 'reminder_on_due_date'),
      checkboxRow('Remind 3 days overdue', 'reminder_overdue_3'),
      checkboxRow('Remind 7 days overdue', 'reminder_overdue_7'),
      checkboxRow('Remind 14 days overdue', 'reminder_overdue_14'),

      // Email identity
      h('div', {
        style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }
      },
        h('h4', { style: { margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#555' } }, 'Email Identity'),

        h('div', { style: { marginBottom: '12px' } },
          h('label', { style: { fontSize: '13px', color: '#555', fontWeight: '500' } }, 'From Name'),
          h('input', {
            type: 'text',
            value: config.reminder_from_name,
            onChange: (e: any) => update('reminder_from_name', e.target.value),
            placeholder: 'Billing',
            style: inputStyle,
          }),
          h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: '#888' } },
            'Displayed as the sender name in customer emails'
          ),
        ),

        h('div', null,
          h('label', { style: { fontSize: '13px', color: '#555', fontWeight: '500' } }, 'Reply-To Email'),
          h('input', {
            type: 'email',
            value: config.reminder_reply_to,
            onChange: (e: any) => update('reminder_reply_to', e.target.value),
            placeholder: 'billing@yourcompany.com',
            style: inputStyle,
          }),
          h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: '#888' } },
            'Customer replies go to this address (optional)'
          ),
        ),
      ),
    ),

    // Save button + message
    h('div', { style: { marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px' } },
      h('button', {
        onClick: saveSettings,
        disabled: saving,
        style: {
          padding: '10px 24px',
          backgroundColor: saving ? '#93c5fd' : '#2E75B6',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: saving ? 'not-allowed' : 'pointer',
        },
      }, saving ? 'Saving...' : 'Save Reminder Settings'),

      message && h('span', {
        style: {
          fontSize: '13px',
          fontWeight: '500',
          color: message.type === 'success' ? '#16a34a' : '#dc2626',
        }
      }, message.text),
    ),
  );
}