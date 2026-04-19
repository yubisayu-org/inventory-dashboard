"use client"

import { useEffect, useState } from "react"
import { copyToClipboard } from "@/lib/clipboard"

export function useCopyFeedback(resetMs = 1500) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), resetMs)
    return () => clearTimeout(timer)
  }, [copied, resetMs])

  async function copy(text: string) {
    await copyToClipboard(text)
    setCopied(true)
  }

  return { copied, copy }
}
