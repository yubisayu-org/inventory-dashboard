import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"

export default function OwnerPage() {
  return (
    <PageShell>
      <PageHeader title="Owner" subtitle="Owner access only" />
      <div className="rounded-xl border border-cream-border bg-white p-16 text-center text-gray-400">
        Owner content coming soon
      </div>
    </PageShell>
  )
}
