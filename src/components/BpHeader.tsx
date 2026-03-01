import Image from "next/image"
import Link from "next/link"

export default function BpHeader({
  email,
  onSignOut,
}: {
  email?: string | null
  onSignOut?: () => void
}) {
  return (
    <header style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "22px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href="/ops"
          style={{ display: "flex", alignItems: "center", gap: 14 }}
        >
          <Image
            src="/brand/logo.png"
            alt="The Cafe"
            width={52}
            height={52}
            priority
          />
          <div>
            <div
              style={{
                fontWeight: 700,
                letterSpacing: 1.2,
                fontSize: 14,
              }}
            >
              The Cafe
            </div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 1,
                opacity: 0.6,
                marginTop: 2,
              }}
            >
              OPS DASHBOARD
            </div>
          </div>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {email && (
            <div style={{ fontSize: 13, opacity: 0.65 }}>{email}</div>
          )}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="bp-btn"
              style={{ fontSize: 13 }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  )
}