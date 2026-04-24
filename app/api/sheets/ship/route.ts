import { NextResponse } from "next/server"
import { requireSession, requireRole } from "@/lib/api"
import { getShipOrders } from "@/lib/sheets"

export async function GET() {
  const { session, error: authError } = await requireSession()
  if (authError) return authError

  const roleError = requireRole(session)
  if (roleError) return roleError

  try {
    const data = await getShipOrders()
    return NextResponse.json(data)
  } catch (err) {
    console.error("Failed to load ready-to-ship orders:", err)
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 })
  }
}
