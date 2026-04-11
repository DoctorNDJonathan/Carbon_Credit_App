/**
 * AIForecast
 * ----------
 * Single-button page that POSTs to POST /api/forecast and renders Claude's
 * market prediction in a structured result card.
 *
 * Expected API response shape:
 * {
 *   prediction:    string   (one-paragraph narrative)
 *   recommendation: string  (BUY | SELL | HOLD)
 *   confidence:    number   (0-100)
 *   price_target:  number   (USD per tCO₂)
 *   key_factors:   string[] (bullet-point drivers)
 *   generated_at:  string   (ISO timestamp)
 * }
 *
 * State:
 *   forecast  – the parsed API response
 *   loading   – shows animated "thinking" state
 *   error     – inline error card
 *
 * The recommendation badge colour (emerald / amber / red) maps to
 * BUY / HOLD / SELL signals respectively.
 */

import { useState } from 'react'

const API_BASE = 'http://localhost:8000'

const REC_STYLES = {
  BUY:  'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300',
  HOLD: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300',
  SELL: 'bg-red-100 text-red-600 ring-1 ring-red-300',
}

const REC_ICONS = {
  BUY:  '↑',
  HOLD: '→',
  SELL: '↓',
}

// Confidence ring drawn as an SVG arc
function ConfidenceRing({ value }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const dash = (value / 100) * circ
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#f3f4f6" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold text-gray-800">{value}%</span>
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 text-gray-500 text-sm">
      <svg className="w-4 h-4 animate-spin text-emerald-500" xmlns="http://www.w3.org/2000/svg"
        fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
          strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span>Claude is analysing market signals</span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </div>
  )
}

export default function AIForecast() {
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  async function fetchForecast() {
    setLoading(true)
    setError(null)
    setForecast(null)

    try {
      const res = await fetch(`${API_BASE}/api/forecast`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setForecast(await res.json())
    } catch (err) {
      setError(`Failed to fetch forecast: ${err.message}. Ensure the FastAPI backend is running on port 8000.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Intro card */}
      <div className="card bg-gradient-to-r from-[#0f172a] to-[#1e3a5f] text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3
                   m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374
                   3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988
                   -2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">Claude AI Market Forecast</h2>
            <p className="text-slate-300 text-sm mt-1 leading-relaxed">
              Powered by Claude via the Anthropic API. Analyses EU ETS regulatory
              signals, recent price momentum, and macro climate-policy factors to
              generate a short-term market outlook and trading recommendation.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={fetchForecast}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50
                       disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium
                       text-sm transition-colors duration-150"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg"
                  fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating forecast…
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none"
                  viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate AI Forecast
              </>
            )}
          </button>
          {forecast && (
            <span className="text-slate-400 text-xs">
              Last updated: {new Date(forecast.generated_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="card">
          <ThinkingDots />
          <div className="mt-4 space-y-2.5">
            {[80, 60, 90, 50].map((w, i) => (
              <div key={i} className="h-3 rounded-full bg-gray-100 animate-pulse"
                style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="card border border-red-100 bg-red-50">
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-700">Forecast unavailable</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Result card */}
      {forecast && !loading && (
        <div className="space-y-4">
          {/* Recommendation + confidence */}
          <div className="card flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">
                Recommendation
              </p>
              <span className={`inline-flex items-center gap-2 text-lg font-bold px-4 py-1.5 rounded-full ${REC_STYLES[forecast.recommendation] ?? REC_STYLES.HOLD}`}>
                <span>{REC_ICONS[forecast.recommendation]}</span>
                {forecast.recommendation}
              </span>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">
                Confidence
              </p>
              <ConfidenceRing value={forecast.confidence} />
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">
                Price Target
              </p>
              <p className="text-3xl font-bold text-gray-800">
                ${forecast.price_target}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">per tCO₂ (30-day)</p>
            </div>
          </div>

          {/* Narrative */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-emerald-600"
                  fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Market Analysis</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{forecast.prediction}</p>
          </div>

          {/* Key factors */}
          {forecast.key_factors?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Key Drivers</h3>
              <ul className="space-y-2">
                {forecast.key_factors.map((factor, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-gray-400 px-1">
            This forecast is generated by an AI model for informational purposes only and
            does not constitute financial advice. Past performance is not indicative of
            future results.
          </p>
        </div>
      )}
    </div>
  )
}
