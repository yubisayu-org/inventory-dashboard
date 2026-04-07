import { DefaultSession } from "next-auth"
import { Role } from "@/lib/roles"

declare module "next-auth" {
  interface Session {
    user: {
      role: Role | null
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role | null
  }
}
