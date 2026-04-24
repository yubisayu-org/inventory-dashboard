"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { signOutAction } from "@/lib/auth-actions"
import { Role } from "@/lib/roles"

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
}

const NAV_LINKS: { href: string; label: string; roles: Role[]; icon: React.ReactNode }[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    roles: ["admin", "owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: "/dashboard/form-records",
    label: "Form Records",
    roles: ["admin", "owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/duplicate-form",
    label: "List Order",
    roles: ["admin", "owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
  },
  {
    href: "/dashboard/purchasing",
    label: "Purchasing",
    roles: ["admin", "owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    href: "/dashboard/arrive",
    label: "Unit Arrive",
    roles: ["admin", "owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20" /><path d="m17 15-5 5-5-5" />
        <path d="M2 12h4" /><path d="M18 12h4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/ship",
    label: "Ready to Ship",
    roles: ["admin", "owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
        <rect x="9" y="11" width="14" height="10" rx="1" />
        <path d="m12 17 3-3 3 3" />
        <path d="M15 14v6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/excess-purchase",
    label: "Excess Purchase",
    roles: ["admin", "owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M9 13v4" />
        <path d="M15 13v4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/invoice",
    label: "Invoice",
    roles: ["admin", "owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    ),
  },
  {
    href: "/owner",
    label: "Owner",
    roles: ["owner"],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

interface Props {
  user: {
    name?: string | null
    email?: string | null
    role: Role | null
  }
}

export default function SidebarClient({ user }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const visibleLinks = NAV_LINKS.filter((l) => user.role && l.roles.includes(user.role))

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?"

  return (
    <aside
      className={`
        flex flex-col shrink-0 h-screen sticky top-0 bg-white border-r border-cream-border
        transition-all duration-200 ease-in-out
        ${collapsed ? "w-14" : "w-56"}
      `}
    >
      {/* Logo + toggle */}
      <div className="flex items-center h-14 px-3 border-b border-cream-border gap-2">
        <div className="w-7 h-7 shrink-0 rounded bg-brand flex items-center justify-center">
          <span className="text-white text-xs font-bold">Y</span>
        </div>
        {!collapsed && (
          <span className="font-semibold text-foreground text-sm truncate flex-1">Yubisayu</span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto text-gray-400 hover:text-brand transition-colors p-1 rounded"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2 overflow-y-auto">
        {visibleLinks.map((link) => {
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              className={`
                flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors
                ${isActive
                  ? "bg-brand-light text-brand font-medium"
                  : "text-gray-600 hover:bg-brand-light hover:text-brand"
                }
                ${collapsed ? "justify-center" : ""}
              `}
            >
              <span className="shrink-0">{link.icon}</span>
              {!collapsed && <span className="truncate">{link.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Profile + sign out */}
      <div className="border-t border-cream-border p-3">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div
            className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-xs font-semibold shrink-0"
            title={collapsed ? user.name ?? undefined : undefined}
          >
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">
                {user.role ? ROLE_LABELS[user.role] : "User"}
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-brand-light hover:text-brand transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </form>
        )}
        {collapsed && (
          <form action={signOutAction} className="mt-2 flex justify-center">
            <button
              type="submit"
              title="Sign out"
              className="text-gray-400 hover:text-brand transition-colors p-1 rounded"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </form>
        )}
      </div>
    </aside>
  )
}
