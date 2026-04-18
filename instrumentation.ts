export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getDuplicateFormRows } = await import("./lib/sheets")
    // Fire-and-forget: pre-warm the Google OAuth token so the first real
    // request doesn't pay the auth round-trip cost.
    getDuplicateFormRows().catch(() => {})
  }
}
