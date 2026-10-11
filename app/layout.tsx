import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Match",
  description: "Paste your resume and see which open roles actually fit.",
  applicationName: "Resume Match",
  authors: [{ name: "Hlaing Min Kyaw", url: "https://hmkportfolio.vercel.app/" }],
  creator: "Hlaing Min Kyaw",
  publisher: "Hlaing Min Kyaw",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
