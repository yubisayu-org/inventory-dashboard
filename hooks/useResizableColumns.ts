"use client"

import { useCallback, useRef, useState } from "react"

/**
 * Tracks per-column pixel widths and provides a stable mousedown handler
 * that lets the user drag to resize any column.
 *
 * Usage:
 *   const { widths, startResize } = useResizableColumns({ name: 160, age: 80 })
 *   // In <th>: style={{ width: widths.name }} + onMouseDown={(e) => startResize("name", e)}
 */
export function useResizableColumns(
  initial: Record<string, number>,
): {
  widths: Record<string, number>
  startResize: (key: string, e: React.MouseEvent) => void
} {
  const [widths, setWidths] = useState(initial)
  const widthsRef = useRef(widths)
  widthsRef.current = widths

  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widthsRef.current[key] ?? 100

    function onMouseMove(ev: MouseEvent) {
      const newW = Math.max(40, startW + ev.clientX - startX)
      setWidths((prev) => ({ ...prev, [key]: newW }))
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }, [])

  return { widths, startResize }
}
