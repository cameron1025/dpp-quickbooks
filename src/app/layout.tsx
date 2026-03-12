import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DPP Payments × QuickBooks",
  description:
    "Seamlessly sync your DPP payment gateway transactions with QuickBooks Online. Automatic payment recording, invoice matching, and real-time reconciliation.",
  robots: "noindex, nofollow", // Private app — no indexing
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-50 text-gray-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
