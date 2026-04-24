import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import ShipClient from "./ShipClient"

export default function ShipPage() {
  return (
    <PageShell>
      <PageHeader
        title="Ready to Ship"
        subtitle="Orders with arrived units that haven't been shipped yet"
      />
      <ShipClient />
    </PageShell>
  )
}
