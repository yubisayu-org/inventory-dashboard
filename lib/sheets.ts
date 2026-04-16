import { google } from "googleapis"

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

// Sheet tab name constants — update here if sheets are renamed
const SHEET_EVENTS = "Events"
const SHEET_PRODUCTS = "Product"
const SHEET_CUSTOMERS = "Customer"
const SHEET_ORDERS = "Duplicate_Form"

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

/** Read all data rows from Duplicate_Form. Returns rows with their 1-based sheet row numbers. */
export async function getDuplicateFormRows(): Promise<FormRow[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_ORDERS}!A2:L`,
  })
  const values = res.data.values ?? []
  return values.map((row, i) => ({
    rowNumber: i + 2, // row 1 is the header
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
