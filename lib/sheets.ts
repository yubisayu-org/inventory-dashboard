import { google } from "googleapis"

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

// Sheet tab name constants — update here if sheets are renamed
const SHEET_EVENTS = "Events"
const SHEET_PRODUCTS = "Product"
const SHEET_CUSTOMERS = "Customer"
const SHEET_ORDERS = "Duplicate_Form"
const SHEET_INVOICE = "Order_JanganDisort_DifilterAja"
const SHEET_SHIPPING = "Shipping_table"
const SHEET_PRODUCTS_INDO = "Product_Indo"

// Reuse a single client across requests so the OAuth token is cached
// and not re-fetched on every call.
let _sheetsClient: ReturnType<typeof google.sheets> | null = null

function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  _sheetsClient = google.sheets({ version: "v4", auth })
  return _sheetsClient
}

export interface ItemOption {
  name: string
  store: string
  price: number
}

export interface SheetOptions {
  events: string[]
  items: ItemOption[]
  customers: string[]
}

export interface OrderRow {
  event: string
  customer: string
  items: string
  unit: number
  note: string
}

/**
 * A row read back from the Duplicate_Form sheet, with its 1-based sheet row number.
 *
 * Sheet columns:
 *   A=Event, B=Customer, C=Items, D=Unit, E=Note,
 *   F=Created At, G=Updated At,
 *   H=Unit Buy, I=Receipt, J=UnitArrive, K=UnitShip, L=UnitHold
 *
 * Columns H–L are filled by dedicated pages (H, I require owner role);
 * the Input Order / List Order flows leave them untouched.
 */
export interface FormRow {
  rowNumber: number
  event: string
  customer: string
  items: string
  unit: number
  note: string
  createdAt: string
  updatedAt: string
  unitBuy: number | null
  receipt: string
  unitArrive: number | null
  unitShip: number | null
  unitHold: number | null
}

/** Fetch all dropdown options in a single batchGet API call.
 *  Product sheet columns: A=Product, B=Store, C=IDR price
 *  Stores are derived as unique values from column B.
 */
export async function getSheetOptions(): Promise<SheetOptions> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges: [
      `${SHEET_EVENTS}!A2:A`,
      `${SHEET_PRODUCTS}!A2:C`,
      `${SHEET_CUSTOMERS}!A2:A`,
    ],
  })

  const [eventsData, productsData, customersData] = res.data.valueRanges ?? []

  const events = (eventsData?.values ?? []).flat().filter(Boolean) as string[]
  const customers = (customersData?.values ?? [])
    .flat()
    .filter((v) => v && v !== "gantialamat" && !v.startsWith("_old")) as string[]

  const productRows = (productsData?.values ?? []).filter((row) => row[0])
  const items: ItemOption[] = productRows.map((row) => ({
    name: String(row[0]),
    store: String(row[1] ?? ""),
    price: Number(String(row[2] ?? "0").replace(/[^0-9]/g, "")),
  }))

  return { events, items, customers }
}

/** Format a Date as "DD/MM/YYYY, HH.MM.SS" in id-ID locale. */
function formatTimestamp(d: Date = new Date()): string {
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Parse a sheet cell into a number, or null if empty/invalid. */
function parseOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Append one or more order rows to the Duplicate_Form sheet in a single API call.
 * Writes A=Event, B=Customer, C=Items, D=Unit, E=Note, F=Created At.
 * G (Updated At) and H–L (owner/fulfillment columns) are left empty.
 */
export async function appendOrders(orders: OrderRow[]): Promise<void> {
  if (orders.length === 0) return
  const sheets = getSheetsClient()

  const createdAt = formatTimestamp()

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_ORDERS}!A:F`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: orders.map((o) => [o.event, o.customer, o.items, o.unit, o.note, createdAt]),
    },
  })
}

// Cache the numeric sheet tab ID for Duplicate_Form (needed for row deletion).
let _duplicateFormSheetId: number | null = null

async function getDuplicateFormSheetId(): Promise<number> {
  if (_duplicateFormSheetId !== null) return _duplicateFormSheetId
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties",
  })
  const sheet = res.data.sheets?.find((s) => s.properties?.title === SHEET_ORDERS)
  if (sheet?.properties?.sheetId == null) throw new Error(`Sheet "${SHEET_ORDERS}" not found`)
  _duplicateFormSheetId = sheet.properties.sheetId
  return _duplicateFormSheetId
}

/** Read data rows from Duplicate_Form. When `limit` is given, only the last N rows are returned. */
export async function getDuplicateFormRows(limit?: number): Promise<FormRow[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_ORDERS}!A2:L`,
  })
  const allValues = res.data.values ?? []
  // Slice in memory — one API call regardless of limit
  const values = limit && limit > 0 ? allValues.slice(-limit) : allValues
  // 1-based sheet row of the first returned element (row 2 = first data row)
  const startRow = 2 + allValues.length - values.length
  return values.map((row, i) => ({
    rowNumber: startRow + i,
    event: String(row[0] ?? ""),
    customer: String(row[1] ?? ""),
    items: String(row[2] ?? ""),
    unit: Number(row[3] ?? 0),
    note: String(row[4] ?? ""),
    createdAt: String(row[5] ?? ""),
    updatedAt: String(row[6] ?? ""),
    unitBuy: parseOptionalNumber(row[7]),
    receipt: String(row[8] ?? ""),
    unitArrive: parseOptionalNumber(row[9]),
    unitShip: parseOptionalNumber(row[10]),
    unitHold: parseOptionalNumber(row[11]),
  }))
}

/**
 * Overwrite columns A–E and G (Updated At) of a specific row.
 * Preserves F (Created At) and H–L (owner/fulfillment columns) by writing
 * only the two target ranges via batchUpdate.
 * rowNumber is 1-based (row 2 = first data row).
 */
export async function updateFormRow(
  rowNumber: number,
  data: Pick<FormRow, "event" | "customer" | "items" | "unit" | "note">,
): Promise<void> {
  const sheets = getSheetsClient()
  const updatedAt = formatTimestamp()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${SHEET_ORDERS}!A${rowNumber}:E${rowNumber}`,
          values: [[data.event, data.customer, data.items, data.unit, data.note]],
        },
        {
          range: `${SHEET_ORDERS}!G${rowNumber}`,
          values: [[updatedAt]],
        },
      ],
    },
  })
}

/**
 * Update Stage 2 fields (Unit Buy + Receipt) and auto-set Updated At.
 * Preserves all other columns.
 */
export async function updateFormRowStage2(
  rowNumber: number,
  data: { unitBuy: number; receipt: string },
): Promise<void> {
  const sheets = getSheetsClient()
  const updatedAt = formatTimestamp()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${SHEET_ORDERS}!H${rowNumber}:I${rowNumber}`,
          values: [[data.unitBuy, data.receipt]],
        },
        {
          range: `${SHEET_ORDERS}!G${rowNumber}`,
          values: [[updatedAt]],
        },
      ],
    },
  })
}

/**
 * Update Stage 3 fields (UnitArrive, UnitShip, UnitHold) and auto-set Updated At.
 * Preserves all other columns.
 */
export async function updateFormRowStage3(
  rowNumber: number,
  data: { unitArrive: number; unitShip: number; unitHold: number },
): Promise<void> {
  const sheets = getSheetsClient()
  const updatedAt = formatTimestamp()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${SHEET_ORDERS}!J${rowNumber}:L${rowNumber}`,
          values: [[data.unitArrive, data.unitShip, data.unitHold]],
        },
        {
          range: `${SHEET_ORDERS}!G${rowNumber}`,
          values: [[updatedAt]],
        },
      ],
    },
  })
}

const SHEET_EXCESS = "Excess_Purchase"

// Cache the numeric sheet tab ID for Excess_Purchase (needed for row deletion).
let _excessSheetId: number | null = null

async function getExcessSheetId(): Promise<number> {
  if (_excessSheetId !== null) return _excessSheetId
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties",
  })
  const sheet = res.data.sheets?.find((s) => s.properties?.title === SHEET_EXCESS)
  if (sheet?.properties?.sheetId == null) throw new Error(`Sheet "${SHEET_EXCESS}" not found`)
  _excessSheetId = sheet.properties.sheetId
  return _excessSheetId
}

/** Delete a row from Excess_Purchase by its 1-based sheet row number. */
export async function deleteExcessRow(rowNumber: number): Promise<void> {
  const sheets = getSheetsClient()
  const sheetId = await getExcessSheetId()
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1, // 0-based
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  })
}

/** Update the Unit Buy value (column C) of an Excess_Purchase row. */
export async function updateExcessRowUnitBuy(rowNumber: number, unitBuy: number): Promise<void> {
  const sheets = getSheetsClient()
  const updatedAt = formatTimestamp()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${SHEET_EXCESS}!C${rowNumber}`, values: [[unitBuy]] },
        { range: `${SHEET_EXCESS}!F${rowNumber}`, values: [[updatedAt]] },
      ],
    },
  })
}

/**
 * Append excess purchase rows to the Excess_Purchase sheet.
 * Columns: A=Event, B=Items, C=Unit Buy, D=Receipt, E=Created At, F=Updated At
 */
export async function appendExcessPurchase(
  rows: { event: string; items: string; unitBuy: number; receipt: string }[],
): Promise<void> {
  if (rows.length === 0) return
  const sheets = getSheetsClient()
  const createdAt = formatTimestamp()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_EXCESS}!A:F`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows.map((r) => [r.event, r.items, r.unitBuy, r.receipt, createdAt, ""]),
    },
  })
}

export interface ExcessRow {
  rowNumber: number
  event: string
  items: string
  unitBuy: number
  receipt: string
  createdAt: string
  updatedAt: string
}

/** Read all rows from Excess_Purchase. Returns rows with their 1-based sheet row numbers. */
export async function getExcessPurchaseRows(): Promise<ExcessRow[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_EXCESS}!A2:F`,
  })
  const values = res.data.values ?? []
  return values.map((row, i) => ({
    rowNumber: i + 2,
    event: String(row[0] ?? ""),
    items: String(row[1] ?? ""),
    unitBuy: Number(row[2] ?? 0),
    receipt: String(row[3] ?? ""),
    createdAt: String(row[4] ?? ""),
    updatedAt: String(row[5] ?? ""),
  }))
}

export interface PurchaseUpdate {
  rowNumber: number
  unitBuy: number
  receipt: string
}

/**
 * Bulk-write unitBuy + receipt for multiple rows in a single Sheets API call.
 * Also updates the Updated At column for each affected row.
 */
export async function bulkUpdatePurchase(updates: PurchaseUpdate[]): Promise<void> {
  if (updates.length === 0) return
  const sheets = getSheetsClient()
  const updatedAt = formatTimestamp()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map(({ rowNumber, unitBuy, receipt }) => ({
        range: `${SHEET_ORDERS}!G${rowNumber}:I${rowNumber}`,
        values: [[updatedAt, unitBuy, receipt]],
      })),
    },
  })
}

export interface ArriveUpdate {
  rowNumber: number
  unitArrive: number
}

/**
 * Bulk-write unitArrive for multiple rows. Updates the Updated At column too.
 * J (unitArrive) and G (updatedAt) are written as separate ranges per row
 * so the in-between columns H/I (unitBuy, receipt) are not touched.
 */
export async function bulkUpdateArrive(updates: ArriveUpdate[]): Promise<void> {
  if (updates.length === 0) return
  const sheets = getSheetsClient()
  const updatedAt = formatTimestamp()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.flatMap(({ rowNumber, unitArrive }) => [
        { range: `${SHEET_ORDERS}!J${rowNumber}`, values: [[unitArrive]] },
        { range: `${SHEET_ORDERS}!G${rowNumber}`, values: [[updatedAt]] },
      ]),
    },
  })
}

/**
 * Delete a row from Duplicate_Form by its 1-based sheet row number.
 * All subsequent rows shift up automatically.
 */
export async function deleteFormRow(rowNumber: number): Promise<void> {
  const sheets = getSheetsClient()
  const sheetId = await getDuplicateFormSheetId()
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1, // 0-based
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  })
}

// ---------- Invoice (Order_JanganDisort_DifilterAja) ----------
//
// Column layout:
//   A=Event, B=Customer, C=Items, D=Unit, E=Note,
//   F=CreatedAt, G=UpdatedAt, H=UnitBuy, I=Receipt,
//   J=UnitArrive, K=UnitShip, L=UnitHold,
//   M=OrderID, N=Price, O=Store, P=ForInvoicing,
//   Q=Subtotal, R=Ongkir(per kg), S=Berat, T=Berat*Unit,
//   U=ForPackingList, V=Pembayaran,
//   W=ETA, X=Status, Y=TanggalKirim, Z=Resi, AA=Lainnya,
//   AB=Total, AC=SisaPelunasan, AD=SubTotalBarang, AE=Invoice_DM
const INV = {
  EVENT: 0,
  CUSTOMER: 1,
  ORDER: 2,
  UNIT: 3,
  UNIT_ARRIVE: 9,
  UNIT_SHIP: 10,
  PRICE: 13,
  FOR_INVOICING: 15,
  SUBTOTAL: 16,
  ONGKIR: 17,
  BERAT_UNIT: 19,
  PEMBAYARAN: 21,
  ETA: 22,
  STATUS: 23,
  TANGGAL_KIRIM: 24,
  RESI: 25,
  BIAYA_LAINNYA: 26,
  TOTAL: 27,
  SISA_PELUNASAN: 28,
  SUBTOTAL_BARANG: 29,
} as const

export interface InvoiceOrderLine {
  order: string
  unit: number
  price: string
  subtotal: string
  unitArrive: number
}

export interface InvoiceShipment {
  resi: string
  tanggalKirim: string
}

export interface InvoiceEvent {
  eventId: string
  eta: string
  status: string
  shipments: InvoiceShipment[]
  showShipments: boolean
  orders: InvoiceOrderLine[]
  totals: { unit: number; subtotal: number; arrive: number; weightKg: number }
  invoice: {
    subtotalBarang: number
    estimasiOngkir: number
    ongkirPerKg: number
    biayaLainnya: number
    total: number
    pembayaran: number
    sisaPelunasan: number
  }
  message: string
}

export interface ShipOrderLine {
  rowNumber: number
  event: string
  items: string
  rawOrder: string
  unit: number
  unitArrive: number
  unitShip: number
  toShip: number
}

export interface ShipCustomer {
  customer: string
  event: string
  customerDetail: CustomerDetail | null
  orders: ShipOrderLine[]
  totalToShip: number
  weightKg: number
  ongkirPerKg: number
}

export interface CustomerDetail {
  whatsapp: string
  dataDiri: string
  ekspedisi: string
  ongkosKirim: number
}

export interface InvoiceResult {
  customer: string
  customerDetail: CustomerDetail | null
  events: InvoiceEvent[]
}

/** True when the cell is empty or a placeholder ("N/A", "#N/A", "-"). */
function isBlankCell(v: unknown): boolean {
  if (v == null) return true
  const s = String(v).trim()
  if (s === "") return true
  const u = s.toUpperCase()
  return u === "N/A" || u === "#N/A" || u === "-"
}

function parseInvoiceNum(v: unknown): number {
  if (isBlankCell(v)) return 0
  return parseFloat(String(v).replace(/,/g, "")) || 0
}

/** Read a string cell, returning "" for blank/placeholder values. */
function readStringCell(v: unknown): string {
  return isBlankCell(v) ? "" : String(v).trim()
}

/** Strip leading apostrophe variants Sheets prepends to force text formatting. */
function cleanResi(s: string): string {
  return s.trim().replace(/^[\u0027\u2018\u2019\u02B9\u0060]+/, "")
}

function parseShipments(
  resiRaw: string,
  tanggalRaw: string,
  status: string,
): { shipments: InvoiceShipment[]; showShipments: boolean } {
  const resiList = resiRaw ? resiRaw.split("\n").map(cleanResi).filter(Boolean) : []
  const tanggalList = tanggalRaw
    ? tanggalRaw.split("\n").map((s) => s.trim()).filter(Boolean)
    : []
  const shipments = resiList.map((resi, i) => ({ resi, tanggalKirim: tanggalList[i] || "" }))
  const showShipments =
    shipments.length > 0 && (status === "Completed" || status.includes("Shipped"))
  return { shipments, showShipments }
}

function formatIdrNumber(n: number | null | undefined): string {
  const v = Number(n)
  return new Intl.NumberFormat("id-ID").format(Number.isFinite(v) ? v : 0)
}

function buildInvoiceMessage(
  event: Omit<InvoiceEvent, "message">,
  customer: string,
): string {
  const { orders, totals, invoice } = event
  const handle = customer.startsWith("@") ? customer : `@${customer}`
  const produkLines = orders.map((o) => o.order).join("\n")

  const perKgCandidate = Number(invoice.ongkirPerKg)
  const perKg =
    Number.isFinite(perKgCandidate) && perKgCandidate > 0
      ? perKgCandidate
      : totals.weightKg > 0
        ? Math.round(invoice.estimasiOngkir / totals.weightKg)
        : 0

  return [
    "INVOICE",
    `${event.eventId} ${handle}`,
    "",
    "Produk:",
    produkLines,
    "",
    `Subtotal Barang: Rp ${formatIdrNumber(invoice.subtotalBarang)}`,
    `Estimasi Ongkir: ${formatIdrNumber(totals.weightKg)} kg x Rp ${formatIdrNumber(perKg)}`,
    "",
    `Pelunasan: Rp ${formatIdrNumber(invoice.sisaPelunasan)}`,
    "",
    "Rekening an Shinta Michiko:",
    "Bank Jago (Artos) 103382719370",
    "Bank Central Asia 4419051991 ",
    "",
    "Apabila memesan lebih dari 1 barang, transfer boleh digabung.",
    "",
    "Cek rekapan mandiri https://yubisayu-invoice.netlify.app/",
    "",
    "Jika ada kesalahan/kekurangan rekap, mohon infokan kembali untuk direvisi.",
  ].join("\n")
}

function buildInvoiceEvents(
  rows: string[][],
  ongkirPerKg: number,
  customer: string,
): InvoiceEvent[] {
  const groups: Record<string, string[][]> = {}
  const order: string[] = []
  for (const row of rows) {
    const eid = row[INV.EVENT] || ""
    if (!groups[eid]) {
      groups[eid] = []
      order.push(eid)
    }
    groups[eid].push(row)
  }

  return order.map((eid) => {
    const group = groups[eid]

    const orders: InvoiceOrderLine[] = group.map((row) => ({
      order: readStringCell(row[INV.FOR_INVOICING]) || readStringCell(row[INV.ORDER]),
      unit: parseInvoiceNum(row[INV.UNIT]),
      price: readStringCell(row[INV.PRICE]),
      subtotal: readStringCell(row[INV.SUBTOTAL]),
      unitArrive: parseInvoiceNum(row[INV.UNIT_ARRIVE]),
    }))

    const totalUnit = orders.reduce((s, o) => s + o.unit, 0)
    const totalSubtotal = group.reduce((s, r) => s + parseInvoiceNum(r[INV.SUBTOTAL]), 0)
    const totalArrive = orders.reduce((s, o) => s + o.unitArrive, 0)
    const totalBeratUnit = group.reduce((s, r) => s + parseInvoiceNum(r[INV.BERAT_UNIT]), 0)
    const weightKg = Math.ceil(totalBeratUnit / 1000)
    const estimasiOngkir = ongkirPerKg * weightKg

    // Invoice totals: prefer the first row that actually has the value filled,
    // not blindly row[0] (which can be "N/A" when only one row of the event has
    // the summary columns populated).
    const firstWith = (idx: number): string | undefined =>
      group.find((r) => !isBlankCell(r[idx]))?.[idx]

    const subtotalBarang = parseInvoiceNum(firstWith(INV.SUBTOTAL_BARANG))
    const biayaLainnya = parseInvoiceNum(firstWith(INV.BIAYA_LAINNYA))
    const total = parseInvoiceNum(firstWith(INV.TOTAL))
    const pembayaran = parseInvoiceNum(firstWith(INV.PEMBAYARAN))
    const sisaPelunasan = parseInvoiceNum(firstWith(INV.SISA_PELUNASAN))

    const status = readStringCell(firstWith(INV.STATUS))
    const { shipments, showShipments } = parseShipments(
      readStringCell(firstWith(INV.RESI)),
      readStringCell(firstWith(INV.TANGGAL_KIRIM)),
      status,
    )

    const base = {
      eventId: eid,
      eta: readStringCell(firstWith(INV.ETA)),
      status,
      shipments,
      showShipments,
      orders,
      totals: { unit: totalUnit, subtotal: totalSubtotal, arrive: totalArrive, weightKg },
      invoice: {
        subtotalBarang: subtotalBarang || totalSubtotal,
        estimasiOngkir,
        ongkirPerKg,
        biayaLainnya,
        total,
        pembayaran,
        sisaPelunasan,
      },
    }
    return { ...base, message: buildInvoiceMessage(base, customer) }
  })
}

/**
 * Look up invoice data for a given customer (Instagram handle) across all events.
 * Reads the full sheet, filters by customer match (case-insensitive, ignoring @),
 * then groups by Event.
 */
let _customerRowsCache: { rows: string[][]; ts: number } | null = null
let _invoiceRowsCache: { rows: string[][]; ts: number } | null = null
const INVOICE_CACHE_TTL = 60_000

async function getCustomerRows(): Promise<string[][]> {
  const now = Date.now()
  if (_customerRowsCache && now - _customerRowsCache.ts < INVOICE_CACHE_TTL) {
    return _customerRowsCache.rows
  }
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_CUSTOMERS}!A2:E`,
  })
  const rows = (res.data.values ?? []) as string[][]
  _customerRowsCache = { rows, ts: now }
  return rows
}

export async function lookupCustomerDetail(instagramId: string): Promise<CustomerDetail | null> {
  const rows = await getCustomerRows()
  const searchId = instagramId.replace(/^@/, "").toLowerCase()
  const row = rows.find((r) => String(r[0] ?? "").replace(/^@/, "").toLowerCase() === searchId)
  if (!row) return null
  return {
    whatsapp: String(row[1] ?? ""),
    dataDiri: String(row[2] ?? ""),
    ekspedisi: String(row[3] ?? ""),
    ongkosKirim: Number(String(row[4] ?? "0").replace(/[^0-9]/g, "")) || 0,
  }
}

async function getInvoiceRows(): Promise<string[][]> {
  const now = Date.now()
  if (_invoiceRowsCache && now - _invoiceRowsCache.ts < INVOICE_CACHE_TTL) {
    return _invoiceRowsCache.rows
  }
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_INVOICE}!A2:AF`,
  })
  const rows = (res.data.values ?? []) as string[][]
  _invoiceRowsCache = { rows, ts: now }
  return rows
}

export async function getInvoiceForCustomer(instagramId: string): Promise<InvoiceResult> {
  const [rows, customerDetail] = await Promise.all([
    getInvoiceRows(),
    lookupCustomerDetail(instagramId),
  ])
  if (rows.length === 0) return { customer: "", customerDetail: null, events: [] }

  const searchId = instagramId.replace(/^@/, "").toLowerCase()
  const matching = rows.filter((row) => {
    if (!row || row.every((c) => !c || String(c).trim() === "")) return false
    const rowIg = String(row[INV.CUSTOMER] || "").replace(/^@/, "").toLowerCase()
    return rowIg === searchId
  })

  if (matching.length === 0) return { customer: "", customerDetail, events: [] }

  const customer = readStringCell(matching[0][INV.CUSTOMER])
  // Some rows leave Ongkir blank or "N/A" — scan until we find the real per-kg rate.
  const ongkirCell = matching.find((r) => !isBlankCell(r[INV.ONGKIR]))?.[INV.ONGKIR]
  const ongkirPerKg = parseInvoiceNum(ongkirCell)
  return { customer, customerDetail, events: buildInvoiceEvents(matching, ongkirPerKg, customer) }
}

export async function getShipOrders(): Promise<ShipCustomer[]> {
  const [invoiceRows, customerRows] = await Promise.all([
    getInvoiceRows(),
    getCustomerRows(),
  ])

  const detailMap = new Map<string, CustomerDetail>()
  for (const row of customerRows) {
    const id = String(row[0] ?? "").replace(/^@/, "").toLowerCase()
    if (id) {
      detailMap.set(id, {
        whatsapp: String(row[1] ?? ""),
        dataDiri: String(row[2] ?? ""),
        ekspedisi: String(row[3] ?? ""),
        ongkosKirim: Number(String(row[4] ?? "0").replace(/[^0-9]/g, "")) || 0,
      })
    }
  }

  // All rows with a customer and event — track actual sheet row (index + 2, header is row 1)
  type ActiveRow = { row: string[]; sheetRow: number }
  const active: ActiveRow[] = invoiceRows
    .map((row, idx) => ({ row, sheetRow: idx + 2 }))
    .filter(({ row }) => {
      if (!row || row.every((c) => !c || String(c).trim() === "")) return false
      return !isBlankCell(row[INV.CUSTOMER]) && !isBlankCell(row[INV.EVENT])
    })

  const groupMap = new Map<string, { customer: string; event: string; rows: ActiveRow[] }>()
  for (const item of active) {
    const customer = readStringCell(item.row[INV.CUSTOMER])
    const event = readStringCell(item.row[INV.EVENT])
    const key = `${customer.replace(/^@/, "").toLowerCase()}|${event}`
    if (!groupMap.has(key)) groupMap.set(key, { customer, event, rows: [] })
    groupMap.get(key)!.rows.push(item)
  }

  return Array.from(groupMap.values()).map(({ customer, event, rows }) => {
    const customerKey = customer.replace(/^@/, "").toLowerCase()
    const orders: ShipOrderLine[] = rows.map(({ row, sheetRow }) => {
      const unitArrive = parseInvoiceNum(row[INV.UNIT_ARRIVE])
      const unitShip = parseInvoiceNum(row[INV.UNIT_SHIP])
      return {
        rowNumber: sheetRow,
        event,
        items: readStringCell(row[INV.FOR_INVOICING]) || readStringCell(row[INV.ORDER]),
        rawOrder: readStringCell(row[INV.ORDER]),
        unit: parseInvoiceNum(row[INV.UNIT]),
        unitArrive,
        unitShip,
        toShip: Math.max(0, unitArrive - unitShip),
      }
    })
    const totalBeratUnit = rows.reduce((s, { row }) => s + parseInvoiceNum(row[INV.BERAT_UNIT]), 0)
    const weightKg = Math.ceil(totalBeratUnit / 1000)
    const ongkirPerKg = parseInvoiceNum(
      rows.find(({ row }) => !isBlankCell(row[INV.ONGKIR]))?.row[INV.ONGKIR]
    )
    return {
      customer,
      event,
      customerDetail: detailMap.get(customerKey) ?? null,
      orders,
      totalToShip: orders.reduce((s, o) => s + o.toShip, 0),
      weightKg,
      ongkirPerKg,
    }
  })
}

export interface ShipOrdersParams {
  customer: string
  event: string
  orders: Array<{ rowNumber: number; items: string; rawOrder: string; toShip: number; unitShip: number }>
  weightKg: number
  ongkirPerKg: number
}

export async function shipCustomerOrders(params: ShipOrdersParams): Promise<{ shippingId: string }> {
  const { customer, event, orders, weightKg, ongkirPerKg } = params
  const sheets = getSheetsClient()
  const now = formatTimestamp()
  const existingIds = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_SHIPPING}!C2:C`,
  })
  const maxId = ((existingIds.data.values ?? []) as string[][])
    .map((r) => parseInt(r[0] ?? "0", 10))
    .filter(Number.isFinite)
    .reduce((max, n) => Math.max(max, n), 0)
  const shippingId = String(maxId + 1).padStart(4, "0")

  const toShipRows = orders.filter((o) => o.toShip > 0)
  const invoicingText = toShipRows.map((o) => `${o.rawOrder} x ${o.toShip}`).join("\n")
  const ongkirTotal = ongkirPerKg * weightKg

  // Match orders to Duplicate_Form rows by customer + event + items (column C)
  const duplicateRows = await getDuplicateFormRows()
  const customerKey = customer.replace(/^@/, "").toLowerCase()
  const unitShipUpdates: Array<{ range: string; values: unknown[][] }> = []
  for (const order of toShipRows) {
    const matching = duplicateRows.filter(
      (r) =>
        r.customer.replace(/^@/, "").toLowerCase() === customerKey &&
        r.event === event &&
        r.items === order.rawOrder,
    )
    for (const r of matching) {
      unitShipUpdates.push({
        range: `${SHEET_ORDERS}!K${r.rowNumber}`,
        values: [[(r.unitShip ?? 0) + order.toShip]],
      })
    }
  }

  const ops: Promise<unknown>[] = [
    // Append row to Shipping_table
    sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_SHIPPING}!A:K`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          event, customer, shippingId, invoicingText,
          weightKg, ongkirPerKg, ongkirTotal,
          true, now, "", "",
        ]],
      },
    }),
  ]

  if (unitShipUpdates.length > 0) {
    ops.push(
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: "USER_ENTERED", data: unitShipUpdates },
      }),
    )
  }

  await Promise.all(ops)

  // Invalidate invoice cache so next fetch reflects updated unitShip
  _invoiceRowsCache = null

  return { shippingId }
}

// Shipping_table columns: A=Event, B=Customer, C=ShippingID, D=Invoicing,
// E=weight_estimation, F=ongkir, G=ongkir*weight, H=is_last_shipment,
// I=created_at, J=updated_at, K=tracking_number

export interface ShippingRecord {
  rowNumber: number
  event: string
  customer: string
  shippingId: string
  invoicing: string
  weightEstimation: number
  ongkir: number
  ongkirTotal: number
  isLastShipment: boolean
  createdAt: string
  updatedAt: string
  trackingNumber: string
}

export async function getShippingRecords(): Promise<ShippingRecord[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_SHIPPING}!A2:K`,
  })
  const rows = (res.data.values ?? []) as string[][]
  return rows
    .map((row, i) => ({
      rowNumber: i + 2,
      event: String(row[0] ?? ""),
      customer: String(row[1] ?? ""),
      shippingId: String(row[2] ?? "").padStart(4, "0"),
      invoicing: String(row[3] ?? ""),
      weightEstimation: Number(row[4] ?? 0) || 0,
      ongkir: Number(row[5] ?? 0) || 0,
      ongkirTotal: Number(row[6] ?? 0) || 0,
      isLastShipment: String(row[7] ?? "").toUpperCase() === "TRUE",
      createdAt: String(row[8] ?? ""),
      updatedAt: String(row[9] ?? ""),
      trackingNumber: String(row[10] ?? ""),
    }))
    .filter((r) => r.shippingId)
}

// ─── Product_Indo ────────────────────────────────────────────────────────────
// Lives in a separate Google Spreadsheet (GOOGLE_PRODUCT_INDO_SPREADSHEET_ID).
// Columns: A=Product, B=Store, C=Price

const PRODUCT_INDO_SPREADSHEET_ID = process.env.GOOGLE_PRODUCT_INDO_SPREADSHEET_ID!

export interface ProductIndoRow {
  rowNumber: number
  product: string
  store: string
  price: number
}

export async function getProductIndo(): Promise<ProductIndoRow[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: PRODUCT_INDO_SPREADSHEET_ID,
    range: `${SHEET_PRODUCTS_INDO}!A2:C`,
  })
  return ((res.data.values ?? []) as string[][])
    .map((row, i) => ({
      rowNumber: i + 2,
      product: String(row[0] ?? ""),
      store: String(row[1] ?? ""),
      price: Number(row[2] ?? 0) || 0,
    }))
    .filter((r) => r.product)
}

export async function addProductIndo(data: {
  product: string
  store: string
  price: number
}): Promise<{ rowNumber: number }> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: PRODUCT_INDO_SPREADSHEET_ID,
    range: `${SHEET_PRODUCTS_INDO}!A:C`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[data.product, data.store, data.price]] },
  })
  const match = (res.data.updates?.updatedRange ?? "").match(/A(\d+)/)
  return { rowNumber: match ? Number(match[1]) : 0 }
}

export async function updateProductIndo(
  rowNumber: number,
  data: { product: string; store: string; price: number },
): Promise<void> {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId: PRODUCT_INDO_SPREADSHEET_ID,
    range: `${SHEET_PRODUCTS_INDO}!A${rowNumber}:C${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[data.product, data.store, data.price]] },
  })
}

export async function updateTrackingNumber(
  rowNumber: number,
  trackingNumber: string,
): Promise<void> {
  const sheets = getSheetsClient()
  const updatedAt = formatTimestamp()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${SHEET_SHIPPING}!K${rowNumber}`, values: [[trackingNumber]] },
        { range: `${SHEET_SHIPPING}!J${rowNumber}`, values: [[updatedAt]] },
      ],
    },
  })
}
