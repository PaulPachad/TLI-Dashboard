import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TLI Leverage Dashboard",
  description: "Leverage your published Authority Magazine interviews",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50 text-slate-900 font-sans antialiased overflow-x-hidden">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
