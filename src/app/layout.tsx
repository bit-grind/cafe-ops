import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { getServerBranding } from "@/lib/brandingServer";
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

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replace(/[<>&]/g, (char) => {
    if (char === '<') return '\\u003c'
    if (char === '>') return '\\u003e'
    return '\\u0026'
  })
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
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__APP_BRANDING__=${serializeForScript(branding)};`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
