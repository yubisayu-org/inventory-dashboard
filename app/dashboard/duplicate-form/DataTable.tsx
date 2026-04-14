"use client"

import { useCallback, useEffect, useReducer, useState } from "react"
import type { FormRow, SheetOptions } from "@/lib/sheets"
import SearchableSelect from "@/components/SearchableSelect"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditForm = {
  event: string
  customer: string
  items: string
  unit: string
  note: string
}

const PAGE_SIZE = 25

type TableState = {
  rows: FormRow[]
  editingRowNumber: number | null
  editForm: EditForm
  /** Row number currently being saved or deleted (shows spinner, disables actions) */
  busyRowNumber: number | null
  currentPage: number
}

type TableAction =
  | { type: "SET_ROWS"; rows: FormRow[] }
  | { type: "EDIT_START"; row: FormRow }
  | { type: "EDIT_FIELD"; field: keyof EditForm; value: string }
  | { type: "EDIT_CANCEL" }
  | { type: "BUSY_START"; rowNumber: number }
  | { type: "BUSY_END" }
  | { type: "APPLY_UPDATE"; rowNumber: number; form: EditForm }
  | { type: "REMOVE_ROW"; rowNumber: number }
  | { type: "SET_PAGE"; page: number }

const EMPTY_EDIT: EditForm = { event: "", customer: "", items: "", unit: "", note: "" }

const INITIAL_STATE: TableState = {
  rows: [],
  editingRowNumber: null,
  editForm: EMPTY_EDIT,
  busyRowNumber: null,
  currentPage: 1,
}

function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "SET_ROWS":
      return { ...state, rows: action.rows, editingRowNumber: null, editForm: EMPTY_EDIT, busyRowNumber: null, currentPage: 1 }
    case "EDIT_START":
      return {
        ...state,
        editingRowNumber: action.row.rowNumber,
        editForm: {
          event: action.row.event,
          customer: action.row.customer,
          items: action.row.items,
          unit: String(action.row.unit),
          note: action.row.note,
        },
      }
    case "EDIT_FIELD":
      return { ...state, editForm: { ...state.editForm, [action.field]: action.value } }
    case "EDIT_CANCEL":
      return { ...state, editingRowNumber: null, editForm: EMPTY_EDIT }
    case "BUSY_START":
      return { ...state, busyRowNumber: action.rowNumber }
    case "BUSY_END":
      return { ...state, busyRowNumber: null }
    case "APPLY_UPDATE":
      return {
        ...state,
        editingRowNumber: null,
        editForm: EMPTY_EDIT,
        rows: state.rows.map((r) =>
          r.rowNumber === action.rowNumber
            ? {
                ...r,
                event: action.form.event,
                customer: action.form.customer,
                items: action.form.items,
                unit: Number(action.form.unit),
                note: action.form.note,
              }
            : r,
        ),
      }
    case "REMOVE_ROW": {
      const rows = state.rows.filter((r) => r.rowNumber !== action.rowNumber)
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
      return { ...state, rows, currentPage: Math.min(state.currentPage, totalPages) }
    }
    case "SET_PAGE":
      return { ...state, currentPage: action.page, editingRowNumber: null, editForm: EMPTY_EDIT }
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  "w-full border border-cream-border rounded-md px-2 py-1 text-sm text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataTable() {
  const [table, dispatch] = useReducer(tableReducer, INITIAL_STATE)
  const [fetchState, setFetchState] = useState<{ loading: boolean; error: string }>({
    loading: true,
    error: "",
  })
  const [options, setOptions] = useState<SheetOptions | null>(null)

  const isEditing = table.editingRowNumber !== null

  // Pagination
  const totalPages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE))
  const pageStart = (table.currentPage - 1) * PAGE_SIZE
  const pagedRows = table.rows.slice(pageStart, pageStart + PAGE_SIZE)

  // Load rows and dropdown options in parallel
  const loadRows = useCallback(async () => {
    setFetchState({ loading: true, error: "" })
    try {
      const res = await fetch("/api/sheets/duplicate-form")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to load rows")
      dispatch({ type: "SET_ROWS", rows: data.rows })
      setFetchState({ loading: false, error: "" })
    } catch (err) {
      setFetchState({ loading: false, error: err instanceof Error ? err.message : "Failed to load rows" })
    }
  }, [])

  useEffect(() => {
    loadRows()
    fetch("/api/sheets/options")
      .then((r) => r.json())
      .then((data: SheetOptions & { error?: string }) => {
        if (!data.error) setOptions(data)
      })
      .catch(() => {/* options are best-effort; editing still works with free-text fallback */})
  }, [loadRows])

  async function handleSave(rowNumber: number) {
    const { event, customer, items, unit, note } = table.editForm
    if (!event || !customer || !items || !unit) return

    dispatch({ type: "BUSY_START", rowNumber })
    try {
      const res = await fetch(`/api/sheets/duplicate-form/${rowNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, customer, items, unit: Number(unit), note }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to save")
      }
      dispatch({ type: "APPLY_UPDATE", rowNumber, form: table.editForm })
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save row")
    } finally {
      dispatch({ type: "BUSY_END" })
    }
  }

  async function handleDelete(rowNumber: number) {
    if (!confirm("Delete this row from the sheet? This cannot be undone.")) return

    dispatch({ type: "BUSY_START", rowNumber })
    try {
      const res = await fetch(`/api/sheets/duplicate-form/${rowNumber}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to delete")
      }
      // Remove optimistically then re-fetch to correct all row numbers
      dispatch({ type: "REMOVE_ROW", rowNumber })
      await loadRows()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete row")
    } finally {
      dispatch({ type: "BUSY_END" })
    }
  }

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (fetchState.loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        Loading rows...
      </div>
    )
  }

  if (fetchState.error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-4 text-sm text-red-700">
        <p className="font-medium mb-1">Failed to load data</p>
        <p>{fetchState.error}</p>
        <button
          onClick={loadRows}
          className="mt-3 text-sm underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (table.rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        No orders found.
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Table
  // ---------------------------------------------------------------------------

  return (
    <div className="rounded-xl border border-cream-border bg-white overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cream-border">
        <p className="text-sm font-medium text-foreground">
          {table.rows.length} {table.rows.length === 1 ? "row" : "rows"}
          {totalPages > 1 && (
            <span className="text-gray-400 font-normal ml-2">
              — showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, table.rows.length)}
            </span>
          )}
        </p>
        <button
          onClick={loadRows}
          disabled={fetchState.loading}
          className="text-xs text-gray-400 hover:text-brand transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-border bg-cream text-left">
              <th className="px-3 py-2 text-xs font-medium text-gray-500 w-8">#</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500">Event</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500">Customer</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500">Item</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500 w-20">Unit</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500">Note</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500">Created At</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-500 text-right w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, i) => {
              const editing = table.editingRowNumber === row.rowNumber
              const busy = table.busyRowNumber === row.rowNumber

              return (
                <tr
                  key={row.rowNumber}
                  className={`border-b border-cream-border last:border-0 ${
                    editing
                      ? "bg-brand-light/30"
                      : busy
                        ? "opacity-50"
                        : "hover:bg-cream/60"
                  }`}
                >
                  <td className="px-3 py-2 text-gray-400 align-top pt-3">{pageStart + i + 1}</td>

                  {/* Event */}
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <select
                        value={table.editForm.event}
                        onChange={(e) => dispatch({ type: "EDIT_FIELD", field: "event", value: e.target.value })}
                        className={INPUT_CLASS}
                      >
                        <option value="">Select...</option>
                        {(options?.events ?? []).map((ev) => (
                          <option key={ev} value={ev}>{ev}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-foreground">{row.event}</span>
                    )}
                  </td>

                  {/* Customer */}
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <SearchableSelect
                        value={table.editForm.customer}
                        onChange={(v) => dispatch({ type: "EDIT_FIELD", field: "customer", value: v })}
                        options={(options?.customers ?? []).map((c) => ({ value: c, label: c }))}
                        placeholder="Select customer..."
                      />
                    ) : (
                      <span className="text-foreground">{row.customer}</span>
                    )}
                  </td>

                  {/* Item */}
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <SearchableSelect
                        value={table.editForm.items}
                        onChange={(v) => dispatch({ type: "EDIT_FIELD", field: "items", value: v })}
                        options={(options?.items ?? []).map((item) => ({
                          value: item.name,
                          label: item.name,
                          meta: item.store || undefined,
                        }))}
                        placeholder="Select item..."
                      />
                    ) : (
                      <span className="text-foreground">{row.items}</span>
                    )}
                  </td>

                  {/* Unit */}
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <input
                        type="number"
                        min="1"
                        value={table.editForm.unit}
                        onChange={(e) => dispatch({ type: "EDIT_FIELD", field: "unit", value: e.target.value })}
                        className={INPUT_CLASS}
                      />
                    ) : (
                      <span className="text-foreground">{row.unit}</span>
                    )}
                  </td>

                  {/* Note */}
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <input
                        type="text"
                        value={table.editForm.note}
                        onChange={(e) => dispatch({ type: "EDIT_FIELD", field: "note", value: e.target.value })}
                        className={INPUT_CLASS}
                        placeholder="Optional"
                      />
                    ) : (
                      <span className="text-gray-500">{row.note || "—"}</span>
                    )}
                  </td>

                  {/* Created At — always read-only */}
                  <td className="px-3 py-2 align-top">
                    <span className="text-gray-400 text-xs whitespace-nowrap">{row.createdAt}</span>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                    {busy ? (
                      <span className="text-xs text-gray-400">Working…</span>
                    ) : editing ? (
                      <>
                        <button
                          onClick={() => handleSave(row.rowNumber)}
                          className="text-xs text-brand font-medium hover:underline mr-3"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => dispatch({ type: "EDIT_CANCEL" })}
                          className="text-xs text-gray-400 hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => dispatch({ type: "EDIT_START", row })}
                          disabled={isEditing}
                          className="text-xs text-brand hover:underline disabled:opacity-30 mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(row.rowNumber)}
                          disabled={isEditing}
                          className="text-xs text-red-400 hover:text-red-600 hover:underline disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-cream-border">
          <p className="text-xs text-gray-400">
            Page {table.currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <PaginationButton
              onClick={() => dispatch({ type: "SET_PAGE", page: table.currentPage - 1 })}
              disabled={table.currentPage === 1}
            >
              ←
            </PaginationButton>

            {getPageNumbers(table.currentPage, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-400">…</span>
              ) : (
                <PaginationButton
                  key={p}
                  onClick={() => dispatch({ type: "SET_PAGE", page: p as number })}
                  active={p === table.currentPage}
                >
                  {p}
                </PaginationButton>
              ),
            )}

            <PaginationButton
              onClick={() => dispatch({ type: "SET_PAGE", page: table.currentPage + 1 })}
              disabled={table.currentPage === totalPages}
            >
              →
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

function PaginationButton({
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[2rem] h-8 px-2 text-xs rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? "bg-brand text-white font-medium"
          : "border border-cream-border hover:bg-cream text-gray-600"
      }`}
    >
      {children}
    </button>
  )
}

/** Returns a window of page numbers with "…" ellipsis for large ranges. */
function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | "…")[] = [1]

  if (current > 3) pages.push("…")

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let p = start; p <= end; p++) pages.push(p)

  if (current < total - 2) pages.push("…")

  pages.push(total)
  return pages
}
