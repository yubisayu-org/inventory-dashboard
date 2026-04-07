"use client"

import { useEffect, useState } from "react"
import type { SheetOptions } from "@/lib/sheets"
import SearchableSelect from "@/components/SearchableSelect"

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; orderId: string }
  | { status: "error"; message: string }

const FIELD_CLASS =
  "w-full border border-cream-border rounded-lg px-3 py-2 text-sm text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"

const READONLY_CLASS =
  "w-full border border-cream-border rounded-lg px-3 py-2 text-sm text-gray-500 bg-cream cursor-not-allowed"

const LABEL_CLASS = "block text-xs font-medium text-gray-500 mb-1"

export default function OrderForm() {
  const [options, setOptions] = useState<SheetOptions | null>(null)
  const [loadError, setLoadError] = useState("")
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" })

  const loading = !options && !loadError

  const [event, setEvent] = useState("")
  const [customer, setCustomer] = useState("")
  const [selectedItem, setSelectedItem] = useState("")
  const [unit, setUnit] = useState("")
  const [note, setNote] = useState("")

  const orderId = event && customer ? `${event} ${customer}` : ""
  const selectedItemData = options?.items?.find((i) => i.name === selectedItem)
  // Store and price are derived from the selected item — not independent fields
  const store = selectedItemData?.store ?? ""
  const estimatedPrice = selectedItemData
    ? (selectedItemData.price * Number(unit || 0)).toLocaleString("id-ID")
    : "-"

  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/sheets/options", { signal: controller.signal })
      .then((r) => r.json())
      .then((data: SheetOptions & { error?: string }) => {
        if (data.error) {
          setLoadError(data.error)
        } else if (!data.events || !data.items || !data.customers) {
          setLoadError("Invalid data from sheet. Please refresh the page.")
        } else {
          setOptions(data)
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setLoadError("Failed to load form options. Please refresh the page.")
        }
      })

    return () => controller.abort()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmit({ status: "submitting" })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const res = await fetch("/api/sheets/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, customer, items: selectedItem, unit, note }),
        signal: controller.signal,
      })
      const data = await res.json()

      if (!res.ok) {
        setSubmit({ status: "error", message: data.error ?? "Something went wrong" })
      } else {
        setSubmit({ status: "success", orderId: data.orderId })
        setEvent("")
        setCustomer("")
        setSelectedItem("")
        setUnit("")
        setNote("")
      }
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError"
        ? "Request timed out, please try again"
        : "Network error, please try again"
      setSubmit({ status: "error", message })
    } finally {
      clearTimeout(timeout)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Loading form options...
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-4 text-sm text-red-700">
        <p className="font-medium mb-1">Failed to load form</p>
        <p>{loadError}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {submit.status === "success" && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Order <span className="font-medium">{submit.orderId}</span> successfully added to the sheet.
        </div>
      )}
      {submit.status === "error" && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {submit.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={LABEL_CLASS}>Event <span className="text-brand">*</span></label>
          <select required value={event} onChange={(e) => setEvent(e.target.value)} className={FIELD_CLASS}>
            <option value="">Select event...</option>
            {options?.events?.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>Customer <span className="text-brand">*</span></label>
          <SearchableSelect
            value={customer}
            onChange={setCustomer}
            options={(options?.customers ?? []).map((c) => ({ value: c, label: c }))}
            placeholder="Select customer..."
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Order ID <span className="text-gray-400">(auto-generated)</span></label>
          <input readOnly value={orderId} className={READONLY_CLASS} />
        </div>

        <div>
          <label className={LABEL_CLASS}>Items <span className="text-brand">*</span></label>
          <SearchableSelect
            value={selectedItem}
            onChange={setSelectedItem}
            options={(options?.items ?? []).map((item) => ({
              value: item.name,
              label: item.name,
              meta: item.store || undefined,
            }))}
            placeholder="Select item..."
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Store <span className="text-gray-400">(from item)</span></label>
          <input readOnly value={store || "-"} className={READONLY_CLASS} />
        </div>

        <div>
          <label className={LABEL_CLASS}>Unit <span className="text-brand">*</span></label>
          <input
            required type="number" min="1" placeholder="Qty"
            value={unit} onChange={(e) => setUnit(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Price Preview <span className="text-gray-400">(calculated)</span></label>
          <input readOnly value={selectedItemData ? `Rp ${estimatedPrice}` : "-"} className={READONLY_CLASS} />
        </div>

        <div>
          <label className={LABEL_CLASS}>Note</label>
          <input
            type="text" placeholder="Optional note"
            value={note} onChange={(e) => setNote(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={submit.status === "submitting"}
          className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          {submit.status === "submitting" ? "Saving..." : "Submit Order"}
        </button>
      </div>
    </form>
  )
}
