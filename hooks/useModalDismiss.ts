import { useEffect, useRef } from "react"

/**
 * Registers an Escape keydown listener and locks body scroll for a modal.
 * Uses a stable ref internally so the listener is only added once, even if
 * onDismiss changes identity across renders.
 */
export function useModalDismiss(onDismiss: () => void) {
  const ref = useRef(onDismiss)
  useEffect(() => { ref.current = onDismiss })

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") ref.current() }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [])
}
