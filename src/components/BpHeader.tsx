import Image from "next/image"
import Link from "next/link"

const ALL_TABS = [
  { label: 'Dashboard', tab: 'dashboard' as const, href: '/ops' },
  { label: 'Kitchen', tab: 'kitchen' as const, href: '/ops/kitchen' },
  { label: 'Ask AI', tab: 'ask' as const, href: '/ops/ask' },
  { label: 'Suppliers', tab: 'bills' as const, href: '/ops/bills' },
  { label: 'Admin', tab: 'admin' as const, href: '/ops/admin' },
]

export default function BpHeader({
  email,
  onSignOut,
  activeTab,
  allowedTabs,
}: {
  email?: string | null
  onSignOut?: () => void
  activeTab?: 'dashboard' | 'kitchen' | 'ask' | 'bills' | 'admin'
  allowedTabs?: string[]
}) {
  const visible = allowedTabs
    ? ALL_TABS.filter(t => allowedTabs.includes(t.tab))
    : ALL_TABS.filter(t => t.tab !== 'admin')

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
        <Link href="/ops" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Image src="/brand/logo.png" alt="The Cafe" width={52} height={52} priority />
          <div>
            <div style={{ fontWeight: 700, letterSpacing: "0.1em", fontSize: 14 }}>
              The Cafe
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--muted-strong)", marginTop: 2 }}>
              OPS DASHBOARD
            </div>
          </div>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {email ? <div style={{ fontSize: 13, color: "var(--muted-strong)" }}>{email}</div> : null}
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
