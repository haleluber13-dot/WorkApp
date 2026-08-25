import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import { Dashboard } from './screens/Dashboard'
import { Timeline } from './screens/Timeline'
import { Money } from './screens/Money'
import { Jobs } from './screens/Jobs'
import { Reports } from './screens/Reports'
import { Settings } from './screens/Settings'
import { DayEditor } from './screens/DayEditor'
import { monthKey, todayISO } from './lib/time'
import {
  IconCamera, IconChart, IconHome, IconPlus, IconSettings, IconClock, IconWallet,
} from './components/Icons'

type Tab = 'home' | 'hours' | 'money' | 'jobs' | 'reports' | 'settings'

/**
 * Whatever theme the surrounding page had stamped on <html> before we booted.
 * On "auto" we hand it back rather than stripping it, so an embedding page that
 * sets the theme for its viewer keeps control.
 */
const hostTheme = document.documentElement.getAttribute('data-theme')

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'home', label: 'Home', icon: IconHome },
  { id: 'hours', label: 'Hours', icon: IconClock },
  { id: 'money', label: 'Money', icon: IconWallet },
  { id: 'jobs', label: 'Jobs', icon: IconCamera },
  { id: 'reports', label: 'Reports', icon: IconChart },
]

function Shell() {
  const store = useStore()
  const [tab, setTab] = useState<Tab>('home')
  const [month, setMonth] = useState(() => monthKey(todayISO()))
  const [editingDay, setEditingDay] = useState<string | null>(null)

  // Apply the theme choice to the document root.
  useEffect(() => {
    const root = document.documentElement
    if (store.settings.theme !== 'auto') root.setAttribute('data-theme', store.settings.theme)
    else if (hostTheme) root.setAttribute('data-theme', hostTheme)
    else root.removeAttribute('data-theme')
  }, [store.settings.theme])

  // Scroll back to the top when switching tabs.
  useEffect(() => { window.scrollTo({ top: 0 }) }, [tab])

  return (
    <div className="app">
      <main className="page">
        {tab === 'home' && <Dashboard month={month} setMonth={setMonth} onPickDay={setEditingDay} />}
        {tab === 'hours' && <Timeline month={month} setMonth={setMonth} onPickDay={setEditingDay} />}
        {tab === 'money' && <Money month={month} setMonth={setMonth} />}
        {tab === 'jobs' && <Jobs onPickDay={setEditingDay} />}
        {tab === 'reports' && <Reports month={month} setMonth={setMonth} />}
        {tab === 'settings' && <Settings />}
      </main>

      <button
        className="fab" onClick={() => setEditingDay(todayISO())}
        aria-label="Log today"
      >
        <IconPlus size={26} />
      </button>

      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id} onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                <Icon size={21} />
                <span>{t.label}</span>
                <span className="nav-dot" />
              </button>
            )
          })}
          <button
            onClick={() => setTab('settings')}
            aria-current={tab === 'settings' ? 'page' : undefined}
          >
            <IconSettings size={21} />
            <span>You</span>
            <span className="nav-dot" />
          </button>
        </div>
      </nav>

      {editingDay && (
        <DayEditor date={editingDay} onClose={() => setEditingDay(null)} onGoToDate={setEditingDay} />
      )}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
