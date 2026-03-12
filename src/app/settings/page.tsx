"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ReminderSettings from "@/components/quickbooks/ReminderSettings";

interface Settings {
  auto_sync_payments: boolean;
  sync_frequency: "realtime" | "hourly" | "daily";
  default_deposit_account: string;
  default_income_account: string;
}

interface Account {
  Id: string;
  Name: string;
  AccountType: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    auto_sync_payments: true,
    sync_frequency: "realtime",
    default_deposit_account: "",
    default_income_account: "",
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/merchant/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
        if (data.accounts) setAccounts(data.accounts);
      }
    } catch {
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/merchant/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Failed to save settings");
      }
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading settings…</div>
      </div>
    );
  }

  const depositAccounts = accounts.filter(
    (a) => a.AccountType === "Bank" || a.AccountType === "Other Current Asset"
  );
  const incomeAccounts = accounts.filter(
    (a) => a.AccountType === "Income" || a.AccountType === "Other Income"
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-dpp-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="font-semibold text-lg text-gray-900">
                Settings
              </span>
            </div>
            <Link
              href="/dashboard"
              className="text-sm text-dpp-accent hover:underline"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {saved && (
          <div className="mb-6 bg-green-50 text-green-800 px-4 py-3 rounded-lg text-sm">
            Settings saved successfully
          </div>
        )}

        {/* Sync Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Payment Sync</h2>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Auto-sync payments</p>
                <p className="text-sm text-gray-500">
                  Automatically record DPP payments in QuickBooks
                </p>
              </div>
              <button
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    auto_sync_payments: !s.auto_sync_payments,
                  }))
                }
                className={`
                  relative w-11 h-6 rounded-full transition-colors
                  ${settings.auto_sync_payments ? "bg-[#2CA01C]" : "bg-gray-300"}
                `}
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
                    transition-transform shadow-sm
                    ${settings.auto_sync_payments ? "translate-x-5" : "translate-x-0"}
                  `}
                />
              </button>
            </div>

            <div>
              <label className="block font-medium text-gray-900 mb-1">
                Sync frequency
              </label>
              <p className="text-sm text-gray-500 mb-2">
                How often payments are synced to QuickBooks
              </p>
              <select
                value={settings.sync_frequency}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    sync_frequency: e.target.value as Settings["sync_frequency"],
                  }))
                }
                className="
                  w-full px-3 py-2 border border-gray-300 rounded-lg
                  text-gray-900 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[#2CA01C] focus:border-transparent
                "
              >
                <option value="realtime">Real-time (recommended)</option>
                <option value="hourly">Every hour</option>
                <option value="daily">Once daily</option>
              </select>
            </div>
          </div>
        </div>

        {/* Account Mapping */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">
            QuickBooks Account Mapping
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Choose which QuickBooks accounts to use when recording payments
          </p>

          <div className="space-y-5">
            <div>
              <label className="block font-medium text-gray-900 mb-1">
                Deposit account
              </label>
              <select
                value={settings.default_deposit_account}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    default_deposit_account: e.target.value,
                  }))
                }
                className="
                  w-full px-3 py-2 border border-gray-300 rounded-lg
                  text-gray-900 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[#2CA01C] focus:border-transparent
                "
              >
                <option value="">Use QuickBooks default</option>
                {depositAccounts.map((acc) => (
                  <option key={acc.Id} value={acc.Id}>
                    {acc.Name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-900 mb-1">
                Income account
              </label>
              <select
                value={settings.default_income_account}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    default_income_account: e.target.value,
                  }))
                }
                className="
                  w-full px-3 py-2 border border-gray-300 rounded-lg
                  text-gray-900 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[#2CA01C] focus:border-transparent
                "
              >
                <option value="">Use QuickBooks default</option>
                {incomeAccounts.map((acc) => (
                  <option key={acc.Id} value={acc.Id}>
                    {acc.Name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Invoice Reminders */}
        <ReminderSettings />

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="
              px-6 py-3 bg-[#2CA01C] hover:bg-[#108000]
              text-white font-semibold rounded-lg
              transition-colors
              disabled:opacity-50
              focus:outline-none focus:ring-2 focus:ring-[#2CA01C] focus:ring-offset-2
            "
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </main>
    </div>
  );
}