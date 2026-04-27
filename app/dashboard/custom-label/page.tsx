import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"
import CustomLabelClient from "./CustomLabelClient"

export default function CustomLabelPage() {
  return (
    <PageShell>
      <PageHeader
        title="Custom Label"
        subtitle="Generate a custom shipping label with any recipient and shipping ID"
      />
      <CustomLabelClient />
    </PageShell>
  )
}
