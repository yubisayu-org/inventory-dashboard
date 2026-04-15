import { auth } from "@/auth"
import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import DataTable from "./DataTable"
import type { Role } from "@/lib/roles"

export default async function ListOrderPage() {
  const session = await auth()
  const role = (session?.user?.role ?? null) as Role | null

  return (
    <PageShell>
      <PageHeader
        title="List Order"
        subtitle="View, edit, and delete orders"
      />
      <DataTable role={role} />
    </PageShell>
  )
}
