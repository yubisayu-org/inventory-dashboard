import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import ArriveClient from "./ArriveClient"

export default function ArrivePage() {
  return (
    <PageShell>
      <PageHeader
        title="Unit Arrive"
        subtitle="Bulk update unit arrive for received items"
      />
      <ArriveClient />
    </PageShell>
  )
}
