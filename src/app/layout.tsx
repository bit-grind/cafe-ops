import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { APP_DISPLAY_NAME } from "@/lib/branding";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description: "Internal operations dashboard for cafe teams",
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
      </body>
    </html>
  );
}
