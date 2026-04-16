import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import FormRecordsTable from "./FormRecordsTable"

export default function FormRecordsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Form Records"
        subtitle="Full view of all orders in the Duplicate_Form sheet"
      />
      <FormRecordsTable />
    </PageShell>
  )
}
