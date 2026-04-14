import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import DataTable from "./DataTable"

export default function DuplicateFormPage() {
  return (
    <PageShell>
      <PageHeader
        title="List Order"
        subtitle="View, edit, and delete orders"
      />
      <DataTable />
    </PageShell>
  )
}
