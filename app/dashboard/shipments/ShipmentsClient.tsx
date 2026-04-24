"use client"

import { useEffect, useRef, useState } from "react"
import type { ShippingRecord } from "@/lib/sheets"

export default function ShipmentsClient() {
  const [data, setData] = useState<ShippingRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/sheets/shipments")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load")
      setData((json as ShippingRecord[]).reverse())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-brand disabled:opacity-50 transition-colors px-3 py-1.5 rounded-lg border border-cream-border hover:border-brand"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {loading && (
        <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!loading && !error && data?.length === 0 && (
        <div className="rounded-xl border border-cream-border bg-white p-12 text-center text-gray-400 text-sm">
          No shipments yet.
        </div>
      )}
      {!loading && !error && data && data.length > 0 && (
        <div className="rounded-xl border border-cream-border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-cream-border bg-cream">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium text-right">Berat</th>
                  <th className="px-4 py-3 font-medium text-right">Ongkir</th>
                  <th className="px-4 py-3 font-medium">Terakhir</th>
                  <th className="px-4 py-3 font-medium">Resi</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {data.map((record) => (
                  <ShipmentRow
                    key={record.rowNumber}
                    record={record}
                    onUpdated={(trackingNumber) =>
                      setData((prev) =>
                        prev?.map((r) =>
                          r.rowNumber === record.rowNumber ? { ...r, trackingNumber } : r
                        ) ?? null
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ShipmentRow({
  record,
  onUpdated,
}: {
  record: ShippingRecord
  onUpdated: (trackingNumber: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(record.trackingNumber)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function handleSave() {
    if (value === record.trackingNumber) { setEditing(false); return }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/sheets/shipments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowNumber: record.rowNumber, trackingNumber: value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed")
      onUpdated(value)
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave()
    if (e.key === "Escape") { setValue(record.trackingNumber); setEditing(false) }
  }

  const fmt = (n: number) => n.toLocaleString("id-ID")

  return (
    <tr className="border-b border-cream-border/60 hover:bg-cream/30 transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-gray-500">{record.shippingId}</td>
      <td className="px-4 py-3 whitespace-nowrap">{record.event}</td>
      <td className="px-4 py-3 whitespace-nowrap">{record.customer}</td>
      <td className="px-4 py-3">
        <pre className="whitespace-pre-wrap font-sans text-xs text-gray-600 leading-relaxed max-w-[200px]">
          {record.invoicing}
        </pre>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">{record.weightEstimation} kg</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">Rp {fmt(record.ongkirTotal)}</td>
      <td className="px-4 py-3">
        {record.isLastShipment ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            Ya
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Tidak
          </span>
        )}
      </td>
      <td className="px-4 py-3 min-w-[180px]">
        {editing ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={saving}
                placeholder="Masukkan nomor resi"
                className="flex-1 min-w-0 border border-cream-border rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="shrink-0 px-2 py-1 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "…" : "Simpan"}
              </button>
              <button
                type="button"
                onClick={() => { setValue(record.trackingNumber); setEditing(false) }}
                disabled={saving}
                className="shrink-0 px-2 py-1 rounded-md border border-cream-border text-gray-500 text-xs hover:border-brand hover:text-brand disabled:opacity-50 transition-colors"
              >
                Batal
              </button>
            </div>
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group flex items-center gap-1.5 text-left"
          >
            <span className={`text-xs ${record.trackingNumber ? "text-foreground font-mono" : "text-gray-400 italic"}`}>
              {record.trackingNumber || "Belum diisi"}
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400 group-hover:text-brand transition-colors shrink-0"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{record.createdAt}</td>
    </tr>
  )
}
