/**
 * Sidebar
 * -------
 * Persistent dark-navy navigation panel.  Each nav item is a button that calls
 * `onNavigate` with the page key.  The active item gets a highlighted pill
 * background so users always know where they are.
 *
 * Icons are inline SVGs (no extra icon library needed).
 */

const NAV_ITEMS = [
  {
    key: 'price',
    label: 'Price Tracker',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none"
        viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 17l4-8 4 4 4-6 4 5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
      </svg>
    ),
  },
  {
    key: 'portfolio',
    label: 'Portfolio',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none"
        viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="2" y="7" width="20" height="14" rx="2" strokeLinecap="round"
          strokeLinejoin="round" />
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="16" strokeLinecap="round" />
        <line x1="10" y1="14" x2="14" y2="14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'footprint',
    label: 'Footprint Calc',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none"
        viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 3C8 3 5 7 5 11c0 5 7 10 7 10s7-5 7-10c0-4-3-8-7-8z" />
        <circle cx="12" cy="11" r="2" strokeLinecap="round"
          strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'forecast',
    label: 'AI Forecast',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none"
        viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3
             m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374
             3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988
             -2.386l-.548-.547z" />
      </svg>
    ),
  },
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="w-60 flex-shrink-0 bg-[#0f172a] flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12
                   l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">CarbonIQ</p>
            <p className="text-slate-400 text-xs">Analytics Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <p className="px-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
          Dashboard
        </p>
        {NAV_ITEMS.map(({ key, label, icon }) => {
          const isActive = activePage === key
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                font-medium transition-all duration-150 text-left
                ${isActive
                  ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }
              `}
            >
              <span className={isActive ? 'text-emerald-400' : 'text-slate-500'}>
                {icon}
              </span>
              {label}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-5 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs text-slate-200 font-semibold flex-shrink-0">
            C
          </div>
          <div>
            <p className="text-slate-300 text-xs font-medium">Corp User</p>
            <p className="text-slate-500 text-[11px]">Analyst</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
