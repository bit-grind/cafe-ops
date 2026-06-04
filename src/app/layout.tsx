import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { getServerBranding } from "@/lib/brandingServer";
import { BrandingProvider } from "@/lib/useBranding";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getServerBranding()
  return {
    title: branding.displayName,
    description: "Internal operations dashboard for cafe teams",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const branding = await getServerBranding()

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
        <BrandingProvider initialBranding={branding}>
          {children}
        </BrandingProvider>
      </body>
    </html>
  );
}
