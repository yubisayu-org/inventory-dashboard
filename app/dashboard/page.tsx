import PageShell from "@/components/PageShell"
import PageHeader from "@/components/PageHeader"

export default function DashboardPage() {
  return (
    <PageShell>
      <PageHeader title="Dashboard" subtitle="Admin & Owner access" />
      <div className="rounded-xl border border-cream-border bg-white p-16 text-center text-gray-400">
        Dashboard content coming soon
      </div>
    </PageShell>
  )
}
