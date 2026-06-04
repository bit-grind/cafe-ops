import Image from "next/image"
import Link from "next/link"
import { ALL_TABS, type AppTab } from '@/lib/permissions'

export default function BpHeader({
  email,
  onSignOut,
  activeTab,
  allowedTabs,
}: {
  email?: string | null
  onSignOut?: () => void
  activeTab?: AppTab
  allowedTabs?: AppTab[]
}) {
  const visible = allowedTabs
    ? ALL_TABS.filter(t => allowedTabs.includes(t.tab))
    : ALL_TABS.filter(t => t.tab !== 'admin')

  // Logo links to the user's landing page — kitchen users don't see the
  // dashboard, so send them to their first visible tab instead.
  const homeHref = visible[0]?.href ?? '/ops'

  return (
    <header style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        className="bp-container"
        style={{
          paddingTop: 22,
          paddingBottom: activeTab ? 0 : 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <Link href={homeHref} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Image src="/brand/logo.svg" alt="Cafe Ops" width={52} height={52} priority />
          <div>
            <div style={{ fontWeight: 700, letterSpacing: "0.1em", fontSize: 14 }}>
              CAFE OPS
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--muted-strong)", marginTop: 2 }}>
              OPS DASHBOARD
            </div>
            {email ? <div className="bp-hdr-email--mobile">{email}</div> : null}
          </div>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {email ? (
            <div className="bp-hdr-email--desktop" style={{ fontSize: 13, color: "var(--muted-strong)" }}>
              {email}
            </div>
          ) : null}
          {onSignOut ? (
            <button onClick={onSignOut} className="bp-btn" style={{ fontSize: 13 }}>
              Sign out
            </button>
          ) : null}
        </div>
      </div>

      {activeTab && (
        <nav
          className="bp-container"
          aria-label="Primary"
          style={{ paddingTop: 0, paddingBottom: 0, display: 'flex', gap: 4 }}
        >
          {visible.map(({ label, tab, href }) => {
            const active = activeTab === tab
            return (
              <Link
                key={tab}
                href={href}
                aria-current={active ? 'page' : undefined}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#fff' : 'var(--muted-strong)',
                  borderBottom: `2px solid ${active ? '#fff' : 'transparent'}`,
                  textDecoration: 'none',
                }}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      )}
    </header>
  )
}
