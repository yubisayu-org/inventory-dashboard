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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [78, 100] })

  function drawLabel({ event, customer, shippingId, dataDiri, packingLines }: ShippingLabelParams) {
    const topMargin = 4
    const leadingMargin = 4
    const trailingMargin = 4
    const pageW = 78
    const pageH = 100
    const contentW = pageW - leadingMargin - trailingMargin
    const halfW = contentW / 2
    const x = leadingMargin

    // Row 1: event+customer (left) | shipping ID (right)
    const r1Y = topMargin
    const r1H = 16

    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    const r1Lines = doc.splitTextToSize(`${event} ${customer.toUpperCase()}`, halfW - 4)
    doc.text(r1Lines.slice(0, 2), x + 2, r1Y + 7)

    doc.setFontSize(30)
    doc.setFont("helvetica", "bold")
    doc.text(shippingId, x + halfW + halfW / 2, r1Y + 12, { align: "center" })

    // Row 3: PENGIRIM — pinned to bottom
    const r3H = 16
    const r3Y = pageH - r3H

    // Row 2: PENERIMA — fills the space between row 1 and row 3
    const r2Y = r1Y + r1H + 1
    const r2H = r3Y - r2Y - 1

    doc.line(x, r2Y, x + contentW, r2Y)
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("PENERIMA :", x + 2, r2Y + 7)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    const toLines = doc.splitTextToSize(dataDiri, contentW - 4)
    doc.text(toLines, x + 2, r2Y + 13)

    doc.line(x, r3Y, x + contentW, r3Y)
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("PENGIRIM :", x + 2, r3Y + 7)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text(`${FROM_NAME}  ·  ${FROM_PHONE}`, x + 2, r3Y + 12)

    // Row 4: packing list — hidden for now, re-enable by uncommenting
    // const r4Y = r3Y + r3H + 1
    // const lineH = 5
    // const itemsStart = r4Y + 13  // baseline of first item line
    //
    // // Pre-wrap every item at the drawing font
    // doc.setFontSize(10)
    // doc.setFont("helvetica", "bold")
    // const wrappedItems = packingLines.map(line => doc.splitTextToSize(line, contentW - 4))
    // const allLines: string[] = wrappedItems.flat()
    //
    // // Split: how many lines fit on the remaining space of this page
    // const maxLinesPage1 = Math.max(0, Math.floor((pageH - itemsStart) / lineH))
    // const page1Lines = allLines.slice(0, maxLinesPage1)
    // const overflowLines = allLines.slice(maxLinesPage1)
    //
    // // Box fills to page bottom when there's overflow, otherwise sized to content
    // const r4H = overflowLines.length > 0
    //   ? pageH - r4Y
    //   : Math.max(12, 10 + allLines.length * lineH)
    //
    // doc.rect(x, r4Y, contentW, r4H)
    // doc.setFontSize(11)
    // doc.setFont("helvetica", "bold")
    // doc.text("PACKING LIST :", x + 2, r4Y + 7)
    // doc.setFontSize(8)
    // let itemY = itemsStart
    // for (const line of page1Lines) {
    //   doc.text(line, x + 2, itemY)
    //   itemY += lineH
    // }
    //
    // // Continuation pages for overflow items
    // if (overflowLines.length > 0) {
    //   const contMargin = 2
    //   const contHeaderH = 12
    //   const contFirstItem = contMargin + contHeaderH + 1
    //   const maxLinesPerCont = Math.floor((pageH - contFirstItem) / lineH)
    //
    //   let remaining = overflowLines
    //   while (remaining.length > 0) {
    //     doc.addPage([78, 100], "portrait")
    //     const chunk = remaining.slice(0, maxLinesPerCont)
    //     remaining = remaining.slice(maxLinesPerCont)
    //
    //     const boxH = contHeaderH + chunk.length * lineH
    //     doc.rect(contMargin, contMargin, contentW, boxH)
    //     doc.setFontSize(11)
    //     doc.setFont("helvetica", "bold")
    //     doc.text(`PACKING LIST (cont.) — ${shippingId}`, contMargin + 2, contMargin + 7)
    //     doc.setFontSize(10)
    //     let contY = contFirstItem
    //     for (const line of chunk) {
    //       doc.text(line, contMargin + 2, contY)
    //       contY += lineH
    //     }
    //   }
    // }
  }

  for (let i = 0; i < labels.length; i++) {
    if (i > 0) doc.addPage([78, 100], "portrait")
    drawLabel(labels[i])
  }

  return doc.output("blob")
}

export async function generateShippingLabel(params: ShippingLabelParams): Promise<Blob> {
  return generateMultipleShippingLabels([params])
}
