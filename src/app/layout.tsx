import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Blue Poppy — Ops",
  description: "Internal operations dashboard for The Blue Poppy",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={geist.className}
        style={{
          background: "#0b0b0b",
          color: "#f5f5f5",
          minHeight: "100vh",
        }}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}