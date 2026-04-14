import { auth } from "@/auth"
import SidebarClient from "./SidebarClient"

export default async function Sidebar() {
  const session = await auth()
  return (
    <SidebarClient
      user={{
        name: session?.user?.name,
        email: session?.user?.email,
        role: session?.user?.role ?? null,
      }}
    />
  )
}
