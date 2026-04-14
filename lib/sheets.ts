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

/** A row read back from the Duplicate_Form sheet, with its 1-based sheet row number. */
export interface FormRow {
  rowNumber: number
  event: string
  customer: string
  items: string
  unit: number
  note: string
  createdAt: string
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

/**
 * Append one or more order rows to the Duplicate_Form sheet in a single API call.
 * Columns: A=Event, B=Customer, C=Items, D=Unit, E=Note, F=Created At
 */
export async function appendOrders(orders: OrderRow[]): Promise<void> {
  if (orders.length === 0) return
  const sheets = getSheetsClient()

  const createdAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

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
    range: `${SHEET_ORDERS}!A2:F`,
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
  }))
}

/**
 * Overwrite columns A–E of a specific row (preserves Created At in column F).
 * rowNumber is 1-based (row 2 = first data row).
 */
export async function updateFormRow(
  rowNumber: number,
  data: Pick<FormRow, "event" | "customer" | "items" | "unit" | "note">,
): Promise<void> {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_ORDERS}!A${rowNumber}:E${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[data.event, data.customer, data.items, data.unit, data.note]],
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
