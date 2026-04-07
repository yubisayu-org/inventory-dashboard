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
 * Append a new order row to the Duplicate_Form sheet.
 * Columns: A=Event, B=Customer, C=Items, D=Unit, E=Note, F=Created At
 */
export async function appendOrder(order: OrderRow): Promise<void> {
  const sheets = getSheetsClient()

  // duplicate_form columns: A=Event, B=Customer, C=Items, D=Unit, E=Note, F=Created At
  // No protected columns — single append call, no pre-read needed
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
      values: [[order.event, order.customer, order.items, order.unit, order.note, createdAt]],
    },
  })
}
