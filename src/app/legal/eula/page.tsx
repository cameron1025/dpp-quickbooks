"use client";

import React from "react";

export default function EULAPage() {
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
        React.createElement("h1", { className: "text-3xl font-bold text-gray-900 mb-2" }, "End-User License Agreement"),
        React.createElement("p", { className: "text-sm text-gray-500 mb-8" }, "Last updated: March 12, 2026"),

        React.createElement("div", { className: "prose prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed" },

          React.createElement("p", null, "This End-User License Agreement (\"Agreement\") is a legal agreement between you (\"User,\" \"you,\" or \"your\") and Perspective Holdings LLC (\"Company,\" \"we,\" \"us,\" or \"our\") governing your use of the PaySync QuickBooks Integration application (\"Application\")."),

          React.createElement("p", null, "By accessing or using the Application, you agree to be bound by this Agreement. If you do not agree, do not use the Application."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "1. License Grant"),
          React.createElement("p", null, "We grant you a limited, non-exclusive, non-transferable, revocable license to use the Application solely for the purpose of synchronizing payment transaction data between your Deluxe payments and your QuickBooks Online account, in accordance with this Agreement."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "2. Permitted Use"),
          React.createElement("p", null, "You may use the Application to:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "Connect your QuickBooks Online account to PaySync."),
            React.createElement("li", null, "Automatically sync payment transactions, customer records, and related financial data to QuickBooks Online."),
            React.createElement("li", null, "View sync status, history, and manage integration settings.")
          ),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "3. Restrictions"),
          React.createElement("p", null, "You agree not to:"),
          React.createElement("ul", { className: "list-disc pl-6 space-y-1" },
            React.createElement("li", null, "Reverse engineer, decompile, or disassemble the Application."),
            React.createElement("li", null, "Use the Application for any unlawful purpose or in violation of any applicable laws or regulations."),
            React.createElement("li", null, "Attempt to gain unauthorized access to the Application, related systems, or networks."),
            React.createElement("li", null, "Sublicense, sell, rent, or lease access to the Application to any third party."),
            React.createElement("li", null, "Use the Application to transmit malicious code or interfere with its operation.")
          ),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "4. QuickBooks Integration"),
          React.createElement("p", null, "The Application integrates with QuickBooks Online via Intuit's APIs. Your use of QuickBooks Online is subject to Intuit's own terms of service. We are not responsible for the availability, accuracy, or functionality of QuickBooks Online or Intuit's services."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "5. Data and Privacy"),
          React.createElement("p", null, "Your use of the Application is also governed by our Privacy Policy, available at /legal/privacy. We handle your data in accordance with applicable data protection laws and Intuit's developer requirements."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "6. Intellectual Property"),
          React.createElement("p", null, "The Application and all related intellectual property rights remain the exclusive property of Perspective Holdings LLC. This Agreement does not transfer any ownership rights to you."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "7. Disclaimer of Warranties"),
          React.createElement("p", null, "THE APPLICATION IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE APPLICATION WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "8. Limitation of Liability"),
          React.createElement("p", null, "TO THE MAXIMUM EXTENT PERMITTED BY LAW, PERSPECTIVE HOLDINGS LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUE, WHETHER INCURRED DIRECTLY OR INDIRECTLY, ARISING FROM YOUR USE OF THE APPLICATION. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "9. Termination"),
          React.createElement("p", null, "We may terminate or suspend your access to the Application at any time, with or without cause, with or without notice. You may stop using the Application at any time by disconnecting your QuickBooks account. Upon termination, your license to use the Application is immediately revoked."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "10. Changes to This Agreement"),
          React.createElement("p", null, "We reserve the right to modify this Agreement at any time. Changes will be posted on this page with an updated date. Your continued use of the Application after changes constitutes acceptance of the revised Agreement."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "11. Governing Law"),
          React.createElement("p", null, "This Agreement shall be governed by and construed in accordance with the laws of the State of Utah, without regard to its conflict of law provisions."),

          React.createElement("h2", { className: "text-lg font-semibold text-gray-900 mt-8" }, "12. Contact"),
          React.createElement("p", null, "If you have questions about this Agreement, contact us at:"),
          React.createElement("p", null,
            "Perspective Holdings LLC", React.createElement("br", null),
            "Email: support@perspectiveproductions.net"
          )
        )
      )
    )
  );
}

