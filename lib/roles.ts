export type Role = "owner" | "admin"

function parseEmailList(envVar: string | undefined): string[] {
  return (envVar ?? "").split(",").map((e) => e.trim()).filter(Boolean)
}

// Parse once at module load — these are static for the process lifetime
const OWNER_EMAILS = parseEmailList(process.env.OWNER_EMAILS)
const ADMIN_EMAILS = parseEmailList(process.env.ADMIN_EMAILS)

export function getRole(email: string): Role | null {
  if (OWNER_EMAILS.includes(email)) return "owner"
  if (ADMIN_EMAILS.includes(email)) return "admin"
  return null
}
