import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import OrderForm from "./OrderForm"

export default function InputOrderPage() {
  return (
    <PageShell narrow>
      <PageHeader title="Input Order" subtitle="Add a new order to the database" />
      <div className="bg-white rounded-xl border border-cream-border p-6">
        <OrderForm />
      </div>
    </PageShell>
  )
}
