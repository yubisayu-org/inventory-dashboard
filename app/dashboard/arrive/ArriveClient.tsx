"use client"

import { useState } from "react"
import SearchableSelect from "@/components/SearchableSelect"
import { useSheetOptions } from "@/hooks/useSheetOptions"

type ItemLine = { id: number; item: string; qty: string }
type UpdatedRow = { rowNumber: number; customer: string; oldUnitArrive: number; unitArrive: number }
type ItemResult = { item: string; rows: UpdatedRow[]; unmatched: number }
type Result = { type: "success"; results: ItemResult[] } | { type: "error"; message: string }

const FIELD =
  "w-full border border-cream-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
const LABEL = "text-sm font-medium text-foreground mb-1.5 block"

let _nextId = 0
function newLine(): ItemLine {
  return { id: _nextId++, item: "", qty: "" }
}

export default function ArriveClient() {
  const options = useSheetOptions()
  const [event, setEvent] = useState("")
  const [lines, setLines] = useState<ItemLine[]>([newLine()])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  function updateLine(id: ItemLine["id"], field: keyof Omit<ItemLine, "id">, value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
    setResult(null)
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()])
  }

  function removeLine(id: ItemLine["id"]) {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  const canSubmit =
    Boolean(event) &&
    lines.length > 0 &&
    lines.every((l) => l.item && l.qty && Number(l.qty) > 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch("/api/sheets/arrive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          items: lines.map((l) => ({ item: l.item, qty: Number(l.qty) })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setResult({ type: "success", results: data.results })
      setLines([newLine()])
    } catch (err) {
      setResult({ type: "error", message: err instanceof Error ? err.message : "Failed" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl border border-cream-border bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-border bg-cream">
          <p className="text-xs text-gray-500">
            Select an event, add the items that arrived with their quantities, then submit to bulk-fill unit arrive in chronological order.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className={LABEL}>
              Event <span className="text-brand">*</span>
            </label>
            <select
              value={event}
              onChange={(e) => { setEvent(e.target.value); setResult(null) }}
              required
              className={FIELD}
            >
              <option value="">Select event…</option>
              {(options?.events ?? []).map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={LABEL + " mb-0"}>
                Items <span className="text-brand">*</span>
              </label>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-brand hover:underline"
              >
                + Add item
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <SearchableSelect
                      value={line.item}
                      onChange={(v) => updateLine(line.id, "item", v)}
                      options={(options?.items ?? []).map((it) => ({
                        value: it.name,
                        label: it.name,
                        meta: it.store || undefined,
                      }))}
                      placeholder="Search item…"
                    />
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={line.qty}
                    onChange={(e) => updateLine(line.id, "qty", e.target.value)}
                    placeholder="Qty"
                    className="w-20 border border-cream-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="mt-2 text-gray-300 hover:text-red-400 transition-colors"
                      aria-label="Remove"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {result?.type === "error" && (
            <p className="text-sm text-red-600">{result.message}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="w-full py-2 text-sm font-medium rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Processing…" : "Process Arrival"}
          </button>
        </form>
      </div>

      {result?.type === "success" && (
        <div className="mt-4 space-y-3">
          {result.results.map((itemResult) => (
            <div key={itemResult.item} className="rounded-xl border border-cream-border bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-cream-border bg-cream flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate">{itemResult.item}</span>
                <span className={`text-xs font-medium ml-3 shrink-0 ${itemResult.rows.length > 0 ? "text-green-600" : "text-gray-400"}`}>
                  {itemResult.rows.length === 0
                    ? "No orders updated"
                    : `${itemResult.rows.length} order${itemResult.rows.length === 1 ? "" : "s"} updated`}
                </span>
              </div>

              {itemResult.unmatched > 0 && (
                <div className="px-5 py-2.5 border-b border-cream-border bg-yellow-50 flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600 shrink-0">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span className="text-xs text-yellow-700">
                    <strong>{itemResult.unmatched}</strong> unit{itemResult.unmatched === 1 ? "" : "s"} could not be matched to any order
                  </span>
                </div>
              )}

              {itemResult.rows.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">
                  No eligible orders found.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-border text-left">
                      <th className="px-5 py-2 text-xs font-medium text-gray-500 w-8">#</th>
                      <th className="px-5 py-2 text-xs font-medium text-gray-500">Customer</th>
                      <th className="px-5 py-2 text-xs font-medium text-gray-500 text-right">Unit Arrive</th>
                      <th className="px-5 py-2 text-xs font-medium text-gray-500 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemResult.rows.map((row, i) => (
                      <tr key={row.rowNumber} className="border-b border-cream-border last:border-0">
                        <td className="px-5 py-2.5 text-xs text-gray-400">{i + 1}</td>
                        <td className="px-5 py-2.5 text-foreground">{row.customer}</td>
                        <td className="px-5 py-2.5 text-foreground text-right font-medium">{row.unitArrive}</td>
                        <td className="px-5 py-2.5 text-right">
                          {row.oldUnitArrive > 0 && (
                            <span className="text-xs text-gray-400">(was {row.oldUnitArrive})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
