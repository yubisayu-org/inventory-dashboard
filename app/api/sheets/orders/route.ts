import { NextRequest, NextResponse } from "next/server"
import { requireSession, requireRole } from "@/lib/api"
import { appendOrder } from "@/lib/sheets"

export async function POST(req: NextRequest) {
  const { session, error: authError } = await requireSession()
  if (authError) return authError

  const roleError = requireRole(session)
  if (roleError) return roleError

  try {
    const body = await req.json()
    const { event, customer, items, unit, note } = body

    if (!event || !customer || !items || !unit) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const orderId = `${event} ${customer}`

    await appendOrder({
      event,
      customer,
      items,
      unit: Number(unit),
      note: note ?? "",
    })

    return NextResponse.json({ success: true, orderId })
  } catch (err) {
    console.error("Sheets append error:", err)
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 })
  }
}
