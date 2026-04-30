"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAccount } from "wagmi"
import { Button } from "@/components/ui/button"
import { resolveSession } from "@/lib/a0"
import { activeChain } from "@/lib/registry"

export function RegistrationGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { address, isConnecting } = useAccount()
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [needsWallet, setNeedsWallet] = useState(false)

  useEffect(() => {
    setNeedsWallet(false)

    if (pathname === "/onboarding") {
      setAllowed(true)
      setChecking(false)
      return
    }

    if (isConnecting) return

    if (!address) {
      setAllowed(false)
      setChecking(false)
      setNeedsWallet(true)
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

  if (needsWallet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-lg font-bold text-foreground">Wallet required</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Dashboard pages do not redirect automatically anymore. Connect from onboarding to continue.
          </p>
          <Button asChild className="mt-4 w-full">
            <Link href="/onboarding" prefetch={false}>Go to onboarding</Link>
          </Button>
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link href="/" prefetch={false}>Back to landing</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (checking || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        Checking your CounterAgent registration…
      </div>
    )
  }

  return <>{children}</>
}
