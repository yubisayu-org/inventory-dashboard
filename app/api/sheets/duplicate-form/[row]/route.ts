import { NextRequest, NextResponse } from "next/server"
import { requireSession, requireRole } from "@/lib/api"
import { updateFormRow, deleteFormRow } from "@/lib/sheets"

type Params = { params: Promise<{ row: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const { session, error: authError } = await requireSession()
  if (authError) return authError

  const roleError = requireRole(session)
  if (roleError) return roleError

  const { row } = await params
  const rowNumber = Number(row)
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    return NextResponse.json({ error: "Invalid row number" }, { status: 400 })
  }

  try {
    const body = await req.json()
    const { event, customer, items, unit, note } = body

    if (!event || !customer || !items || !unit) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    await updateFormRow(rowNumber, {
      event: String(event),
      customer: String(customer),
      items: String(items),
      unit: Number(unit),
      note: note ? String(note) : "",
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Failed to update row:", err)
    return NextResponse.json({ error: "Failed to update row" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error: authError } = await requireSession()
  if (authError) return authError

  const roleError = requireRole(session)
  if (roleError) return roleError

  const { row } = await params
  const rowNumber = Number(row)
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    return NextResponse.json({ error: "Invalid row number" }, { status: 400 })
  }

  try {
    await deleteFormRow(rowNumber)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Failed to delete row:", err)
    return NextResponse.json({ error: "Failed to delete row" }, { status: 500 })
  }
}
