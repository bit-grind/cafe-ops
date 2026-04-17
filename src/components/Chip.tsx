import type { ReactNode } from 'react'

type Props = {
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  count?: number | null
  children: ReactNode
  title?: string
  type?: 'button' | 'submit'
}

export default function Chip({ active, onClick, disabled, count, children, title, type = 'button' }: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active ? true : undefined}
      title={title}
      className={`bp-chip${active ? ' bp-chip--active' : ''}`}
    >
      {children}
      {count !== undefined && count !== null && (
        <span className="bp-chip__count">{count}</span>
      )}
    </button>
  )
}
