import Image from "next/image"
import Link from "next/link"

const ALL_TABS = [
  { label: 'Dashboard', tab: 'dashboard' as const, href: '/ops' },
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
  activeTab?: 'dashboard' | 'ask' | 'bills' | 'admin'
  allowedTabs?: string[]
}) {
  // Filter header tabs to those the user is allowed to see. If no
  // allowedTabs prop is given, default to the non-admin set.
  const visible = allowedTabs
    ? ALL_TABS.filter(t => allowedTabs.includes(t.tab))
    : ALL_TABS.filter(t => t.tab !== 'admin')

  return (
    <header style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
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
        <Link href="/ops/bills" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Image src="/brand/logo.png" alt="The Cafe" width={52} height={52} priority />
          <div>
            <div style={{ fontWeight: 700, letterSpacing: 1.2, fontSize: 14 }}>
              The Cafe
            </div>
            <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, marginTop: 2 }}>
              OPS DASHBOARD
            </div>
          </div>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {email ? <div style={{ fontSize: 13, opacity: 0.65 }}>{email}</div> : null}
          {onSignOut ? (
            <button onClick={onSignOut} className="bp-btn" style={{ fontSize: 13 }}>
              Sign out
            </button>
          ) : null}
        </div>
      </div>

      {activeTab && (
        <div className="bp-container" style={{ paddingTop: 0, paddingBottom: 0, display: 'flex', gap: 4 }}>
          {visible.map(({ label, tab, href }) => (
            <Link
              key={tab}
              href={href}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? '#fff' : '#555',
                borderBottom: `2px solid ${activeTab === tab ? '#fff' : 'transparent'}`,
                textDecoration: 'none',
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
