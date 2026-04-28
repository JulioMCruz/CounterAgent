"use client"

import { useRouter } from "next/navigation"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useAccount } from "wagmi"

export function SessionHeaderActions() {
  const router = useRouter()
  const { handleLogOut } = useDynamicContext()
  const { address } = useAccount()

  if (!address) return null

  async function onLogout() {
    await handleLogOut()
    router.push("/")
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden font-mono text-xs text-header-foreground/60 sm:inline">
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-full border border-header-foreground/20 px-3 py-1.5 text-xs font-semibold text-header-foreground/80 transition hover:bg-header-foreground/10 hover:text-header-foreground"
      >
        Log out
      </button>
    </div>
  )
}
