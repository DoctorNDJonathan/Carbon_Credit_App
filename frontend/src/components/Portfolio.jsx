/**
 * Portfolio
 * ---------
 * Fetches the company's carbon credit transactions from GET /api/portfolio and
 * renders them as a sortable ledger table.
 *
 * State:
 *   transactions – raw array from the API (or seed data on backend error)
 *   sortKey      – which column is currently sorted
 *   sortDir      – 'asc' | 'desc'
 *   loading / error – standard async flags
 *
 * Summary metrics (total credits held, weighted avg cost, total P&L) are
 * derived from the transaction list rather than fetched separately, so they
 * always stay in sync with what's displayed.
 *
 * The P&L cell is coloured emerald (profit) or red (loss) based on sign.
 */

import { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:8000'

const SEED_TRANSACTIONS = [
  { id: 1,  date: '2024-01-15', type: 'BUY',  credits: 500,  price: 24.50, total: 12250,  pnl: null    },
  { id: 2,  date: '2024-02-03', type: 'BUY',  credits: 300,  price: 26.10, total: 7830,   pnl: null    },
  { id: 3,  date: '2024-02-28', type: 'SELL', credits: 200,  price: 27.80, total: 5560,   pnl: 660     },
  { id: 4,  date: '2024-03-12', type: 'BUY',  credits: 1000, price: 25.90, total: 25900,  pnl: null    },
  { id: 5,  date: '2024-04-05', type: 'SELL', credits: 400,  price: 29.30, total: 11720,  pnl: 1720    },
  { id: 6,  date: '2024-05-20', type: 'BUY',  credits: 750,  price: 28.75, total: 21562,  pnl: null    },
  { id: 7,  date: '2024-06-14', type: 'SELL', credits: 300,  price: 31.00, total: 9300,   pnl: 1875    },
  { id: 8,  date: '2024-07-01', type: 'BUY',  credits: 600,  price: 30.20, total: 18120,  pnl: null    },
  { id: 9,  date: '2024-08-19', type: 'SELL', credits: 500,  price: 33.50, total: 16750,  pnl: 3300    },
  { id: 10, date: '2024-09-30', type: 'BUY',  credits: 400,  price: 32.80, total: 13120,  pnl: null    },
]

function SortIcon({ active, dir }) {
  if (!active) return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-300" fill="none"
      viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  )
  return dir === 'asc'
    ? <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-500"
        fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    : <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-500"
        fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
}

export default function Portfolio() {
  const [transactions, setTransactions] = useState([])
  const [sortKey, setSortKey]           = useState('date')
  const [sortDir, setSortDir]           = useState('desc')
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/api/portfolio`)
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => setTransactions(data))
      .catch(() => {
        setTransactions(SEED_TRANSACTIONS)
        setError('Backend unreachable — showing sample portfolio')
      })
      .finally(() => setLoading(false))
  }, [])

  // Sort
  const sorted = [...transactions].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ?  1 : -1
    return 0
  })

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Summary metrics
  const creditsHeld = transactions.reduce((acc, t) =>
    t.type === 'BUY' ? acc + t.credits : acc - t.credits, 0)

  const totalSpend = transactions
    .filter(t => t.type === 'BUY')
    .reduce((acc, t) => acc + t.total, 0)

  const totalRevenue = transactions
    .filter(t => t.type === 'SELL')
    .reduce((acc, t) => acc + t.total, 0)

  const realizedPnl = transactions
    .filter(t => t.pnl != null)
    .reduce((acc, t) => acc + t.pnl, 0)

  const COLS = [
    { key: 'date',    label: 'Date'    },
    { key: 'type',    label: 'Type'    },
    { key: 'credits', label: 'Credits' },
    { key: 'price',   label: 'Price / tCO₂' },
    { key: 'total',   label: 'Total Value' },
    { key: 'pnl',     label: 'Realized P&L' },
  ]

  return (
    <div className="space-y-6">
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Credits Held</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{creditsHeld.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">tCO₂ equivalent</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Total Spend</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">${totalSpend.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">All BUY orders</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">${totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">All SELL orders</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Realized P&L</p>
          <p className={`text-2xl font-bold mt-1 ${realizedPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Closed positions</p>
        </div>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Transaction History</h2>
          <span className="text-xs text-gray-400">{transactions.length} records</span>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            Loading transactions…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                    >
                      <div className="flex items-center gap-1.5">
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-6 py-3.5 text-gray-600">{tx.date}</td>

                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold
                        ${tx.type === 'BUY'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                        }`}>
                        {tx.type === 'BUY' ? '▲' : '▼'} {tx.type}
                      </span>
                    </td>

                    <td className="px-6 py-3.5 font-medium text-gray-800">
                      {tx.credits.toLocaleString()}
                    </td>

                    <td className="px-6 py-3.5 text-gray-600">
                      ${tx.price.toFixed(2)}
                    </td>

                    <td className="px-6 py-3.5 font-medium text-gray-800">
                      ${tx.total.toLocaleString()}
                    </td>

                    <td className="px-6 py-3.5">
                      {tx.pnl != null ? (
                        <span className={`font-semibold ${tx.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {tx.pnl >= 0 ? '+' : ''}${tx.pnl.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">— open</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
