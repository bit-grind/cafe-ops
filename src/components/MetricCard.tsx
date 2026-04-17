import Link from 'next/link'
import type { ReactNode } from 'react'

type Props = {
  label: string
  sub?: string
  value: string
  foot?: ReactNode
  href?: string
  primary?: boolean
}

export default function MetricCard({ label, sub, value, foot, href, primary }: Props) {
  const className = `bp-metric${primary ? ' bp-metric--primary' : ''}`
  const body = (
    <>
      <div className="bp-metric__label">{label}</div>
      {sub && <div className="bp-metric__sub">{sub}</div>}
      <div className="bp-metric__value">{value}</div>
      {foot && <div className="bp-metric__foot">{foot}</div>}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    )
  }
  return <div className={className}>{body}</div>
}

export function MetricSkeleton({ primary }: { primary?: boolean }) {
  return (
    <div className={`bp-metric${primary ? ' bp-metric--primary' : ''}`}>
      <div className="bp-skel" style={{ width: 90, height: 11 }} />
      <div className="bp-skel" style={{ width: 140, height: primary ? 36 : 30, marginTop: 14 }} />
      <div className="bp-skel" style={{ width: 180, height: 12, marginTop: 12 }} />
    </div>
  )
}
