import { auth, signOut } from "@/auth"
import Link from "next/link"
import { Role } from "@/lib/roles"

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
}

const NAV_LINKS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "owner"] },
  { href: "/dashboard/input-order", label: "Input Order", roles: ["admin", "owner"] },
  { href: "/owner", label: "Owner", roles: ["owner"] },
]

export default async function Navbar() {
  const session = await auth()
  const role = session?.user?.role ?? null

  return (
    <nav className="bg-white border-b border-cream-border px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-brand flex items-center justify-center">
            <span className="text-white text-xs font-bold">Y</span>
          </div>
          <span className="font-semibold text-foreground">Yubisayu</span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.filter((l) => role && l.roles.includes(role)).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-brand-light hover:text-brand transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-foreground">{session?.user?.name}</p>
          <p className="text-xs text-gray-500">{session?.user?.email}</p>
        </div>
        {role && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand text-white">
            {ROLE_LABELS[role]}
          </span>
        )}
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        >
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-brand transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  )
}
