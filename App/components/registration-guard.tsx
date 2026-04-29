"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAccount } from "wagmi"
import { resolveSession } from "@/lib/a0"
import { activeChain } from "@/lib/registry"

export function RegistrationGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { address, isConnecting } = useAccount()
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (pathname === "/onboarding") {
      setAllowed(true)
      setChecking(false)
      return
    }

    if (isConnecting) return

    if (!address) {
      setAllowed(false)
      setChecking(false)
      router.replace("/")
      return
    }

    let cancelled = false
    setChecking(true)
    setAllowed(false)

    resolveSession({ walletAddress: address, chainId: activeChain.id })
      .then((session) => {
        if (cancelled) return
        if (session.registered && session.route === "dashboard") {
          setAllowed(true)
          return
        }
        router.replace("/onboarding")
      })
      .catch(() => {
        if (cancelled) return
        router.replace("/onboarding")
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [address, isConnecting, pathname, router])

  if (checking || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        Checking your CounterAgent registration…
      </div>
    )
  }

  return <>{children}</>
}
