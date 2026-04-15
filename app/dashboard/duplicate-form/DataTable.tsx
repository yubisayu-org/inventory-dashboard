"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import type { FormRow, SheetOptions } from "@/lib/sheets"
import SearchableSelect from "@/components/SearchableSelect"
import type { Role } from "@/lib/roles"

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

type ColumnId =
  | "index" | "event" | "customer" | "items" | "unit" | "stage"
  | "note" | "createdAt" | "updatedAt"
  | "unitBuy" | "receipt"
  | "unitArrive" | "unitShip" | "unitHold"
  | "actions"

type ColumnDef = {
  id: ColumnId
  label: string
  locked?: boolean
  ownerOnly?: boolean
  defaultVisible: boolean
  className?: string
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: "index",      label: "#",          locked: true,    defaultVisible: true,  className: "w-8" },
  { id: "event",      label: "Event",                       defaultVisible: true  },
  { id: "customer",   label: "Customer",                    defaultVisible: true  },
  { id: "items",      label: "Item",        locked: true,   defaultVisible: true  },
  { id: "unit",       label: "Qty",                         defaultVisible: true,  className: "w-16" },
  { id: "stage",      label: "Stage",       locked: true,   defaultVisible: true,  className: "w-36" },
  { id: "note",       label: "Note",                        defaultVisible: false },
  { id: "createdAt",  label: "Created At",                  defaultVisible: false },
  { id: "updatedAt",  label: "Updated At",                  defaultVisible: false },
  { id: "unitBuy",    label: "Unit Buy",    ownerOnly: true, defaultVisible: false, className: "w-24" },
  { id: "receipt",    label: "Receipt",     ownerOnly: true, defaultVisible: false },
  { id: "unitArrive", label: "Arrived",                     defaultVisible: false, className: "w-20" },
  { id: "unitShip",   label: "Shipped",                     defaultVisible: false, className: "w-20" },
  { id: "unitHold",   label: "Hold",                        defaultVisible: false, className: "w-20" },
  { id: "actions",    label: "",            locked: true,   defaultVisible: true,  className: "w-16 text-right" },
]

function getVisibleColumns(visibility: Record<ColumnId, boolean>, role: Role | null): ColumnDef[] {
  return ALL_COLUMNS.filter((col) => {
    if (col.ownerOnly && role !== "owner") return false
    return visibility[col.id]
  })
}

function defaultVisibility(): Record<ColumnId, boolean> {
  const result = {} as Record<ColumnId, boolean>
  for (const col of ALL_COLUMNS) result[col.id] = col.defaultVisible
  return result
}

// ---------------------------------------------------------------------------
// Stage logic
// ---------------------------------------------------------------------------

type StageKey = "placed" | "purchased" | "partiallyArrived" | "arrived" | "hold" | "shipped" | "incomplete"

type StageDef = { key: StageKey; label: string; dot: string; badge: string; priority: number }

const STAGES: Record<StageKey, StageDef> = {
  placed:           { key: "placed",           label: "Placed",   dot: "bg-gray-300",    badge: "bg-gray-100 text-gray-500",      priority: 1 },
  purchased:        { key: "purchased",        label: "Purchased",dot: "bg-yellow-400",  badge: "bg-yellow-50 text-yellow-700",   priority: 2 },
  partiallyArrived: { key: "partiallyArrived", label: "Partial",  dot: "bg-orange-400",  badge: "bg-orange-50 text-orange-700",   priority: 3 },
  arrived:          { key: "arrived",          label: "Arrived",  dot: "bg-green-400",   badge: "bg-green-50 text-green-700",     priority: 4 },
  hold:             { key: "hold",             label: "Hold",     dot: "bg-blue-400",    badge: "bg-blue-50 text-blue-700",       priority: 5 },
  shipped:          { key: "shipped",          label: "Shipped",  dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-800", priority: 6 },
  incomplete:       { key: "incomplete",       label: "Incomplete",dot: "bg-red-400",    badge: "bg-red-50 text-red-600",         priority: 0 },
}

function getStage(row: FormRow): StageDef {
  const buy    = row.unitBuy    ?? 0
  const arrive = row.unitArrive ?? 0
  const ship   = row.unitShip   ?? 0
  const hold   = row.unitHold   ?? 0

  if (buy <= 0) return STAGES.placed

  const hasStage3 = arrive > 0 || ship > 0 || hold > 0
  if (!hasStage3) return STAGES.purchased

  if (buy === ship && arrive === ship) return STAGES.shipped
  if (hold > 0)                        return STAGES.hold
  if (buy === arrive)                  return STAGES.arrived
  if (arrive > 0 && arrive < buy)      return STAGES.partiallyArrived
  return STAGES.incomplete
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25

type Filters    = { event: string; customer: string; items: string }
type SortKey    = "event" | "customer" | "items" | "unit" | "note" | "createdAt" | "stage"
type SortDir    = "asc" | "desc"
type SortConfig = { key: SortKey; direction: SortDir } | null

const SORT_LABELS: Record<SortKey, string> = {
  event: "Event", customer: "Customer", items: "Item",
  unit: "Qty", note: "Note", createdAt: "Created At", stage: "Stage",
}

type TableState = {
  rows: FormRow[]
  busyRowNumber: number | null
  currentPage: number
  filters: Filters
  sort: SortConfig
  search: string
  addDrawerOpen: boolean
  columnVisibility: Record<ColumnId, boolean>
}

type TableAction =
  | { type: "SET_ROWS"; rows: FormRow[] }
  | { type: "BUSY_START"; rowNumber: number }
  | { type: "BUSY_END" }
  | { type: "APPLY_UPDATE"; rowNumber: number; patch: Partial<FormRow> }
  | { type: "REMOVE_ROW"; rowNumber: number }
  | { type: "SET_PAGE"; page: number }
  | { type: "SET_FILTER"; field: keyof Filters; value: string }
  | { type: "CLEAR_FILTERS" }
  | { type: "SET_SORT"; key: SortKey; direction: SortDir }
  | { type: "CLEAR_SORT" }
  | { type: "SET_SEARCH"; value: string }
  | { type: "TOGGLE_ADD_DRAWER" }
  | { type: "TOGGLE_COLUMN"; column: ColumnId }

const INITIAL_STATE: TableState = {
  rows: [],
  busyRowNumber: null,
  currentPage: 1,
  filters: { event: "", customer: "", items: "" },
  sort: null,
  search: "",
  addDrawerOpen: false,
  columnVisibility: defaultVisibility(),
}

function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "SET_ROWS":
      return { ...state, rows: action.rows, busyRowNumber: null, currentPage: 1 }
    case "BUSY_START":
      return { ...state, busyRowNumber: action.rowNumber }
    case "BUSY_END":
      return { ...state, busyRowNumber: null }
    case "APPLY_UPDATE":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.rowNumber === action.rowNumber ? { ...r, ...action.patch } : r,
        ),
      }
    case "REMOVE_ROW": {
      const rows = state.rows.filter((r) => r.rowNumber !== action.rowNumber)
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
      return { ...state, rows, currentPage: Math.min(state.currentPage, totalPages) }
    }
    case "SET_PAGE":
      return { ...state, currentPage: action.page }
    case "SET_FILTER":
      return { ...state, filters: { ...state.filters, [action.field]: action.value }, currentPage: 1 }
    case "CLEAR_FILTERS":
      return { ...state, filters: { event: "", customer: "", items: "" }, search: "", currentPage: 1 }
    case "SET_SORT":
      return { ...state, sort: { key: action.key, direction: action.direction }, currentPage: 1 }
    case "CLEAR_SORT":
      return { ...state, sort: null, currentPage: 1 }
    case "SET_SEARCH":
      return { ...state, search: action.value, currentPage: 1 }
    case "TOGGLE_ADD_DRAWER":
      return { ...state, addDrawerOpen: !state.addDrawerOpen }
    case "TOGGLE_COLUMN": {
      const col = ALL_COLUMNS.find((c) => c.id === action.column)
      if (!col || col.locked) return state
      return { ...state, columnVisibility: { ...state.columnVisibility, [action.column]: !state.columnVisibility[action.column] } }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applySearch(rows: FormRow[], search: string): FormRow[] {
  if (!search) return rows
  const q = search.toLowerCase()
  return rows.filter((r) =>
    r.event.toLowerCase().includes(q) ||
    r.customer.toLowerCase().includes(q) ||
    r.items.toLowerCase().includes(q) ||
    r.note.toLowerCase().includes(q) ||
    String(r.unit).includes(q),
  )
}

function applyFilters(rows: FormRow[], filters: Filters): FormRow[] {
  return rows.filter((r) => {
    if (filters.event    && r.event    !== filters.event)    return false
    if (filters.customer && r.customer !== filters.customer) return false
    if (filters.items    && r.items    !== filters.items)    return false
    return true
  })
}

function applySort(rows: FormRow[], sort: SortConfig): FormRow[] {
  if (!sort) return rows
  const { key, direction } = sort
  return [...rows].sort((a, b) => {
    if (key === "stage") {
      const diff = getStage(a).priority - getStage(b).priority
      return direction === "asc" ? diff : -diff
    }
    if (key === "unit") return direction === "asc" ? a.unit - b.unit : b.unit - a.unit
    const aStr = String(a[key as keyof FormRow] ?? "").toLowerCase()
    const bStr = String(b[key as keyof FormRow] ?? "").toLowerCase()
    return direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
  })
}

function uniqueSorted(rows: FormRow[], key: "event" | "customer" | "items"): string[] {
  return [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b)) as string[]
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  "w-full border border-cream-border rounded-md px-2 py-1 text-sm text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"

const TOOLBAR_BTN =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-cream-border rounded-lg hover:bg-cream transition-colors text-gray-600"

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DataTable({ role }: { role: Role | null }) {
  const [table, dispatch] = useReducer(tableReducer, INITIAL_STATE)
  const [fetchState, setFetchState] = useState<{ loading: boolean; error: string }>({ loading: true, error: "" })
  const [options, setOptions]       = useState<SheetOptions | null>(null)
  const [selectedRow, setSelectedRow] = useState<FormRow | null>(null)

  const visibleColumns = useMemo(
    () => getVisibleColumns(table.columnVisibility, role),
    [table.columnVisibility, role],
  )

  const searchedRows = useMemo(() => applySearch(table.rows, table.search),     [table.rows, table.search])
  const filteredRows = useMemo(() => applyFilters(searchedRows, table.filters), [searchedRows, table.filters])
  const sortedRows   = useMemo(() => applySort(filteredRows, table.sort),        [filteredRows, table.sort])
  const totalPages   = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const pageStart    = (table.currentPage - 1) * PAGE_SIZE
  const pagedRows    = sortedRows.slice(pageStart, pageStart + PAGE_SIZE)

  const filterOptions = useMemo(() => ({
    events:    uniqueSorted(table.rows, "event"),
    customers: uniqueSorted(table.rows, "customer"),
    items:     uniqueSorted(table.rows, "items"),
  }), [table.rows])

  const hasActiveFilters  = table.filters.event || table.filters.customer || table.filters.items || table.search
  const activeFilterCount = [table.filters.event, table.filters.customer, table.filters.items].filter(Boolean).length

  // Keep selectedRow in sync after table refreshes
  useEffect(() => {
    if (!selectedRow) return
    const updated = table.rows.find((r) => r.rowNumber === selectedRow.rowNumber)
    setSelectedRow(updated ?? null)
  }, [table.rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRows = useCallback(async () => {
    setFetchState({ loading: true, error: "" })
    try {
      const res  = await fetch("/api/sheets/duplicate-form")
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
      .then((data: SheetOptions & { error?: string }) => { if (!data.error) setOptions(data) })
      .catch(() => {})
  }, [loadRows])

  async function handleDelete(rowNumber: number) {
    if (!confirm("Delete this order? This cannot be undone.")) return
    dispatch({ type: "BUSY_START", rowNumber })
    try {
      const res = await fetch(`/api/sheets/duplicate-form/${rowNumber}`, { method: "DELETE" })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to delete") }
      if (selectedRow?.rowNumber === rowNumber) setSelectedRow(null)
      dispatch({ type: "REMOVE_ROW", rowNumber })
      await loadRows()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete row")
    } finally {
      dispatch({ type: "BUSY_END" })
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (fetchState.loading && table.rows.length === 0) {
    return <div className="flex items-center justify-center py-24 text-gray-400 text-sm">Loading orders...</div>
  }

  if (fetchState.error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-4 text-sm text-red-700">
        <p className="font-medium mb-1">Failed to load data</p>
        <p>{fetchState.error}</p>
        <button onClick={loadRows} className="mt-3 text-sm underline hover:no-underline">Retry</button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const anyDrawerOpen = table.addDrawerOpen || selectedRow !== null

  return (
    <div className="flex gap-4 items-start">
      {/* ── Table panel ── */}
      <div className="flex-1 min-w-0 rounded-xl border border-cream-border bg-white overflow-hidden">

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-cream-border">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={table.search}
                onChange={(e) => dispatch({ type: "SET_SEARCH", value: e.target.value })}
                placeholder="Search orders..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-cream-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>

            <FilterPopover filters={table.filters} filterOptions={filterOptions} activeCount={activeFilterCount} dispatch={dispatch} />
            <SortPopover sort={table.sort} dispatch={dispatch} />
            <ColumnPopover columns={ALL_COLUMNS} visibility={table.columnVisibility} role={role} dispatch={dispatch} />

            <div className="flex-1" />

            <span className="text-xs text-gray-400 shrink-0">
              {sortedRows.length !== table.rows.length ? `${sortedRows.length} of ${table.rows.length}` : table.rows.length}{" "}
              {table.rows.length === 1 ? "order" : "orders"}
            </span>

            <button onClick={loadRows} title="Refresh" className="p-1.5 text-gray-400 hover:text-brand transition-colors rounded">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.22-8.56" /><polyline points="21 3 21 9 15 9" />
              </svg>
            </button>

            <button
              onClick={() => { dispatch({ type: "TOGGLE_ADD_DRAWER" }); setSelectedRow(null) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                table.addDrawerOpen ? "bg-brand-light text-brand border border-brand/30" : "bg-brand text-white hover:bg-brand-hover"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Order
            </button>
          </div>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {table.search           && <FilterChip label={`Search: "${table.search}"`}          onRemove={() => dispatch({ type: "SET_SEARCH", value: "" })} />}
              {table.filters.event    && <FilterChip label={`Event: ${table.filters.event}`}       onRemove={() => dispatch({ type: "SET_FILTER", field: "event",    value: "" })} />}
              {table.filters.customer && <FilterChip label={`Customer: ${table.filters.customer}`} onRemove={() => dispatch({ type: "SET_FILTER", field: "customer", value: "" })} />}
              {table.filters.items    && <FilterChip label={`Item: ${table.filters.items}`}        onRemove={() => dispatch({ type: "SET_FILTER", field: "items",    value: "" })} />}
              <button onClick={() => dispatch({ type: "CLEAR_FILTERS" })} className="text-xs text-gray-400 hover:text-brand transition-colors ml-1">Clear all</button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-border bg-cream text-left">
                {visibleColumns.map((col) => (
                  <th key={col.id} className={`px-3 py-2 text-xs font-medium text-gray-500 ${col.className ?? ""}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-3 py-12 text-center text-gray-400 text-sm">
                    {table.rows.length === 0 ? "No orders found." : "No orders match the current filters."}
                  </td>
                </tr>
              ) : (
                pagedRows.map((row, i) => {
                  const busy     = table.busyRowNumber === row.rowNumber
                  const selected = selectedRow?.rowNumber === row.rowNumber
                  return (
                    <tr
                      key={row.rowNumber}
                      onClick={() => { setSelectedRow(row); if (table.addDrawerOpen) dispatch({ type: "TOGGLE_ADD_DRAWER" }) }}
                      className={`border-b border-cream-border last:border-0 cursor-pointer transition-colors ${
                        selected  ? "bg-brand-light/40" :
                        busy      ? "opacity-50 cursor-default" :
                                    "hover:bg-cream/60"
                      }`}
                    >
                      {visibleColumns.map((col) => (
                        <td
                          key={col.id}
                          className={`px-3 py-2.5 align-middle ${col.id === "actions" ? "text-right" : ""}`}
                          onClick={col.id === "actions" ? (e) => e.stopPropagation() : undefined}
                        >
                          <ReadCell col={col} row={row} i={i} pageStart={pageStart} busy={busy} onDelete={handleDelete} />
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-cream-border">
            <p className="text-xs text-gray-400">Page {table.currentPage} of {totalPages}</p>
            <div className="flex items-center gap-1">
              <PaginationButton onClick={() => dispatch({ type: "SET_PAGE", page: table.currentPage - 1 })} disabled={table.currentPage === 1}>←</PaginationButton>
              {getPageNumbers(table.currentPage, totalPages).map((p, idx) =>
                p === "…"
                  ? <span key={`e-${idx}`} className="px-2 text-xs text-gray-400">…</span>
                  : <PaginationButton key={p} onClick={() => dispatch({ type: "SET_PAGE", page: p as number })} active={p === table.currentPage}>{p}</PaginationButton>
              )}
              <PaginationButton onClick={() => dispatch({ type: "SET_PAGE", page: table.currentPage + 1 })} disabled={table.currentPage === totalPages}>→</PaginationButton>
            </div>
          </div>
        )}
      </div>

      {/* ── Drawers ── */}
      {selectedRow && !table.addDrawerOpen && (
        <OrderDetailDrawer
          row={selectedRow}
          role={role}
          options={options}
          onClose={() => setSelectedRow(null)}
          onPatch={(patch) => dispatch({ type: "APPLY_UPDATE", rowNumber: selectedRow.rowNumber, patch })}
          onDeleted={() => { setSelectedRow(null); loadRows() }}
          onReload={loadRows}
        />
      )}

      {table.addDrawerOpen && (
        <AddOrderDrawer
          options={options}
          onClose={() => dispatch({ type: "TOGGLE_ADD_DRAWER" })}
          onSuccess={loadRows}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read-only cell renderer
// ---------------------------------------------------------------------------

function ReadCell({ col, row, i, pageStart, busy, onDelete }: {
  col: ColumnDef
  row: FormRow
  i: number
  pageStart: number
  busy: boolean
  onDelete: (n: number) => void
}) {
  switch (col.id) {
    case "index":      return <span className="text-gray-400 text-xs">{pageStart + i + 1}</span>
    case "event":      return <span className="text-foreground">{row.event}</span>
    case "customer":   return <span className="text-foreground">{row.customer}</span>
    case "items":      return <span className="text-foreground">{row.items}</span>
    case "unit":       return <span className="text-foreground">{row.unit}</span>
    case "stage":      return <StageBadge row={row} />
    case "note":       return <span className="text-gray-500 text-xs">{row.note || "—"}</span>
    case "createdAt":  return <span className="text-gray-400 text-xs whitespace-nowrap">{row.createdAt || "—"}</span>
    case "updatedAt":  return <span className="text-gray-400 text-xs whitespace-nowrap">{row.updatedAt || "—"}</span>
    case "unitBuy":    return <span className="text-foreground">{row.unitBuy ?? "—"}</span>
    case "receipt":    return <span className="text-foreground truncate max-w-[12rem] block">{row.receipt || "—"}</span>
    case "unitArrive": return <span className="text-foreground">{row.unitArrive ?? "—"}</span>
    case "unitShip":   return <span className="text-foreground">{row.unitShip ?? "—"}</span>
    case "unitHold":   return <span className="text-foreground">{row.unitHold ?? "—"}</span>
    case "actions":
      return busy ? (
        <span className="text-xs text-gray-400">Working…</span>
      ) : (
        <button
          onClick={() => onDelete(row.rowNumber)}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Delete
        </button>
      )
    default: return null
  }
}

// ---------------------------------------------------------------------------
// Stage Badge
// ---------------------------------------------------------------------------

function StageBadge({ row }: { row: FormRow }) {
  const s = getStage(row)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Order Detail Drawer
// ---------------------------------------------------------------------------

function OrderDetailDrawer({ row, role, options, onClose, onPatch, onDeleted, onReload }: {
  row: FormRow
  role: Role | null
  options: SheetOptions | null
  onClose: () => void
  onPatch: (patch: Partial<FormRow>) => void
  onDeleted: () => void
  onReload: () => Promise<void>
}) {
  // Stage 1 edit state
  const [editingS1, setEditingS1] = useState(false)
  const [s1, setS1] = useState({ event: row.event, customer: row.customer, items: row.items, unit: String(row.unit), note: row.note })
  const [savingS1, setSavingS1]   = useState(false)
  const [errS1, setErrS1]         = useState("")

  // Stage 2 form state
  const [s2, setS2] = useState({ unitBuy: String(row.unitBuy ?? ""), receipt: row.receipt ?? "" })
  const [savingS2, setSavingS2] = useState(false)
  const [errS2, setErrS2]       = useState("")
  const [okS2, setOkS2]         = useState(false)

  // Stage 3 form state
  const [s3, setS3] = useState({ unitArrive: String(row.unitArrive ?? ""), unitShip: String(row.unitShip ?? ""), unitHold: String(row.unitHold ?? "") })
  const [savingS3, setSavingS3] = useState(false)
  const [errS3, setErrS3]       = useState("")
  const [okS3, setOkS3]         = useState(false)

  // Sync form when row prop updates (after reload)
  useEffect(() => {
    setS1({ event: row.event, customer: row.customer, items: row.items, unit: String(row.unit), note: row.note })
    setS2({ unitBuy: String(row.unitBuy ?? ""), receipt: row.receipt ?? "" })
    setS3({ unitArrive: String(row.unitArrive ?? ""), unitShip: String(row.unitShip ?? ""), unitHold: String(row.unitHold ?? "") })
  }, [row])

  async function saveStage1() {
    if (!s1.event || !s1.customer || !s1.items || !s1.unit) return
    setSavingS1(true); setErrS1("")
    try {
      const res = await fetch(`/api/sheets/duplicate-form/${row.rowNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "1", event: s1.event, customer: s1.customer, items: s1.items, unit: Number(s1.unit), note: s1.note }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to save") }
      onPatch({ event: s1.event, customer: s1.customer, items: s1.items, unit: Number(s1.unit), note: s1.note })
      setEditingS1(false)
      await onReload()
    } catch (err) {
      setErrS1(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingS1(false)
    }
  }

  async function saveStage2() {
    if (!s2.unitBuy) return
    setSavingS2(true); setErrS2(""); setOkS2(false)
    try {
      const res = await fetch(`/api/sheets/duplicate-form/${row.rowNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "2", unitBuy: Number(s2.unitBuy), receipt: s2.receipt }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to save") }
      onPatch({ unitBuy: Number(s2.unitBuy), receipt: s2.receipt })
      setOkS2(true)
      await onReload()
    } catch (err) {
      setErrS2(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingS2(false)
    }
  }

  async function saveStage3() {
    if (s3.unitArrive === "" && s3.unitShip === "" && s3.unitHold === "") return
    const arrive = s3.unitArrive === "" ? 0 : Number(s3.unitArrive)
    const ship   = s3.unitShip   === "" ? 0 : Number(s3.unitShip)
    const hold   = s3.unitHold   === "" ? 0 : Number(s3.unitHold)
    setSavingS3(true); setErrS3(""); setOkS3(false)
    try {
      const res = await fetch(`/api/sheets/duplicate-form/${row.rowNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "3", unitArrive: arrive, unitShip: ship, unitHold: hold }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to save") }
      onPatch({ unitArrive: arrive, unitShip: ship, unitHold: hold })
      setOkS3(true)
      await onReload()
    } catch (err) {
      setErrS3(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingS3(false)
    }
  }

  const FIELD_INPUT = "w-full border border-cream-border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
  const LABEL_CLS   = "text-xs text-gray-400 w-24 shrink-0"
  const VALUE_CLS   = "text-sm text-foreground"

  return (
    <div className="w-80 shrink-0 rounded-xl border border-cream-border bg-white flex flex-col sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-cream-border sticky top-0 bg-white z-10">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Order Details</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Row {row.rowNumber}
            {row.createdAt && <> · {row.createdAt}</>}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-brand transition-colors p-0.5 rounded mt-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Section ①: Order ── */}
        <section className="rounded-lg border border-cream-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-cream border-b border-cream-border">
            <span className="text-xs font-medium text-gray-600">① Order</span>
            {!editingS1 ? (
              <button onClick={() => setEditingS1(true)} className="text-xs text-brand hover:underline">Edit</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={saveStage1} disabled={savingS1} className="text-xs text-brand font-medium hover:underline disabled:opacity-50">
                  {savingS1 ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditingS1(false); setErrS1("") }} className="text-xs text-gray-400 hover:underline">Cancel</button>
              </div>
            )}
          </div>

          <div className="p-3 space-y-2.5">
            {editingS1 ? (
              <>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Event</label>
                  <select value={s1.event} onChange={(e) => setS1({ ...s1, event: e.target.value })} className={FIELD_INPUT}>
                    <option value="">Select...</option>
                    {(options?.events ?? []).map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Customer</label>
                  <SearchableSelect value={s1.customer} onChange={(v) => setS1({ ...s1, customer: v })} options={(options?.customers ?? []).map((c) => ({ value: c, label: c }))} placeholder="Select customer..." />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Item</label>
                  <SearchableSelect value={s1.items} onChange={(v) => setS1({ ...s1, items: v })} options={(options?.items ?? []).map((it) => ({ value: it.name, label: it.name, meta: it.store || undefined }))} placeholder="Select item..." />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Qty</label>
                  <input type="number" min="1" value={s1.unit} onChange={(e) => setS1({ ...s1, unit: e.target.value })} className={FIELD_INPUT} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Note</label>
                  <input type="text" value={s1.note} onChange={(e) => setS1({ ...s1, note: e.target.value })} placeholder="Optional" className={FIELD_INPUT} />
                </div>
                {errS1 && <p className="text-xs text-red-600">{errS1}</p>}
              </>
            ) : (
              <>
                {[
                  { label: "Event",    value: row.event },
                  { label: "Customer", value: row.customer },
                  { label: "Item",     value: row.items },
                  { label: "Qty",      value: String(row.unit) },
                  { label: "Note",     value: row.note || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-3">
                    <span className={LABEL_CLS}>{label}</span>
                    <span className={VALUE_CLS}>{value}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        {/* ── Section ②: Purchase (owner only) ── */}
        {role === "owner" && (
          <section className="rounded-lg border border-cream-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-cream border-b border-cream-border">
              <span className="text-xs font-medium text-gray-600">② Purchase</span>
              <span className="text-[10px] text-gray-400 bg-white border border-cream-border rounded px-1.5 py-0.5">Owner only</span>
            </div>
            <div className="p-3 space-y-2.5">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Unit Buy</label>
                <input type="number" min="0" value={s2.unitBuy} onChange={(e) => { setS2({ ...s2, unitBuy: e.target.value }); setOkS2(false); setErrS2("") }} placeholder="e.g. 450000" className={FIELD_INPUT} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Receipt <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={s2.receipt} onChange={(e) => { setS2({ ...s2, receipt: e.target.value }); setOkS2(false); setErrS2("") }} placeholder="e.g. INV-001" className={FIELD_INPUT} />
              </div>
              {errS2 && <p className="text-xs text-red-600">{errS2}</p>}
              {okS2  && <p className="text-xs text-green-600">Saved</p>}
              <button
                onClick={saveStage2}
                disabled={savingS2 || !s2.unitBuy}
                className="w-full py-1.5 text-xs font-medium rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingS2 ? "Saving…" : "Save"}
              </button>
            </div>
          </section>
        )}

        {/* ── Section ③: Fulfillment ── */}
        <section className="rounded-lg border border-cream-border overflow-hidden">
          <div className="flex items-center px-3 py-2 bg-cream border-b border-cream-border">
            <span className="text-xs font-medium text-gray-600">③ Fulfillment</span>
          </div>
          <div className="p-3 space-y-2.5">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Arrived</label>
              <input type="number" min="0" value={s3.unitArrive} onChange={(e) => { setS3({ ...s3, unitArrive: e.target.value }); setOkS3(false); setErrS3("") }} placeholder="0" className={FIELD_INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Shipped</label>
              <input type="number" min="0" value={s3.unitShip} onChange={(e) => { setS3({ ...s3, unitShip: e.target.value }); setOkS3(false); setErrS3("") }} placeholder="0" className={FIELD_INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Hold</label>
              <input type="number" min="0" value={s3.unitHold} onChange={(e) => { setS3({ ...s3, unitHold: e.target.value }); setOkS3(false); setErrS3("") }} placeholder="0" className={FIELD_INPUT} />
            </div>
            {errS3 && <p className="text-xs text-red-600">{errS3}</p>}
            {okS3  && <p className="text-xs text-green-600">Saved</p>}
            <button
              onClick={saveStage3}
              disabled={savingS3 || (s3.unitArrive === "" && s3.unitShip === "" && s3.unitHold === "")}
              className="w-full py-1.5 text-xs font-medium rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingS3 ? "Saving…" : "Save"}
            </button>
          </div>
        </section>

        {/* Delete */}
        <button
          onClick={async () => {
            if (!confirm("Delete this order? This cannot be undone.")) return
            const res = await fetch(`/api/sheets/duplicate-form/${row.rowNumber}`, { method: "DELETE" })
            if (res.ok) onDeleted()
            else alert("Failed to delete")
          }}
          className="w-full py-1.5 text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded-lg transition-colors"
        >
          Delete order
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add Order Drawer
// ---------------------------------------------------------------------------

function AddOrderDrawer({ options, onClose, onSuccess }: {
  options: SheetOptions | null
  onClose: () => void
  onSuccess: () => Promise<void>
}) {
  const [form, setForm]         = useState({ event: "", customer: "", items: "", unit: "", note: "" })
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  function setField(field: string, value: string) { setForm((f) => ({ ...f, [field]: value })); setFeedback(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.event || !form.customer || !form.items || !form.unit) return
    setSubmitting(true); setFeedback(null)
    try {
      const res = await fetch("/api/sheets/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ event: form.event, customer: form.customer, items: form.items, unit: Number(form.unit), note: form.note }] }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to save") }
      setFeedback({ type: "success", message: "Order added" })
      setForm({ event: "", customer: "", items: "", unit: "", note: "" })
      await onSuccess()
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to save" })
    } finally {
      setSubmitting(false)
    }
  }

  const LABEL  = "text-xs text-gray-500 mb-1 block"
  const DINPUT = "w-full border border-cream-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"

  return (
    <div className="w-80 shrink-0 rounded-xl border border-cream-border bg-white flex flex-col sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cream-border sticky top-0 bg-white z-10">
        <h3 className="text-sm font-semibold text-foreground">New Order</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-brand transition-colors p-0.5 rounded">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div>
          <label className={LABEL}>Event <span className="text-brand">*</span></label>
          <select value={form.event} onChange={(e) => setField("event", e.target.value)} required className={DINPUT}>
            <option value="">Select event...</option>
            {(options?.events ?? []).map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Customer <span className="text-brand">*</span></label>
          <SearchableSelect value={form.customer} onChange={(v) => setField("customer", v)} options={(options?.customers ?? []).map((c) => ({ value: c, label: c }))} placeholder="Search customer..." />
        </div>
        <div>
          <label className={LABEL}>Item <span className="text-brand">*</span></label>
          <SearchableSelect value={form.items} onChange={(v) => setField("items", v)} options={(options?.items ?? []).map((it) => ({ value: it.name, label: it.name, meta: it.store || undefined }))} placeholder="Search item..." />
        </div>
        <div>
          <label className={LABEL}>Unit <span className="text-brand">*</span></label>
          <input type="number" min="1" value={form.unit} onChange={(e) => setField("unit", e.target.value)} required placeholder="Qty" className={DINPUT} />
        </div>
        <div>
          <label className={LABEL}>Note</label>
          <input type="text" value={form.note} onChange={(e) => setField("note", e.target.value)} placeholder="Optional" className={DINPUT} />
        </div>
        {feedback && <p className={`text-xs ${feedback.type === "success" ? "text-green-600" : "text-red-600"}`}>{feedback.message}</p>}
        <button type="submit" disabled={submitting || !form.event || !form.customer || !form.items || !form.unit}
          className="w-full py-2 text-sm font-medium rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? "Saving..." : "Submit Order"}
        </button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toolbar popovers
// ---------------------------------------------------------------------------

function FilterPopover({ filters, filterOptions, activeCount, dispatch }: {
  filters: Filters
  filterOptions: { events: string[]; customers: string[]; items: string[] }
  activeCount: number
  dispatch: React.Dispatch<TableAction>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", fn)
    return () => document.removeEventListener("mousedown", fn)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={TOOLBAR_BTN}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filter
        {activeCount > 0 && <span className="ml-0.5 px-1.5 py-0.5 text-[10px] leading-none rounded-full bg-brand text-white font-medium">{activeCount}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-cream-border rounded-lg shadow-lg z-50 p-3 space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Event</label>
            <SearchableSelect value={filters.event} onChange={(v) => dispatch({ type: "SET_FILTER", field: "event", value: v })} options={filterOptions.events.map((v) => ({ value: v, label: v }))} placeholder="All Events" clearable />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Customer</label>
            <SearchableSelect value={filters.customer} onChange={(v) => dispatch({ type: "SET_FILTER", field: "customer", value: v })} options={filterOptions.customers.map((v) => ({ value: v, label: v }))} placeholder="All Customers" clearable />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Item</label>
            <SearchableSelect value={filters.items} onChange={(v) => dispatch({ type: "SET_FILTER", field: "items", value: v })} options={filterOptions.items.map((v) => ({ value: v, label: v }))} placeholder="All Items" clearable />
          </div>
        </div>
      )}
    </div>
  )
}

function SortPopover({ sort, dispatch }: { sort: SortConfig; dispatch: React.Dispatch<TableAction> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", fn)
    return () => document.removeEventListener("mousedown", fn)
  }, [open])

  const sortKeys: SortKey[] = ["event", "customer", "items", "unit", "note", "createdAt", "stage"]

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={TOOLBAR_BTN}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 8 4-4 4 4" /><path d="M7 4v16" /><path d="M17 20V4" /><path d="m13 16 4 4 4-4" />
        </svg>
        {sort ? `${SORT_LABELS[sort.key]} ${sort.direction === "asc" ? "A→Z" : "Z→A"}` : "Sort"}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-cream-border rounded-lg shadow-lg z-50 p-3 space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Column</label>
            <select
              value={sort?.key ?? ""}
              onChange={(e) => e.target.value ? dispatch({ type: "SET_SORT", key: e.target.value as SortKey, direction: sort?.direction ?? "asc" }) : dispatch({ type: "CLEAR_SORT" })}
              className={INPUT_CLASS}
            >
              <option value="">None</option>
              {sortKeys.map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
            </select>
          </div>
          {sort && (
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Direction</label>
              <div className="flex gap-2">
                {(["asc", "desc"] as const).map((dir) => (
                  <button key={dir} type="button" onClick={() => dispatch({ type: "SET_SORT", key: sort.key, direction: dir })}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors ${sort.direction === dir ? "border-brand bg-brand-light text-brand font-medium" : "border-cream-border hover:bg-cream text-gray-600"}`}>
                    {sort.key === "unit" ? (dir === "asc" ? "1 → 9" : "9 → 1") : (dir === "asc" ? "A → Z" : "Z → A")}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sort && (
            <button type="button" onClick={() => { dispatch({ type: "CLEAR_SORT" }); setOpen(false) }} className="w-full text-xs text-gray-400 hover:text-brand transition-colors text-center pt-1">
              Remove sort
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ColumnPopover({ columns, visibility, role, dispatch }: {
  columns: ColumnDef[]
  visibility: Record<ColumnId, boolean>
  role: Role | null
  dispatch: React.Dispatch<TableAction>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", fn)
    return () => document.removeEventListener("mousedown", fn)
  }, [open])

  const toggleable = columns.filter((c) => !c.locked && !(c.ownerOnly && role !== "owner"))

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={TOOLBAR_BTN}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
        </svg>
        Columns
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-cream-border rounded-lg shadow-lg z-50 py-2">
          <p className="px-3 pb-2 text-xs text-gray-400 border-b border-cream-border">Toggle columns</p>
          <div className="py-1 max-h-72 overflow-y-auto">
            {toggleable.map((col) => (
              <label key={col.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-cream cursor-pointer">
                <input type="checkbox" checked={visibility[col.id]} onChange={() => dispatch({ type: "TOGGLE_COLUMN", column: col.id })} className="accent-brand rounded" />
                <span className="text-xs text-foreground">{col.label}</span>
                {col.ownerOnly && <span className="ml-auto text-[10px] text-gray-400">Owner</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filter Chip
// ---------------------------------------------------------------------------

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-cream border border-cream-border text-foreground">
      {label}
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-brand transition-colors ml-0.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function PaginationButton({ children, onClick, disabled = false, active = false }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`min-w-[2rem] h-8 px-2 text-xs rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${active ? "bg-brand text-white font-medium" : "border border-cream-border hover:bg-cream text-gray-600"}`}>
      {children}
    </button>
  )
}

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | "…")[] = [1]
  if (current > 3) pages.push("…")
  const start = Math.max(2, current - 1)
  const end   = Math.min(total - 1, current + 1)
  for (let p = start; p <= end; p++) pages.push(p)
  if (current < total - 2) pages.push("…")
  pages.push(total)
  return pages
}
