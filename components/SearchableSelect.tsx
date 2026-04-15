"use client"

import { useState, useRef, useEffect } from "react"

export interface SelectOption {
  value: string
  label: string
  /** Secondary text shown alongside the label (e.g. store name for items) */
  meta?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** Show a clear/reset option at the top of the list that sets value to "" */
  clearable?: boolean
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  clearable = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})

  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selectedLabel = options.find((o) => o.value === value)?.label ?? ""

  const filtered = search
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.meta?.toLowerCase().includes(search.toLowerCase()),
      )
    : options

  function openPopup() {
    if (disabled) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const POPUP_HEIGHT = 288 // search bar ~44px + list ~244px
    const spaceBelow = window.innerHeight - rect.bottom

    if (spaceBelow < POPUP_HEIGHT && rect.top > POPUP_HEIGHT) {
      // flip above
      setPopupStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        width: rect.width,
      })
    } else {
      setPopupStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    }

    setSearch("")
    setOpen(true)
  }

  // Focus search input when popup opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (
        !triggerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  const TRIGGER_CLASS =
    "w-full flex items-center justify-between border border-cream-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPopup}
        disabled={disabled}
        className={TRIGGER_CLASS}
      >
        <span className={value ? "text-foreground truncate" : "text-gray-400"}>
          {selectedLabel || placeholder}
        </span>
        <svg
          className={`ml-2 shrink-0 w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={popupRef}
          style={popupStyle}
          className="z-50 bg-white border border-cream-border rounded-lg shadow-lg overflow-hidden"
        >
          {/* Search bar */}
          <div className="p-2 border-b border-cream-border">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-1.5 text-sm border border-cream-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          {/* Options list */}
          <ul className="max-h-56 overflow-y-auto">
            {clearable && value && !search && (
              <li
                onMouseDown={() => {
                  onChange("")
                  setOpen(false)
                }}
                className="px-3 py-2 text-sm text-gray-400 cursor-pointer hover:bg-brand-light transition-colors"
              >
                {placeholder}
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-400 text-center">
                No results
              </li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt.value}
                  onMouseDown={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-brand-light transition-colors ${
                    value === opt.value
                      ? "bg-brand-light text-brand font-medium"
                      : "text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.meta && (
                    <span className="ml-2 shrink-0 text-xs text-gray-400">
                      {opt.meta}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </>
  )
}
