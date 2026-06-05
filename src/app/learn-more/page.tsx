// ============================================================
// Learn More Page
// ============================================================
// Intuit Technical Requirement:
// Apps must have a "Learn more" button/link that leads to a
// page explaining: what the app does, how it integrates with
// QuickBooks Online, and step-by-step usage instructions.

import React from "react";
import Link from "next/link";

export default function LearnMorePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/dashboard"
              className="flex items-center gap-3"
            >
              <div className="w-8 h-8 bg-dpp-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">P</span>
              </div>
              <span className="font-semibold text-lg text-gray-900">
                PaySync
              </span>
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-dpp-accent hover:underline"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            PaySync for QuickBooks Online
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Sync your Deluxe payments to QuickBooks &mdash; automatically.
            Every transaction is recorded and matched to the right invoice,
            so your books stay current without any manual data entry.
          </p>
          <p className="text-sm text-gray-400 mt-4">
            by Perspective Productions
          </p>
        </div>

        {/* Key Features */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Key Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Automatic Payment Sync",
                description:
                  "Every payment processed through Deluxe is automatically recorded in QuickBooks as a payment. No manual entry needed.",
                icon: "🔄",
              },
              {
                title: "Invoice Matching",
                description:
                  "Payments are intelligently matched to open invoices in QuickBooks, keeping your accounts receivable current.",
                icon: "📋",
              },
              {
                title: "Set It and Forget It",
                description:
                  "Once you connect, everything runs in the background. There's nothing to manage day to day — your books just stay up to date.",
                icon: "⚡",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-gray-50 rounded-xl p-6"
              >
                <div className="text-2xl mb-3">{feature.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            How It Works with QuickBooks Online
          </h2>
          <ol className="space-y-6">
            {[
              {
                step: 1,
                title: "Open your secure connection link",
                description:
                  "Your provider sends you a secure link to get started. Open it and click the “Connect to QuickBooks” button.",
              },
              {
                step: 2,
                title: "Authorize access",
                description:
                  "Sign in to your QuickBooks Online account and authorize PaySync to read and create payments and invoices on your behalf. You're redirected to Intuit to approve the connection securely.",
              },
              {
                step: 3,
                title: "You're done — it syncs automatically",
                description:
                  "That's it. From this point on, every payment processed through Deluxe is automatically recorded in QuickBooks and matched to the right open invoice. There's nothing else to set up.",
              },
              {
                step: 4,
                title: "Review in QuickBooks anytime",
                description:
                  "Open QuickBooks Online whenever you like to see your synced payments, matched invoices, and up-to-date account balances.",
              },
            ].map((item) => (
              <li key={item.step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#2CA01C] text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Disconnecting */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Disconnecting
          </h2>
          <div className="bg-gray-50 rounded-xl p-6 space-y-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">
                From PaySync:
              </span>{" "}
              Open your PaySync page and click &ldquo;Disconnect
              QuickBooks&rdquo;. You&apos;ll stay on the page and can
              reconnect at any time.
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">
                From the QuickBooks App Store:
              </span>{" "}
              Go to Apps → My Apps in QuickBooks Online and disconnect
              PaySync. This will revoke access and stop all syncing.
            </p>
            <p className="text-sm text-gray-500">
              In both cases, your existing data in QuickBooks is not
              deleted. Only future syncing is stopped.
            </p>
          </div>
        </section>

        {/* Data & Privacy */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Data &amp; Privacy
          </h2>
          <div className="text-sm text-gray-600 space-y-3">
            <p>
              PaySync uses OAuth 2.0 to securely connect to your
              QuickBooks Online account. We never store your QuickBooks
              password. All access tokens are encrypted at rest using
              AES-256-GCM.
            </p>
            <p>
              We access only the data necessary to sync payments: your
              customer list, invoices, and payment records. We do not
              access payroll, tax, or employee data.
            </p>
            <p>
              You can revoke access at any time from your PaySync page
              or from the QuickBooks App Store.
            </p>
          </div>
        </section>

        {/* Support */}
        <section className="text-center py-8 border-t border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Need Help?
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Our support team is here to help with setup, troubleshooting,
            or any questions about the integration.
          </p>
          <a
            href="mailto:support@perspectiveproductions.net"
            className="
              inline-flex items-center
              px-6 py-3
              bg-dpp-primary text-white
              font-medium rounded-lg
              hover:bg-opacity-90 transition-colors
            "
          >
            Contact Support
          </a>
        </section>
      </main>
    </div>
  );
}
