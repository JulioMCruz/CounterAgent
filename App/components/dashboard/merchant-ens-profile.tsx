"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { ensNameFromMerchant, resolveSession, shortenAddress, type ResolvedMerchantConfig } from "@/lib/a0"
import { useConnectedWalletAddress } from "@/hooks/use-connected-wallet-address"
import { activeChain } from "@/lib/registry"

const imageFromRecords = (records: Record<string, string> | undefined, keys: string[]) => {
  if (!records) return ""
  for (const key of keys) {
    const value = records[key]?.trim()
    if (value) return value
  }
  return ""
}

const initialsFor = (value: string) => {
  const clean = value.replace(/\.counteragent\.eth$/i, "").replace(/[^a-z0-9]+/gi, " ").trim()
  if (!clean) return "CA"
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function MerchantEnsProfile() {
  const { address } = useConnectedWalletAddress()
  const [merchant, setMerchant] = useState<ResolvedMerchantConfig | undefined>()
  const [cachedEnsRecords, setCachedEnsRecords] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!address) {
      setMerchant(undefined)
      return
    }

    try {
      const cached = window.localStorage.getItem(`counteragent:ens-records:${address.toLowerCase()}`)
      setCachedEnsRecords(cached ? JSON.parse(cached) : {})
    } catch {
      setCachedEnsRecords({})
    }

    let cancelled = false
    resolveSession({ walletAddress: address, chainId: activeChain.id })
      .then((session) => {
        if (!cancelled) setMerchant(session.registered ? session.merchant : undefined)
      })
      .catch(() => {
        if (!cancelled) setMerchant(undefined)
      })

    return () => {
      cancelled = true
    }
  }, [address])

  const profile = useMemo(() => {
    const records = { ...(merchant?.ens?.records ?? {}), ...cachedEnsRecords }
    const name = ensNameFromMerchant(merchant)
    return {
      name,
      wallet: merchant?.walletAddress ?? address,
      avatar: imageFromRecords(records, ["avatar", "counteragent.merchant_image"]),
      header: imageFromRecords(records, ["header", "counteragent.header"]),
      description: records?.description?.trim() || "Merchant treasury profile powered by ENS and CounterAgent.",
    }
  }, [address, cachedEnsRecords, merchant])

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-primary via-header-bg to-secondary lg:h-44">
        {profile.header ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.header} alt={`${profile.name} ENS header`} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.14),transparent)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
      </div>
      <div className="relative px-5 pb-5 pt-0">
        <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-background bg-secondary text-2xl font-black text-foreground shadow-xl">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar} alt={`${profile.name} ENS avatar`} className="h-full w-full object-cover" />
              ) : (
                <span>{initialsFor(profile.name)}</span>
              )}
            </div>
            <div className="pb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ENS Merchant Profile</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">{profile.name}</h1>
              {profile.wallet ? <p className="mt-1 font-mono text-xs text-muted-foreground">{shortenAddress(profile.wallet)}</p> : null}
            </div>
          </div>
          <div className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm">
            {profile.avatar || profile.header ? "ENS media active" : "Default ENS media"}
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{profile.description}</p>
      </div>
    </Card>
  )
}
