"use client"

import { useEffect, useMemo, useState } from "react"
import type { ShipCustomer } from "@/lib/sheets"

type Segment = "all" | "not_arrived" | "ready" | "shipped"

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "not_arrived", label: "Belum Tiba" },
  { id: "ready", label: "Siap Dikirim" },
  { id: "shipped", label: "Sudah Dikirim" },
]

function isNotArrived(c: ShipCustomer) {
  return c.orders.every((o) => o.unitArrive === 0 && o.unitShip === 0)
}
function isShipped(c: ShipCustomer) {
  return !isNotArrived(c) && c.totalToShip === 0
}

export default function ShipClient() {
  const [data, setData] = useState<ShipCustomer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [segment, setSegment] = useState<Segment>("ready")
  const [search, setSearch] = useState("")
  const [eventFilter, setEventFilter] = useState("")

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/sheets/ship")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load")
      setData(json as ShipCustomer[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const events = useMemo(() => {
    if (!data) return []
    const set = new Set<string>()
    for (const c of data) if (c.event) set.add(c.event)
    return Array.from(set).sort()
  }, [data])

  const counts = useMemo(() => {
    if (!data) return { all: 0, not_arrived: 0, ready: 0, shipped: 0 }
    return {
      all: data.length,
      not_arrived: data.filter(isNotArrived).length,
      ready: data.filter((c) => c.totalToShip > 0).length,
      shipped: data.filter(isShipped).length,
    }
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter((c) => {
      if (segment === "not_arrived" && !isNotArrived(c)) return false
      if (segment === "ready" && c.totalToShip === 0) return false
      if (segment === "shipped" && !isShipped(c)) return false
      if (search) {
        const q = search.replace(/^@/, "").toLowerCase()
        if (!c.customer.replace(/^@/, "").toLowerCase().includes(q)) return false
      }
      if (eventFilter && c.event !== eventFilter) return false
      return true
    })
  }, [data, segment, search, eventFilter])

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {/* Segment control */}
      <div className="flex items-center gap-1 rounded-xl border border-cream-border bg-white p-1">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSegment(s.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              segment === s.id
                ? "bg-brand text-white"
                : "text-gray-500 hover:text-foreground"
            }`}
          >
            {s.label}
            {data && (
              <span
                className={`text-xs rounded-full px-1.5 py-0.5 tabular-nums ${
                  segment === s.id
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {counts[s.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + event filter + refresh */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari customer…"
          className="flex-1 min-w-0 border border-cream-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
        />
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="border border-cream-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors text-gray-600"
        >
          <option value="">Semua Event</option>
          {events.map((ev) => (
            <option key={ev} value={ev}>{ev}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 text-xs text-gray-500 hover:text-brand disabled:opacity-50 transition-colors px-3 py-2 rounded-lg border border-cream-border hover:border-brand"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-cream-border bg-white p-12 text-center text-gray-400 text-sm">
          Tidak ada pesanan.
        </div>
      )}

      {/* Results */}
      {!loading && !error && filtered.length > 0 && (
        <>
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-foreground">{filtered.length}</span> customer
          </p>
          {filtered.map((c) => (
            <CustomerCard key={`${c.customer}|${c.event}`} customer={c} />
          ))}
        </>
      )}
    </div>
  )
}

function CustomerCard({ customer: c }: { customer: ShipCustomer }) {
  const [expanded, setExpanded] = useState(false)
  const { customerDetail } = c

  return (
    <div className="rounded-xl border border-cream-border bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-cream border-b border-cream-border flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{c.customer.toUpperCase()}</span>
            <span className="text-sm text-gray-500 font-medium">{c.event}</span>
            {isNotArrived(c) ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                Belum Tiba
              </span>
            ) : c.totalToShip > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand">
                Siap Dikirim
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                Sudah Dikirim
              </span>
            )}
            {customerDetail?.ekspedisi && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {customerDetail.ekspedisi}
              </span>
            )}
          </div>
          {customerDetail?.whatsapp && (
            <div className="text-xs text-gray-500">{customerDetail.whatsapp}</div>
          )}
        </div>
        {c.totalToShip > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-lg font-bold text-foreground">{c.totalToShip}</div>
            <div className="text-xs text-gray-500">to ship</div>
          </div>
        )}
      </div>

      {/* Orders table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-cream-border">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium text-right">Arrive</th>
              <th className="px-4 py-2 font-medium text-right">Shipped</th>
              <th className="px-4 py-2 font-medium text-right">To Ship</th>
            </tr>
          </thead>
          <tbody>
            {c.orders.map((o) => (
              <tr key={o.rowNumber} className="border-b border-cream-border/60">
                <td className="px-4 py-2">{o.items}</td>
                <td className="px-4 py-2 text-right">{o.unitArrive}</td>
                <td className="px-4 py-2 text-right">{o.unitShip}</td>
                <td className={`px-4 py-2 text-right font-semibold ${o.toShip > 0 ? "text-brand" : "text-gray-400"}`}>
                  {o.toShip}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Collapsible address */}
      {customerDetail?.dataDiri && (
        <div className="border-t border-cream-border">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs text-gray-500 hover:text-brand transition-colors"
          >
            <span className="font-medium">Alamat pengiriman</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {expanded && (
            <div className="px-5 pb-4">
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">
                {customerDetail.dataDiri}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
