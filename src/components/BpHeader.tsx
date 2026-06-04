import Link from "next/link"
import { ALL_TABS, type AppTab } from '@/lib/permissions'
import { useBranding } from '@/lib/useBranding'

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
  const branding = useBranding()
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logoSrc}
            alt={`${branding.displayName} logo`}
            width={52}
            height={52}
            style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 18, flex: '0 0 auto' }}
          />
          <div>
            <div style={{ fontWeight: 700, letterSpacing: "0.1em", fontSize: 14, textTransform: 'uppercase' }}>
              {branding.displayName}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "var(--muted-strong)",
                marginTop: 2,
                textTransform: 'uppercase',
              }}
            >
              {branding.subtitle}
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
