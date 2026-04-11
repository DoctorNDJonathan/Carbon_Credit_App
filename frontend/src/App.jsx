import { useState } from 'react'
import Sidebar from './components/Sidebar'
import PriceTracker from './components/PriceTracker'
import Portfolio from './components/Portfolio'
import FootprintCalculator from './components/FootprintCalculator'
import AIForecast from './components/AIForecast'

const PAGES = {
  price: PriceTracker,
  portfolio: Portfolio,
  footprint: FootprintCalculator,
  forecast: AIForecast,
}

export default function App() {
  const [activePage, setActivePage] = useState('price')
  const ActivePage = PAGES[activePage]

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">
              Carbon Credit Analytics
            </p>
            <h1 className="text-xl font-semibold text-gray-800 mt-0.5">
              {activePage === 'price'     && 'Price Tracker'}
              {activePage === 'portfolio' && 'Portfolio'}
              {activePage === 'footprint' && 'Footprint Calculator'}
              {activePage === 'forecast'  && 'AI Forecast'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live data" />
          </div>
        </header>

        <div className="px-8 py-6">
          <ActivePage />
        </div>
      </main>
    </div>
  )
}
