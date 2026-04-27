const FROM_NAME = "YUBISAYU"
const FROM_PHONE = "081-1121-39-111"

export interface ShippingLabelParams {
  event: string
  customer: string
  shippingId: string
  dataDiri: string
  packingLines: string[] // each line: "Item Name x qty"
}

export async function generateMultipleShippingLabels(labels: ShippingLabelParams[]): Promise<Blob> {
  if (labels.length === 0) throw new Error("No labels to generate")

  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" })

  function drawLabel({ event, customer, shippingId, dataDiri, packingLines }: ShippingLabelParams) {
    const margin = 6
    const pageW = 148
    const contentW = pageW - 2 * margin
    const halfW = contentW / 2
    const x = margin

    // Row 1: event+customer (left) | shipping ID (right)
    const r1Y = margin
    const r1H = 20

    doc.rect(x, r1Y, halfW, r1H)
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.text(`${event} ${customer.toUpperCase()}`, x + 2, r1Y + 8)

    doc.rect(x + halfW, r1Y, halfW, r1H)
    doc.setFontSize(30)
    doc.setFont("helvetica", "bold")
    doc.text(shippingId, x + halfW + halfW / 2, r1Y + 14, { align: "center" })

    // Row 2: TO address — full width, large font
    const r2Y = r1Y + r1H + 3
    const r2H = 60

    doc.rect(x, r2Y, contentW, r2H)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("TO :", x + 2, r2Y + 8)
    doc.setFontSize(12)
    doc.setFont("helvetica", "normal")
    const toLines = doc.splitTextToSize(dataDiri, contentW - 4)
    doc.text(toLines, x + 2, r2Y + 16)

    // Row 3: FROM — full width, compact
    const r3Y = r2Y + r2H + 3
    const r3H = 18

    doc.rect(x, r3Y, contentW, r3H)
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("FROM :", x + 2, r3Y + 7)
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.text(`${FROM_NAME}  ·  ${FROM_PHONE}`, x + 2, r3Y + 14)

    // Row 4: packing list — full width
    const r4Y = r3Y + r3H + 3
    const r4H = Math.max(20, 10 + packingLines.length * 6)

    doc.rect(x, r4Y, contentW, r4H)
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("PACKING LIST :", x + 2, r4Y + 7)
    doc.setFontSize(8.5)
    doc.setFont("helvetica", "normal")
    packingLines.forEach((line, i) => {
      doc.text(line, x + 2, r4Y + 14 + i * 6)
    })
  }

  for (let i = 0; i < labels.length; i++) {
    if (i > 0) doc.addPage("a5", "portrait")
    drawLabel(labels[i])
  }

  return doc.output("blob")
}

export async function generateShippingLabel(params: ShippingLabelParams): Promise<Blob> {
  return generateMultipleShippingLabels([params])
}
