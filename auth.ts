import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { getRole } from "@/lib/roles"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, account }) {
      if (account && token.email) {
        token.role = getRole(token.email)
      }
      return token
    },
    session({ session, token }) {
      session.user.role = (token.role as import("@/lib/roles").Role | null | undefined) ?? null
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
