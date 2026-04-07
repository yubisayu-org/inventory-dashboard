import Navbar from "@/components/Navbar"

interface Props {
  children: React.ReactNode
  narrow?: boolean
}

export default function PageShell({ children, narrow = false }: Props) {
  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className={`${narrow ? "max-w-3xl" : "max-w-7xl"} mx-auto px-6 py-10`}>
        {children}
      </main>
    </div>
  )
}
