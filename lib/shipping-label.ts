const FROM_NAME = "YUBISAYU"
const FROM_PHONE = "081-1121-39-111"

export interface ShippingLabelParams {
  event: string
  customer: string
  shippingId: string
  dataDiri: string
  packingLines: string[] // each line: "Item Name x qty"
}

export async function generateShippingLabel(params: ShippingLabelParams): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf")

  const { event, customer, shippingId, dataDiri, packingLines } = params

  // A5 portrait: 148 × 210 mm
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" })

  const margin = 6
  const pageW = 148
  const contentW = pageW - 2 * margin
  const halfW = contentW / 2
  const x = margin

  // ─── Row 1: header ──────────────────────────────────────────────
  const r1Y = margin
  const r1H = 20

  // left cell — event + customer
  doc.rect(x, r1Y, halfW, r1H)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(`${event} ${customer.toUpperCase()}`, x + 2, r1Y + 8)

  // right cell — shipping ID (large)
  doc.rect(x + halfW, r1Y, halfW, r1H)
  doc.setFontSize(30)
  doc.setFont("helvetica", "bold")
  doc.text(shippingId, x + halfW + halfW / 2, r1Y + 14, { align: "center" })

  // ─── Row 2: addresses ────────────────────────────────────────────
  const r2Y = r1Y + r1H + 3
  const r2H = 70

  // TO cell
  doc.rect(x, r2Y, halfW, r2H)
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("TO :", x + 2, r2Y + 8)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  const toLines = doc.splitTextToSize(dataDiri, halfW - 4)
  doc.text(toLines, x + 2, r2Y + 14)

  // FROM cell
  doc.rect(x + halfW, r2Y, halfW, r2H)
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("FROM :", x + halfW + 2, r2Y + 8)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(FROM_NAME, x + halfW + 2, r2Y + 16)
  doc.text(FROM_PHONE, x + halfW + 2, r2Y + 23)

  // ─── Row 3: packing list ─────────────────────────────────────────
  const r3Y = r2Y + r2H + 3
  const r3H = Math.max(20, 10 + packingLines.length * 6)

  doc.rect(x, r3Y, contentW, r3H)
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("PACKING LIST :", x + 2, r3Y + 7)
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "normal")
  packingLines.forEach((line, i) => {
    doc.text(line, x + 2, r3Y + 14 + i * 6)
  })

  return doc.output("blob")
}
