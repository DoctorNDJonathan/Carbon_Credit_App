/**
 * FootprintCalculator
 * -------------------
 * A two-step form that lets a corporation enter its activity data, then
 * displays a breakdown of its CO₂ footprint and a credit-offset recommendation.
 *
 * Emission factors used (industry-standard approximations):
 *   Electricity  → 0.000233 tCO₂ / kWh  (avg grid emission factor)
 *   Business travel → 0.000255 tCO₂ / km  (economy flight seat-km)
 *   Manufacturing → 2.5 tCO₂ / tonne output (mixed industrial avg)
 *
 * The form POSTs to POST /api/calculate-footprint and falls back to a
 * local computation when the backend is unavailable, so the calculator
 * always works even in offline / demo mode.
 *
 * State:
 *   inputs   – the three form fields
 *   result   – { electricity_co2, travel_co2, manufacturing_co2, total_co2,
 *                credits_needed, estimated_cost }
 *   loading  – spinner while awaiting the API
 *   error    – non-blocking inline notice
 */

import { useState } from 'react'

const API_BASE = 'http://localhost:8000'

// Emission factors
const EF_ELECTRICITY   = 0.000233  // tCO₂ per kWh
const EF_TRAVEL        = 0.000255  // tCO₂ per km
const EF_MANUFACTURING = 2.5       // tCO₂ per tonne output
const CREDIT_PRICE     = 30.50     // estimated current market price

function calcLocally({ electricity_kwh, travel_km, manufacturing_tonnes }) {
  const electricity_co2    = electricity_kwh    * EF_ELECTRICITY
  const travel_co2         = travel_km          * EF_TRAVEL
  const manufacturing_co2  = manufacturing_tonnes * EF_MANUFACTURING
  const total_co2          = electricity_co2 + travel_co2 + manufacturing_co2
  const credits_needed     = Math.ceil(total_co2)
  const estimated_cost     = credits_needed * CREDIT_PRICE
  return {
    electricity_co2:   parseFloat(electricity_co2.toFixed(2)),
    travel_co2:        parseFloat(travel_co2.toFixed(2)),
    manufacturing_co2: parseFloat(manufacturing_co2.toFixed(2)),
    total_co2:         parseFloat(total_co2.toFixed(2)),
    credits_needed,
    estimated_cost:    parseFloat(estimated_cost.toFixed(2)),
  }
}

function BreakdownBar({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{value.toFixed(2)} tCO₂</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <p className="text-right text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}%</p>
    </div>
  )
}

export default function FootprintCalculator() {
  const [inputs, setInputs] = useState({
    electricity_kwh:       '',
    travel_km:             '',
    manufacturing_tonnes:  '',
  })
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  function handleChange(e) {
    const { name, value } = e.target
    setInputs(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    const payload = {
      electricity_kwh:      parseFloat(inputs.electricity_kwh)      || 0,
      travel_km:            parseFloat(inputs.travel_km)            || 0,
      manufacturing_tonnes: parseFloat(inputs.manufacturing_tonnes) || 0,
    }

    try {
      const res = await fetch(`${API_BASE}/api/calculate-footprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setResult(await res.json())
    } catch {
      // Local fallback
      setResult(calcLocally(payload))
      setError('Backend unreachable — result calculated locally')
    } finally {
      setLoading(false)
    }
  }

  const isValid = Object.values(inputs).some(v => parseFloat(v) > 0)

  return (
    <div className="max-w-4xl space-y-6">
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

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input form */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Activity Data</h2>
          <p className="text-xs text-gray-400 mb-5">
            Enter your company's annual activity data to calculate total CO₂ footprint.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Electricity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Electricity Consumption
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="electricity_kwh"
                  value={inputs.electricity_kwh}
                  onChange={handleChange}
                  placeholder="e.g. 500000"
                  min="0"
                  className="input-field pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                  kWh
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Total kWh consumed across all facilities
              </p>
            </div>

            {/* Business travel */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Business Travel
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="travel_km"
                  value={inputs.travel_km}
                  onChange={handleChange}
                  placeholder="e.g. 200000"
                  min="0"
                  className="input-field pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                  km
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Aggregate distance flown / driven by employees
              </p>
            </div>

            {/* Manufacturing output */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Manufacturing Output
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="manufacturing_tonnes"
                  value={inputs.manufacturing_tonnes}
                  onChange={handleChange}
                  placeholder="e.g. 1000"
                  min="0"
                  className="input-field pr-20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                  tonnes
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Total manufactured goods output in metric tonnes
              </p>
            </div>

            <button
              type="submit"
              disabled={!isValid || loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg"
                    fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Calculating…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Calculate Footprint
                </>
              )}
            </button>
          </form>

          {/* Emission factor legend */}
          <div className="mt-6 pt-5 border-t border-gray-100 space-y-1.5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              Emission Factors Used
            </p>
            {[
              ['Electricity', '0.000233 tCO₂ / kWh'],
              ['Business Travel', '0.000255 tCO₂ / km'],
              ['Manufacturing', '2.5 tCO₂ / tonne'],
            ].map(([label, factor]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-600 font-mono">{factor}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Results panel */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Total */}
              <div className="card bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
                <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">
                  Total CO₂ Footprint
                </p>
                <p className="text-4xl font-bold text-emerald-700 mt-1">
                  {result.total_co2.toLocaleString()}
                  <span className="text-xl font-medium ml-1">tCO₂</span>
                </p>
                <p className="text-xs text-emerald-600/70 mt-1">Metric tonnes of CO₂ equivalent</p>
              </div>

              {/* Breakdown bars */}
              <div className="card space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">Emissions Breakdown</h3>
                <BreakdownBar
                  label="Electricity"
                  value={result.electricity_co2}
                  total={result.total_co2}
                  color="bg-sky-400"
                />
                <BreakdownBar
                  label="Business Travel"
                  value={result.travel_co2}
                  total={result.total_co2}
                  color="bg-violet-400"
                />
                <BreakdownBar
                  label="Manufacturing"
                  value={result.manufacturing_co2}
                  total={result.total_co2}
                  color="bg-orange-400"
                />
              </div>

              {/* Offset recommendation */}
              <div className="card border-2 border-emerald-200">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-600"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Offset Recommendation</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      To fully offset your footprint you need:
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-xs text-gray-400">Credits Needed</p>
                    <p className="text-xl font-bold text-gray-800 mt-0.5">
                      {result.credits_needed.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">tCO₂ credits</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-xs text-gray-400">Estimated Cost</p>
                    <p className="text-xl font-bold text-gray-800 mt-0.5">
                      ${result.estimated_cost.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">at ${CREDIT_PRICE} / credit</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="card h-full min-h-[300px] flex flex-col items-center justify-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-gray-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Results will appear here</p>
                <p className="text-xs text-gray-400 mt-1">
                  Fill in activity data and click<br />Calculate Footprint
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
