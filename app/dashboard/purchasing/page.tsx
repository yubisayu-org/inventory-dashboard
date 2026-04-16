import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import PurchasingClient from "./PurchasingClient"

export default function PurchasingPage() {
  return (
    <PageShell>
      <PageHeader
        title="Purchasing Form"
        subtitle="Bulk update unit buy for purchased items"
      />
      <PurchasingClient />
    </PageShell>
  )
}
