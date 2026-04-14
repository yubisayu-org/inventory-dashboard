import Sidebar from "@/components/Navbar"

interface Props {
  children: React.ReactNode
  narrow?: boolean
}

export default function PageShell({ children, narrow = false }: Props) {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar />
      <main className={`flex-1 min-w-0 ${narrow ? "max-w-3xl" : ""} px-6 py-10`}>
        {children}
      </main>
    </div>
  )
}
