import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import ShipmentsClient from "./ShipmentsClient"

export default function ShipmentsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Shipments"
        subtitle="Track all outgoing shipments and update tracking numbers"
      />
      <ShipmentsClient />
    </PageShell>
  )
}
