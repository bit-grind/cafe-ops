'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { getLandingHref, type AppTab } from '@/lib/permissions'
import { useBranding } from '@/lib/useBranding'
import styles from './V2Shell.module.css'

const NAV_ORDER: AppTab[] = ['dashboard', 'kitchen', 'recipes', 'bills', 'ask', 'calendar', 'admin']

const NAV_LABELS: Record<AppTab, string> = {
  dashboard: 'Overview',
  kitchen: 'Kitchen',
  recipes: 'Recipes',
  bills: 'Bills',
  ask: 'Ask AI',
  calendar: 'Calendar',
  admin: 'Admin',
}

const NAV_HREFS: Record<AppTab, string> = {
  dashboard: '/v2',
  kitchen: '/v2/kitchen',
  recipes: '/v2/recipes',
  bills: '/v2/bills',
  ask: '/v2/ask',
  calendar: '/v2/calendar',
  admin: '/v2/admin',
}

const MOBILE_ORDER: AppTab[] = ['dashboard', 'kitchen', 'bills', 'ask']

function NavMark({ active }: { active?: boolean }) {
  return <span className={active ? `${styles.navMark} ${styles.navMarkActive}` : styles.navMark} aria-hidden="true" />
}

export default function V2Shell({
  activeTab,
  email,
  allowedTabs,
  onSignOut,
  eyebrow,
  title,
  description,
  actions,
  wide = false,
  children,
}: {
  activeTab: AppTab
  email?: string | null
  allowedTabs: AppTab[]
  onSignOut: () => void | Promise<void>
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  const branding = useBranding()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const visibleTabs = NAV_ORDER.filter(tab => allowedTabs.includes(tab))
  const homeHref = getLandingHref(allowedTabs, 'v2')
  const currentSiteHref = getLandingHref(allowedTabs)
  const primaryMobileTabs = visibleTabs.length === 1
    ? visibleTabs
    : MOBILE_ORDER.filter(tab => visibleTabs.includes(tab))
  const extraMobileTabs = visibleTabs.filter(tab => !primaryMobileTabs.includes(tab))

  return (
    <>
      <header className={styles.mobileHeader}>
        <Link href={homeHref} className={styles.mobileBrand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoSrc} alt={`${branding.displayName} logo`} />
          <span><strong>{branding.displayName}</strong><small>{branding.subtitle}</small></span>
        </Link>
        <button
          type="button"
          className={styles.accountButton}
          onClick={() => setMobileMenuOpen(open => !open)}
          aria-expanded={mobileMenuOpen}
          aria-label="Open account and navigation menu"
        >
          {(email?.[0] ?? 'O').toUpperCase()}
        </button>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Link href={homeHref} className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoSrc} alt={`${branding.displayName} logo`} />
            <span><strong>{branding.displayName}</strong><small>Operations</small></span>
          </Link>

          <div className={styles.navLabel}>Workspace</div>
          <nav className={styles.nav} aria-label="V2 primary navigation">
            {visibleTabs.filter(tab => tab !== 'admin').map(tab => (
              <Link
                key={tab}
                href={NAV_HREFS[tab]}
                className={tab === activeTab ? styles.navActive : styles.navLink}
                aria-current={tab === activeTab ? 'page' : undefined}
              >
                <NavMark active={tab === activeTab} />
                {NAV_LABELS[tab]}
              </Link>
            ))}
          </nav>

          {visibleTabs.includes('admin') && (
            <>
              <div className={styles.navLabel}>Manage</div>
              <nav className={styles.nav} aria-label="V2 management navigation">
                <Link
                  href={NAV_HREFS.admin}
                  className={activeTab === 'admin' ? styles.navActive : styles.navLink}
                  aria-current={activeTab === 'admin' ? 'page' : undefined}
                >
                  <NavMark active={activeTab === 'admin'} />
                  Admin
                </Link>
              </nav>
            </>
          )}

          <div className={styles.account}>
            <strong title={email ?? undefined}>{email ?? 'Signed in'}</strong>
            <span>V2 workspace</span>
            <div className={styles.accountLinks}>
              <Link href={currentSiteHref}>Current site</Link>
              <button type="button" onClick={() => void onSignOut()}>Sign out</button>
            </div>
          </div>
        </aside>

        <main className={wide ? `${styles.main} ${styles.mainWide}` : styles.main}>
          <header className={styles.pageHeader}>
            <div className={styles.pageTitle}>
              {eyebrow && <span>{eyebrow}</span>}
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </div>
            {actions && <div className={styles.pageActions}>{actions}</div>}
          </header>
          <div className={styles.content}>{children}</div>
        </main>
      </div>

      {mobileMenuOpen && (
        <div className={styles.mobileMenu}>
          <div className={styles.mobileMenuHeader}>
            <div><strong>{email ?? 'Signed in'}</strong><span>V2 workspace</span></div>
            <button type="button" onClick={() => setMobileMenuOpen(false)}>Close</button>
          </div>
          <nav aria-label="More navigation">
            {extraMobileTabs.map(tab => (
              <Link key={tab} href={NAV_HREFS[tab]} onClick={() => setMobileMenuOpen(false)}>
                {NAV_LABELS[tab]}
              </Link>
            ))}
            <Link href={currentSiteHref}>Current site</Link>
            <button type="button" onClick={() => void onSignOut()}>Sign out</button>
          </nav>
        </div>
      )}

      <nav
        className={styles.mobileNav}
        aria-label="V2 mobile navigation"
        style={{ gridTemplateColumns: `repeat(${primaryMobileTabs.length + 1}, minmax(0, 1fr))` }}
      >
        {primaryMobileTabs.map(tab => (
          <Link
            key={tab}
            href={NAV_HREFS[tab]}
            className={tab === activeTab ? styles.mobileNavActive : undefined}
            aria-current={tab === activeTab ? 'page' : undefined}
          >
            <NavMark active={tab === activeTab} />
            <span>{tab === 'dashboard' ? 'Today' : NAV_LABELS[tab].replace(' AI', '')}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setMobileMenuOpen(open => !open)} aria-expanded={mobileMenuOpen}>
          <NavMark active={mobileMenuOpen || extraMobileTabs.includes(activeTab)} />
          <span>More</span>
        </button>
      </nav>
    </>
  )
}
