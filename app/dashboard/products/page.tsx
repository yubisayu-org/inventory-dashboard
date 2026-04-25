import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import ProductsClient from "./ProductsClient"

export default function ProductsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Products"
        subtitle="Manage the Product_Indo catalogue"
      />
      <ProductsClient />
    </PageShell>
  )
}
