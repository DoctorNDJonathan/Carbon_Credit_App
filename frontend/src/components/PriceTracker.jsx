/**
 * PriceTracker
 * ------------
 * Fetches historical carbon-credit price data from GET /api/prices?range=<days>
 * and renders it as a responsive Recharts LineChart.
 *
 * State:
 *   priceData   – array of { date, price } objects from the API
 *   range       – number of days to look back (7 | 30 | 90 | 365)
 *   loading     – shows a skeleton while fetching
 *   error       – displays an inline error card on failure
 *
 * The custom tooltip and the stat summary cards are purely presentational.
 * Recharts' <ResponsiveContainer> handles the chart's resize behaviour.
 */

import { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'

const API_BASE = 'http://localhost:8000'

const RANGE_OPTIONS = [
  { label: '7D',  days: 7   },
  { label: '1M',  days: 30  },
  { label: '3M',  days: 90  },
  { label: '1Y',  days: 365 },
]

// Fallback seed data so the UI is never blank during dev
function generateFallbackData(days) {
  const data = []
  const now = new Date()
  let price = 28 + Math.random() * 10
  for (let i = days; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    price += (Math.random() - 0.47) * 1.2
    price = Math.max(15, Math.min(60, price))
    data.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: parseFloat(price.toFixed(2)),
    })
  }
  return data
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0f172a] text-white px-3 py-2.5 rounded-lg shadow-xl text-sm">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="font-semibold text-emerald-400">
        ${payload[0].value.toFixed(2)} <span className="text-slate-400 font-normal">/ tCO₂</span>
      </p>
    </div>
  )
}

export default function PriceTracker() {
  const [priceData, setPriceData] = useState([])
  const [range, setRange]         = useState(30)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`${API_BASE}/api/prices?range=${range}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (!cancelled) setPriceData(data)
      })
      .catch(() => {
        if (!cancelled) {
          // Fall back to generated data so the chart still renders
          setPriceData(generateFallbackData(range))
          setError('Backend unreachable — showing simulated data')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [range])

  // Derived stats
  const prices   = priceData.map(d => d.price)
  const latest   = prices.at(-1) ?? 0
  const earliest = prices[0] ?? 0
  const change   = latest - earliest
  const changePct = earliest ? ((change / earliest) * 100).toFixed(2) : 0
  const high     = prices.length ? Math.max(...prices) : 0
  const low      = prices.length ? Math.min(...prices) : 0
  const avg      = prices.length
    ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
    : 0

  return (
    <div className="space-y-6">
      {/* Error notice */}
      {error && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-700 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none"
            viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Stat summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Current Price', value: `$${latest.toFixed(2)}`, sub: '/ tCO₂' },
          {
            label: 'Period Change',
            value: `${change >= 0 ? '+' : ''}$${change.toFixed(2)}`,
            sub: `${changePct}%`,
            positive: change >= 0,
          },
          { label: 'Period High',  value: `$${high.toFixed(2)}`, sub: '/ tCO₂' },
          { label: 'Period Low',   value: `$${low.toFixed(2)}`,  sub: '/ tCO₂' },
        ].map(stat => (
          <div key={stat.label} className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${
              stat.positive === true  ? 'text-emerald-500' :
              stat.positive === false ? 'text-red-500'     :
              'text-gray-800'
            }`}>
              {stat.value}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Chart card */}
      <div className="card">
        {/* Card header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Carbon Credit Price</h2>
            <p className="text-xs text-gray-400 mt-0.5">EU ETS Spot · EUR / tonne CO₂</p>
          </div>

          {/* Range selector */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => setRange(opt.days)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150
                  ${range === opt.days
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <svg className="w-6 h-6 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none"
                viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                  strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm">Loading price data…</span>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={priceData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `$${v}`}
                width={48}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={avg} stroke="#6366f1" strokeDasharray="4 4"
                label={{ value: `Avg $${avg}`, fill: '#6366f1', fontSize: 11, position: 'insideTopRight' }} />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: '#10b981', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
