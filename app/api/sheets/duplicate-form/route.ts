import { NextResponse } from "next/server"
import { requireSession, requireRole } from "@/lib/api"
import { getDuplicateFormRows } from "@/lib/sheets"

export async function GET() {
  const { session, error: authError } = await requireSession()
  if (authError) return authError

  const roleError = requireRole(session)
  if (roleError) return roleError

  try {
    const rows = await getDuplicateFormRows()
    return NextResponse.json({ rows })
  } catch (err) {
    console.error("Failed to fetch Duplicate_Form rows:", err)
    return NextResponse.json({ error: "Failed to fetch rows" }, { status: 500 })
  }
}
