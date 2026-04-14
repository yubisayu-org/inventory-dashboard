"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import type { SheetOptions } from "@/lib/sheets"
import SearchableSelect from "@/components/SearchableSelect"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormState = {
  event: string
  customer: string
  item: string
  unit: string
  note: string
}

const EMPTY_FORM: FormState = { event: "", customer: "", item: "", unit: "", note: "" }

type DraftRow = {
  _key: number
  event: string
  customer: string
  items: string
  unit: number
  note: string
}

type DraftState = {
  rows: DraftRow[]
  editingIndex: number | null
  _nextKey: number
}

const INITIAL_DRAFT: DraftState = { rows: [], editingIndex: null, _nextKey: 0 }

type DraftAction =
  | { type: "ADD"; row: Omit<DraftRow, "_key"> }
  | { type: "DELETE"; index: number }
  | { type: "UPDATE"; index: number; row: Omit<DraftRow, "_key"> }
  | { type: "EDIT_START"; index: number }
  | { type: "EDIT_CANCEL" }
  | { type: "CLEAR" }

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "ADD":
      return {
        ...state,
        rows: [...state.rows, { ...action.row, _key: state._nextKey }],
        _nextKey: state._nextKey + 1,
      }
    case "DELETE": {
      const rows = state.rows.filter((_, i) => i !== action.index)
      const editingIndex =
        state.editingIndex === action.index
          ? null
          : state.editingIndex !== null && action.index < state.editingIndex
            ? state.editingIndex - 1
            : state.editingIndex
      return { ...state, rows, editingIndex }
    }
    case "UPDATE":
      return {
        ...state,
        rows: state.rows.map((r, i) =>
          i === action.index ? { ...action.row, _key: r._key } : r,
        ),
        editingIndex: null,
      }
    case "EDIT_START":
      return { ...state, editingIndex: action.index }
    case "EDIT_CANCEL":
      return { ...state, editingIndex: null }
    case "CLEAR":
      return { ...state, rows: [], editingIndex: null }
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const FIELD_CLASS =
  "w-full border border-cream-border rounded-lg px-3 py-2 text-sm text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"

const READONLY_CLASS =
  "w-full border border-cream-border rounded-lg px-3 py-2 text-sm text-gray-500 bg-cream cursor-not-allowed"

const LABEL_CLASS = "block text-xs font-medium text-gray-500 mb-1"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderForm() {
  const [draft, dispatch] = useReducer(draftReducer, INITIAL_DRAFT)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const submitIntentRef = useRef<"direct" | "add">("add")
  const [options, setOptions] = useState<{ data: SheetOptions | null; error: string }>({
    data: null,
    error: "",
  })
  const [submitState, setSubmitState] = useState<
    | { status: "idle" }
    | { status: "submitting" }
    | { status: "success"; count: number; source: "direct" | "batch" }
    | { status: "error"; message: string; source: "direct" | "batch" }
  >({ status: "idle" })

  const loading = !options.data && !options.error
  const isEditing = draft.editingIndex !== null

  // Derived display values
  const selectedItemData = options.data?.items.find((i) => i.name === form.item)
  const store = selectedItemData?.store ?? ""
  const estimatedPrice = selectedItemData
    ? (selectedItemData.price * Number(form.unit || 0)).toLocaleString("id-ID")
    : "-"
  const orderId = form.event && form.customer ? `${form.event} ${form.customer}` : ""

  // Load dropdown options
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/sheets/options", { signal: controller.signal })
      .then((r) => r.json())
      .then((data: SheetOptions & { error?: string }) => {
        if (data.error) {
          setOptions({ data: null, error: data.error })
        } else if (!data.events || !data.items || !data.customers) {
          setOptions({ data: null, error: "Invalid data from sheet. Please refresh the page." })
        } else {
          setOptions({ data, error: "" })
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setOptions({ data: null, error: "Failed to load form options. Please refresh the page." })
        }
      })
    return () => controller.abort()
  }, [])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function buildRow(): Omit<DraftRow, "_key"> | null {
    if (!form.event || !form.customer || !form.item || !form.unit) return null
    return {
      event: form.event,
      customer: form.customer,
      items: form.item,
      unit: Number(form.unit),
      note: form.note,
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEditing) {
      if (draft.editingIndex === null) return
      const row = buildRow()
      if (!row) return
      dispatch({ type: "UPDATE", index: draft.editingIndex, row })
      setForm(EMPTY_FORM)
    } else if (submitIntentRef.current === "direct") {
      void handleDirectSubmit()
    } else {
      const row = buildRow()
      if (!row) return
      dispatch({ type: "ADD", row })
      setForm(EMPTY_FORM)
    }
  }

  function handleStartEdit(index: number) {
    const row = draft.rows[index]
    setForm({
      event: row.event,
      customer: row.customer,
      item: row.items,
      unit: String(row.unit),
      note: row.note,
    })
    dispatch({ type: "EDIT_START", index })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function handleCancelEdit() {
    dispatch({ type: "EDIT_CANCEL" })
    setForm(EMPTY_FORM)
  }

  async function handleDirectSubmit() {
    const row = buildRow()
    if (!row) return
    setSubmitState({ status: "submitting" })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const res = await fetch("/api/sheets/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [row] }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitState({ status: "error", message: data.error ?? "Something went wrong", source: "direct" })
      } else {
        setForm(EMPTY_FORM)
        setSubmitState({ status: "success", count: 1, source: "direct" })
      }
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Request timed out, please try again"
          : "Network error, please try again"
      setSubmitState({ status: "error", message, source: "direct" })
    } finally {
      clearTimeout(timeout)
    }
  }

  async function handleSubmitAll() {
    if (draft.rows.length === 0) return
    setSubmitState({ status: "submitting" })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const res = await fetch("/api/sheets/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: draft.rows.map(({ _key: _k, ...r }) => r),
        }),
        signal: controller.signal,
      })
      const data = await res.json()

      if (!res.ok) {
        setSubmitState({ status: "error", message: data.error ?? "Something went wrong", source: "batch" })
      } else {
        dispatch({ type: "CLEAR" })
        setSubmitState({ status: "success", count: data.count, source: "batch" })
      }
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Request timed out, please try again"
          : "Network error, please try again"
      setSubmitState({ status: "error", message, source: "batch" })
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

  if (options.error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-4 text-sm text-red-700">
        <p className="font-medium mb-1">Failed to load form</p>
        <p>{options.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Form                                                                */}
      {/* ------------------------------------------------------------------ */}
      <form
        onSubmit={handleFormSubmit}
        className={`space-y-5 rounded-xl border p-5 ${
          isEditing ? "border-brand/40 bg-brand-light/30" : "border-cream-border bg-white"
        }`}
      >
        {isEditing && (
          <p className="text-xs font-medium text-brand">
            Editing row {draft.editingIndex! + 1} — make your changes then click Update Row
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={LABEL_CLASS}>Event <span className="text-brand">*</span></label>
            <select
              required
              value={form.event}
              onChange={(e) => setField("event", e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">Select event...</option>
              {options.data?.events.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS}>Customer <span className="text-brand">*</span></label>
            <SearchableSelect
              value={form.customer}
              onChange={(v) => setField("customer", v)}
              options={(options.data?.customers ?? []).map((c) => ({ value: c, label: c }))}
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
              value={form.item}
              onChange={(v) => setField("item", v)}
              options={(options.data?.items ?? []).map((item) => ({
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
              required
              type="number"
              min="1"
              placeholder="Qty"
              value={form.unit}
              onChange={(e) => setField("unit", e.target.value)}
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
              type="text"
              placeholder="Optional note"
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>

        {/* Direct-submit feedback (only when not using the draft list) */}
        {!isEditing && submitState.status === "success" && submitState.source === "direct" && (
          <p className="text-sm text-green-600 font-medium">Row saved to sheet.</p>
        )}
        {!isEditing && submitState.status === "error" && submitState.source === "direct" && (
          <p className="text-sm text-red-600">{submitState.message}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="border border-cream-border text-sm px-5 py-2.5 rounded-lg hover:bg-cream transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-brand hover:bg-brand-dark text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Update Row
              </button>
            </>
          ) : (
            <>
              <button
                type="submit"
                onClick={() => { submitIntentRef.current = "add" }}
                className="bg-brand hover:bg-brand-dark text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                + Add Row
              </button>
<button
                type="submit"
                onClick={() => { submitIntentRef.current = "direct" }}
                disabled={submitState.status === "submitting" || draft.rows.length > 0}
                className="border border-brand text-brand text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitState.status === "submitting" && submitIntentRef.current === "direct"
                  ? "Saving..."
                  : "Submit"}
              </button>
            </>
          )}
        </div>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Draft table                                                         */}
      {/* ------------------------------------------------------------------ */}
      {draft.rows.length > 0 && (
        <div className="rounded-xl border border-cream-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-cream-border">
            <p className="text-sm font-medium text-foreground">
              Draft rows <span className="text-brand font-semibold">{draft.rows.length}</span>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-border bg-cream text-left">
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 w-6">#</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">Event</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">Customer</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">Item</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">Unit</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500">Note</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, i) => (
                  <tr
                    key={row._key}
                    className={`border-b border-cream-border last:border-0 ${
                      draft.editingIndex === i ? "bg-brand-light/40" : "hover:bg-cream/60"
                    }`}
                  >
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 text-foreground">{row.event}</td>
                    <td className="px-3 py-2 text-foreground">{row.customer}</td>
                    <td className="px-3 py-2 text-foreground">{row.items}</td>
                    <td className="px-3 py-2 text-foreground">{row.unit}</td>
                    <td className="px-3 py-2 text-gray-500">{row.note || "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(i)}
                        disabled={isEditing && draft.editingIndex !== i}
                        className="text-xs text-brand hover:underline disabled:opacity-30 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "DELETE", index: i })}
                        className="text-xs text-red-400 hover:text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Submit all */}
          <div className="px-4 py-3 border-t border-cream-border flex items-center justify-between gap-3">
            <div className="text-sm">
              {submitState.status === "success" && submitState.source === "batch" && (
                <span className="text-green-600 font-medium">
                  {submitState.count} {submitState.count === 1 ? "row" : "rows"} saved to sheet.
                </span>
              )}
              {submitState.status === "error" && submitState.source === "batch" && (
                <span className="text-red-600">{submitState.message}</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => dispatch({ type: "CLEAR" })}
                disabled={submitState.status === "submitting"}
                className="border border-cream-border text-sm px-4 py-2.5 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Clear rows
              </button>
              <button
                type="button"
                onClick={handleSubmitAll}
                disabled={submitState.status === "submitting" || isEditing}
                className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {submitState.status === "submitting"
                  ? "Saving..."
                  : `Submit ${draft.rows.length} ${draft.rows.length === 1 ? "row" : "rows"} to Sheet`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
