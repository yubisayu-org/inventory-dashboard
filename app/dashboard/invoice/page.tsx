import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import InvoiceClient from "./InvoiceClient"

export default function InvoicePage() {
  return (
    <PageShell>
      <PageHeader
        title="Invoice"
        subtitle="Look up a customer's orders and invoice totals"
      />
      <InvoiceClient />
    </PageShell>
  )
}
