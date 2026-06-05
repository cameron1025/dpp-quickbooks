"use client";

import React from "react";

export default function PrivacyPolicyPage() {
  return React.createElement("div", { className: "min-h-screen bg-gray-50" },
    React.createElement("header", { className: "bg-white border-b border-gray-200" },
      React.createElement("div", { className: "max-w-4xl mx-auto px-4 sm:px-6 lg:px-8" },
        React.createElement("div", { className: "flex items-center justify-between h-16" },
          React.createElement("div", { className: "flex items-center gap-3" },
            React.createElement("img", { src: "/logo.png", alt: "PaySync", className: "w-8 h-8 rounded-lg" }),
            React.createElement("span", { className: "font-semibold text-lg text-gray-900" }, "PaySync")
          ),
          React.createElement("a", { href: "/dashboard", className: "text-sm text-gray-600 hover:text-gray-900" }, "Dashboard")
        )
      )
    ),
    React.createElement("main", { className: "max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12" },
      React.createElement("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm p-8 sm:p-12" },
        React.createElement("h1", { className: "text-3xl font-bold text-gray-900 mb-2" }, "Privacy Policy"),
        React.createElement("p", { className: "text-sm text-gray-500 mb-8" }, "Last updated: March 12, 2026"),

        React.createElement("div", { className: "prose prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed" },

          React.createElement("p", null, "Perspective Holdings LLC (\"Company,\" \"we,\" \"us,\" or \"our\") operates the PaySync QuickBooks Integration application (\"Application\"). This Privacy Policy explains how we collect, use, store, and protect your information when you use the Application."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "1. Information We Collect"),

          React.createElement("h3", { className: "text-base font-medium text-gray-800 mt-4" }, "Information from QuickBooks"),
          React.createElement("p", null, "When you connect your QuickBooks Online account, we access the following data through Intuit's APIs:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "Company name and identifiers"),
            React.createElement("li", null, "Customer names and email addresses"),
            React.createElement("li", null, "Payment and invoice records"),
            React.createElement("li", null, "Account information for deposit and income mapping")
          ),

          React.createElement("h3", { className: "text-base font-medium text-gray-800 mt-4" }, "Information from Deluxe"),
          React.createElement("p", null, "When payment transactions are processed through Deluxe, we receive:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "Transaction amounts, dates, and status"),
            React.createElement("li", null, "Customer names and email addresses"),
            React.createElement("li", null, "Payment method type (e.g., credit card, ACH)"),
            React.createElement("li", null, "Masked card numbers (last four digits only)")
          ),

          React.createElement("h3", { className: "text-base font-medium text-gray-800 mt-4" }, "Account Information"),
          React.createElement("p", null, "When you sign in through Intuit, we receive your name and verified email address via OpenID Connect."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "2. How We Use Your Information"),
          React.createElement("p", null, "We use the information we collect to:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "Synchronize payment transactions from DPP to your QuickBooks Online account."),
            React.createElement("li", null, "Create and match customer records in QuickBooks."),
            React.createElement("li", null, "Display sync status, history, and analytics in the Application dashboard."),
            React.createElement("li", null, "Send you notifications about sync failures or issues (if configured)."),
            React.createElement("li", null, "Maintain and improve the Application's functionality and security.")
          ),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "3. Data Storage and Security"),
          React.createElement("p", null, "We take the security of your data seriously:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "OAuth tokens are encrypted at rest using AES-256-GCM encryption."),
            React.createElement("li", null, "All data is stored in a secure, hosted PostgreSQL database with access controls."),
            React.createElement("li", null, "All communication between the Application and external services uses HTTPS/TLS encryption."),
            React.createElement("li", null, "We implement rate limiting, CSRF protection, input validation, and security headers."),
            React.createElement("li", null, "We do not store full credit card numbers, bank account numbers, or other sensitive payment credentials.")
          ),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "4. Data Sharing"),
          React.createElement("p", null, "We do not sell, rent, or trade your personal information. We share data only in the following circumstances:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "With QuickBooks Online (Intuit) to sync your payment data, as authorized by you."),
            React.createElement("li", null, "With infrastructure providers (hosting, database) that process data on our behalf under strict confidentiality obligations."),
            React.createElement("li", null, "When required by law, legal process, or to protect our rights and safety.")
          ),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "5. Data Retention"),
          React.createElement("p", null, "We retain your data for as long as your account is active and connected. When you disconnect your QuickBooks account:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "OAuth tokens are immediately revoked and deleted."),
            React.createElement("li", null, "Sync history and transaction logs are retained for 90 days for troubleshooting, then permanently deleted."),
            React.createElement("li", null, "You may request immediate deletion of all your data by contacting us.")
          ),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "6. Your Rights"),
          React.createElement("p", null, "You have the right to:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "Access the data we hold about you."),
            React.createElement("li", null, "Request correction of inaccurate data."),
            React.createElement("li", null, "Request deletion of your data."),
            React.createElement("li", null, "Disconnect your QuickBooks account at any time from the Application or from the QuickBooks App Store."),
            React.createElement("li", null, "Withdraw consent for data processing by disconnecting the Application.")
          ),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "7. Intuit Data Use Compliance"),
          React.createElement("p", null, "In accordance with Intuit's developer requirements:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "We access only the QuickBooks data necessary to provide the Application's functionality."),
            React.createElement("li", null, "We do not use QuickBooks data for advertising, marketing to third parties, or any purpose unrelated to the Application's core functionality."),
            React.createElement("li", null, "We handle all Intuit user data in compliance with Intuit's platform policies and applicable data protection laws.")
          ),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "8. Cookies"),
          React.createElement("p", null, "The Application uses essential cookies only:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "Session cookies to maintain your authenticated session."),
            React.createElement("li", null, "CSRF tokens to protect against cross-site request forgery."),
            React.createElement("li", null, "OAuth state cookies during the QuickBooks connection flow.")
          ),
          React.createElement("p", null, "We do not use tracking cookies, analytics cookies, or third-party advertising cookies."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "9. Changes to This Policy"),
          React.createElement("p", null, "We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. Your continued use of the Application after changes constitutes acceptance of the revised policy."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "10. Contact Us"),
          React.createElement("p", null, "If you have questions or concerns about this Privacy Policy or our data practices, contact us at:"),
          React.createElement("p", null,
            "Perspective Holdings LLC", React.createElement("br", null),
            "Email: support@perspectiveproductions.net"
          )
        )
      )
    )
  );
}

