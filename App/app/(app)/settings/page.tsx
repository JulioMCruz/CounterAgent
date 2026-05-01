"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi"
import { sepolia } from "wagmi/chains"
import { AgentInteractionFlow } from "@/components/agent-interaction-flow"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  ensNameFromMerchant,
  formatBpsAsPercent,
  prepareEnsProfileRecords,
  resolveSession,
  riskToleranceFromRegistryRisk,
  shortenAddress,
  stablecoinSymbolFromAddress,
  telegramDisplayFromMerchant,
  type ResolvedMerchantConfig,
  uploadEnsProfileImage,
} from "@/lib/a0"
import { getFriendlyChainError } from "@/lib/chain-guard"
import { useRequiredChain } from "@/hooks/use-required-chain"
import { merchantRegistryAbi } from "@/lib/merchant-registry-abi"
import {
  activeChain,
  merchantRegistryAddress,
  RiskTolerance,
  stablecoinAddresses,
  type RiskToleranceLabel,
} from "@/lib/registry"
import {
  Wallet,
  FileText,
  TrendingUp,
  Shield,
  Coins,
  MessageCircle,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Image as ImageIcon,
  Link2,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react"

type ConfigRow = {
  icon: LucideIcon
  label: string
  value: string
  color: string
  bg: string
  editable?: boolean
}

const riskLabels = ["Conservative", "Moderate", "Aggressive"] as const
const stablecoinSymbols = ["USDC", "EURC", "USDT"] as const
const ensChain = sepolia

const publicResolverAbi = [
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
] as const

type EnsProfileDraft = {
  merchantImage: string
  header: string
  website: string
  description: string
  twitter: string
  github: string
  discord: string
  telegram: string
  linkedin: string
  instagram: string
  subnames: string[]
}

type EnsImageField = "merchantImage" | "header"
type EnsUploadKind = "avatar" | "header"

const emptyEnsProfile: EnsProfileDraft = {
  merchantImage: "",
  header: "",
  website: "",
  description: "",
  twitter: "",
  github: "",
  discord: "",
  telegram: "",
  linkedin: "",
  instagram: "",
  subnames: [],
}

const friendlyErrorMessage = getFriendlyChainError

const csvToList = (value?: string) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

const ensProfileFromRecords = (records?: Record<string, string>): EnsProfileDraft => ({
  merchantImage: records?.["counteragent.merchant_image"] || records?.avatar || "",
  header: records?.["counteragent.header"] || records?.header || "",
  website: records?.url || "",
  description: records?.description || "",
  twitter: records?.["com.twitter"] || "",
  github: records?.["com.github"] || "",
  discord: records?.["com.discord"] || "",
  telegram: records?.["org.telegram"] || "",
  linkedin: records?.["com.linkedin"] || "",
  instagram: records?.["com.instagram"] || "",
  subnames: csvToList(records?.["counteragent.subnames"]),
})

const ensProfileRequestFromDraft = (draft: EnsProfileDraft) => ({
  merchantImage: draft.merchantImage.trim(),
  header: draft.header.trim(),
  website: draft.website.trim(),
  description: draft.description.trim(),
  socials: {
    twitter: draft.twitter.trim(),
    github: draft.github.trim(),
    discord: draft.discord.trim(),
    telegram: draft.telegram.trim(),
    linkedin: draft.linkedin.trim(),
    instagram: draft.instagram.trim(),
  },
  subnames: draft.subnames.map((name) => name.trim()).filter(Boolean),
})

const equivalentCurrentEnsValue = (records: Record<string, string>, key: string) => {
  if (key === "avatar" || key === "counteragent.merchant_image") {
    return records[key] || records.avatar || records["counteragent.merchant_image"] || ""
  }
  if (key === "header" || key === "counteragent.header") {
    return records[key] || records.header || records["counteragent.header"] || ""
  }
  return records[key] || ""
}

const ensAppRecordsUrl = (name?: string | null) =>
  name && name !== "Not available" ? `https://sepolia.app.ens.domains/${encodeURIComponent(name)}?tab=records` : null

const ensImageSpec = {
  merchantImage: {
    kind: "avatar" as const,
    width: 512,
    height: 512,
    ratioLabel: "1:1 square",
  },
  header: {
    kind: "header" as const,
    width: 1500,
    height: 500,
    ratioLabel: "3:1 banner",
  },
}

async function cropImageFileForEns(file: File, field: EnsImageField) {
  const spec = ensImageSpec[field]
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read this image. Try PNG, JPG, or WebP."))
    }
    img.src = url
  })
  const targetRatio = spec.width / spec.height
  const sourceRatio = image.naturalWidth / image.naturalHeight
  let sx = 0
  let sy = 0
  let sw = image.naturalWidth
  let sh = image.naturalHeight

  if (sourceRatio > targetRatio) {
    sw = Math.round(image.naturalHeight * targetRatio)
    sx = Math.round((image.naturalWidth - sw) / 2)
  } else if (sourceRatio < targetRatio) {
    sh = Math.round(image.naturalWidth / targetRatio)
    sy = Math.round((image.naturalHeight - sh) / 2)
  }

  const canvas = document.createElement("canvas")
  canvas.width = spec.width
  canvas.height = spec.height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available in this browser.")
  context.drawImage(image, sx, sy, sw, sh, 0, 0, spec.width, spec.height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error("Could not prepare image."))), "image/png", 0.92)
  })

  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-${spec.kind}-${spec.width}x${spec.height}.png`, {
    type: "image/png",
  })
}

function riskLabelForForm(value?: number | string | null): RiskToleranceLabel {
  const risk = typeof value === "number" ? value : Number(value)
  if (risk === 0) return "Conservative"
  if (risk === 2) return "Aggressive"
  return "Moderate"
}

function thresholdPercentForForm(value?: number | string | null) {
  const bps = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(bps) || bps <= 0) return "1"
  return String(bps / 100)
}

export default function SettingsPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: activeChain.id })
  const ensPublicClient = usePublicClient({ chainId: ensChain.id })
  const treasuryChainGuard = useRequiredChain(activeChain)
  const ensChainGuard = useRequiredChain(ensChain)
  const { writeContractAsync } = useWriteContract()
  const [merchant, setMerchant] = useState<ResolvedMerchantConfig | undefined>()
  const [registered, setRegistered] = useState(false)
  const [sessionState, setSessionState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [editOpen, setEditOpen] = useState(false)
  const [ensOpen, setEnsOpen] = useState(false)
  const [ensDraft, setEnsDraft] = useState<EnsProfileDraft>(emptyEnsProfile)
  const [ensImagePreviews, setEnsImagePreviews] = useState<Record<EnsImageField, string>>({ merchantImage: "", header: "" })
  const [ensImageFiles, setEnsImageFiles] = useState<Record<EnsImageField, File | null>>({ merchantImage: null, header: null })
  const [draggingImageField, setDraggingImageField] = useState<EnsImageField | null>(null)
  const [uploadingImageField, setUploadingImageField] = useState<EnsImageField | null>(null)
  const [ensSaveState, setEnsSaveState] = useState<"idle" | "preparing" | "switching" | "confirming" | "mining" | "success" | "error">("idle")
  const [ensSaveMessage, setEnsSaveMessage] = useState<string | null>(null)
  const [ensLastTxHash, setEnsLastTxHash] = useState<`0x${string}` | null>(null)
  const [fxThreshold, setFxThresholdState] = useState([1])
  const [riskTolerance, setRiskToleranceState] = useState<RiskToleranceLabel>("Moderate")
  const [preferredStablecoin, setPreferredStablecoinState] = useState<keyof typeof stablecoinAddresses>("USDC")
  const draftRef = useRef({
    fxThresholdPercent: 1,
    riskTolerance: "Moderate" as RiskToleranceLabel,
    preferredStablecoin: "USDC" as keyof typeof stablecoinAddresses,
  })
  const treasuryOptimisticUntilRef = useRef(0)
  const ensOptimisticUntilRef = useRef(0)
  const [saveState, setSaveState] = useState<"idle" | "preparing" | "switching" | "confirming" | "mining" | "success" | "error">("idle")
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null)

  const loadSession = useCallback(() => {
    if (!address) {
      setMerchant(undefined)
      setRegistered(false)
      setSessionState("idle")
      return () => undefined
    }

    let cancelled = false
    const effectiveChainId = activeChain.id
    setSessionState("loading")

    console.debug("[CounterAgent Settings] resolving merchant session", {
      walletAddress: address,
      wagmiChainId: chainId,
      effectiveChainId,
      expectedChainId: activeChain.id,
      expectedChainName: activeChain.name,
    })

    resolveSession({ walletAddress: address, chainId: effectiveChainId })
      .then((session) => {
        if (cancelled) return
        console.debug("[CounterAgent Settings] Orchestration Agent /session/resolve response", session)
        if (session.registered && !session.merchant?.ensName && !session.merchant?.merchantEns) {
          console.debug(
            "[CounterAgent Settings] ENS name missing from Orchestration Agent merchant payload; Settings can show registry values but needs Orchestration/ENS Monitor Agent profile enrichment for wallet -> ENS name",
            session.merchant
          )
        }
        setRegistered(session.registered)
        setMerchant((current) => {
          const now = Date.now()
          if (current && (now < treasuryOptimisticUntilRef.current || now < ensOptimisticUntilRef.current)) return current
          return session.registered ? session.merchant : undefined
        })
        setSessionState("ready")
      })
      .catch((error) => {
        if (cancelled) return
        console.error("[CounterAgent Settings] failed to resolve merchant session", error)
        setRegistered(false)
        setMerchant(undefined)
        setSessionState("error")
      })

    return () => {
      cancelled = true
    }
  }, [address, chainId])

  useEffect(() => loadSession(), [loadSession])

  const resetDraftFromMerchant = useCallback(() => {
    const nextFxThresholdPercent = Number(thresholdPercentForForm(merchant?.fxThresholdBps))
    const nextRiskTolerance = riskLabelForForm(merchant?.risk)
    const nextPreferredStablecoin = stablecoinSymbolFromAddress(merchant?.preferredStablecoin) as keyof typeof stablecoinAddresses

    draftRef.current = {
      fxThresholdPercent: nextFxThresholdPercent,
      riskTolerance: nextRiskTolerance,
      preferredStablecoin: nextPreferredStablecoin,
    }
    setFxThresholdState([nextFxThresholdPercent])
    setRiskToleranceState(nextRiskTolerance)
    setPreferredStablecoinState(nextPreferredStablecoin)
  }, [merchant])

  useEffect(() => {
    if (!editOpen) resetDraftFromMerchant()
  }, [editOpen, resetDraftFromMerchant])

  const openEditDialog = () => {
    resetDraftFromMerchant()
    setSaveState("idle")
    setSaveMessage(null)
    setLastTxHash(null)
    setEditOpen(true)
  }

  const resetEnsDraftFromMerchant = useCallback(() => {
    setEnsDraft(ensProfileFromRecords(merchant?.ens?.records))
    setEnsImagePreviews({ merchantImage: "", header: "" })
    setEnsImageFiles({ merchantImage: null, header: null })
    setDraggingImageField(null)
    setUploadingImageField(null)
  }, [merchant])

  const openEnsDialog = () => {
    resetEnsDraftFromMerchant()
    setEnsSaveState("idle")
    setEnsSaveMessage(null)
    setEnsLastTxHash(null)
    setEnsOpen(true)
  }

  const updateEnsDraft = (patch: Partial<EnsProfileDraft>) => {
    setEnsDraft((current) => ({ ...current, ...patch }))
  }

  const updateEnsImageUrl = (field: EnsImageField, value: string) => {
    setEnsImagePreviews((current) => ({ ...current, [field]: "" }))
    setEnsImageFiles((current) => ({ ...current, [field]: null }))
    updateEnsDraft({ [field]: value } as Partial<EnsProfileDraft>)
  }

  const previewEnsImageFile = async (field: EnsImageField, file?: File) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setEnsSaveState("error")
      setEnsSaveMessage("Please choose an image file for the ENS preview.")
      return
    }

    if (file.size > 10_000_000) {
      setEnsSaveState("error")
      setEnsSaveMessage("ENS recommends profile images stay under 10MB.")
      return
    }

    const preparedFile = await cropImageFileForEns(file, field)
    const previewUrl = URL.createObjectURL(preparedFile)
    setEnsImagePreviews((current) => ({ ...current, [field]: previewUrl }))
    setEnsImageFiles((current) => ({ ...current, [field]: preparedFile }))
    setEnsSaveState("idle")
    setEnsSaveMessage(null)
  }

  const clearEnsImage = (field: EnsImageField) => {
    setEnsImagePreviews((current) => ({ ...current, [field]: "" }))
    setEnsImageFiles((current) => ({ ...current, [field]: null }))
    updateEnsDraft({ [field]: "" } as Partial<EnsProfileDraft>)
  }

  const uploadEnsImage = async (field: EnsImageField, fileOverride?: File) => {
    const file = fileOverride ?? ensImageFiles[field]
    if (!file) return

    try {
      setUploadingImageField(field)
      setEnsSaveState("idle")
      setEnsSaveMessage(null)
      const result = await uploadEnsProfileImage({ file, kind: ensImageSpec[field].kind as EnsUploadKind })
      updateEnsDraft({ [field]: result.url } as Partial<EnsProfileDraft>)
      setEnsImagePreviews((current) => ({ ...current, [field]: result.url }))
      setEnsImageFiles((current) => ({ ...current, [field]: null }))
      setEnsSaveMessage(`Uploaded ${field === "merchantImage" ? "avatar" : "header"} via ENS Monitor Agent: ${result.ipfsUri}`)
      return result.url
    } catch (error) {
      console.error("[CounterAgent Settings] ENS image upload failed", error)
      setEnsSaveState("error")
      setEnsSaveMessage(error instanceof Error ? error.message : "ENS image upload failed.")
      throw error
    } finally {
      setUploadingImageField(null)
    }
  }

  const updateSubname = (index: number, value: string) => {
    setEnsDraft((current) => ({
      ...current,
      subnames: current.subnames.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }))
  }

  const addSubname = () => {
    setEnsDraft((current) => ({ ...current, subnames: [...current.subnames, ""] }))
  }

  const removeSubname = (index: number) => {
    setEnsDraft((current) => ({ ...current, subnames: current.subnames.filter((_, itemIndex) => itemIndex !== index) }))
  }

  const setFxThreshold = (value: number[]) => {
    const next = value[0] ?? draftRef.current.fxThresholdPercent
    draftRef.current.fxThresholdPercent = next
    setFxThresholdState([next])
  }

  const setRiskTolerance = (value: RiskToleranceLabel) => {
    draftRef.current.riskTolerance = value
    setRiskToleranceState(value)
  }

  const setPreferredStablecoin = (value: keyof typeof stablecoinAddresses) => {
    draftRef.current.preferredStablecoin = value
    setPreferredStablecoinState(value)
  }

  const networkName = chainId === activeChain.id ? activeChain.name : chainId ? `Chain ${chainId}` : "Network unavailable"
  const walletStatus = !isConnected
    ? "Disconnected"
    : registered
      ? "Connected / registered"
      : sessionState === "loading"
        ? "Connected / checking"
        : "Connected / unregistered"
  const walletStatusClass = registered
    ? "bg-success/20 text-success"
    : isConnected
      ? "bg-warning/20 text-warning-foreground"
      : "bg-secondary text-muted-foreground"

  const treasuryConfig = useMemo<ConfigRow[]>(
    () => [
      {
        icon: FileText,
        label: "ENS Config",
        value: ensNameFromMerchant(merchant),
        color: "text-warning-foreground",
        bg: "bg-warning/10",
        editable: true,
      },
      {
        icon: TrendingUp,
        label: "FX Threshold",
        value: formatBpsAsPercent(merchant?.fxThresholdBps),
        color: "text-chart-3",
        bg: "bg-chart-3/10",
        editable: true,
      },
      {
        icon: Shield,
        label: "Risk Tolerance",
        value: riskToleranceFromRegistryRisk(merchant?.risk),
        color: "text-success",
        bg: "bg-success/10",
        editable: true,
      },
      {
        icon: Coins,
        label: "Preferred Stablecoin",
        value: stablecoinSymbolFromAddress(merchant?.preferredStablecoin),
        color: "text-primary",
        bg: "bg-primary/10",
        editable: true,
      },
    ],
    [merchant]
  )

  const saveTreasuryConfig = async () => {
    setSaveMessage(null)
    setLastTxHash(null)

    if (!address || !registered) {
      setSaveState("error")
      setSaveMessage("Connect a registered merchant wallet first.")
      return
    }
    if (!merchantRegistryAddress) {
      setSaveState("error")
      setSaveMessage("Merchant registry is not configured.")
      return
    }
    if (!merchant?.telegramChatId || !merchant.telegramChatId.startsWith("0x")) {
      setSaveState("error")
      setSaveMessage("Current Telegram alert id is missing from registry config.")
      return
    }

    const draft = draftRef.current
    const percent = draft.fxThresholdPercent
    const fxThresholdBps = Math.round(percent * 100)
    if (!Number.isFinite(percent) || fxThresholdBps <= 0 || fxThresholdBps > 10_000) {
      setSaveState("error")
      setSaveMessage("FX threshold must be between 0.01% and 100%.")
      return
    }

    try {
      setSaveState("preparing")
      setSaveMessage("Orchestration Agent is preparing the treasury config update…")

      setSaveState("switching")
      setSaveMessage(`Please approve the switch to ${activeChain.name} for registry writes…`)
      await treasuryChainGuard.ensureChain()

      setSaveState("confirming")
      setSaveMessage("Confirm treasury config update in your wallet…")
      console.debug("[CounterAgent Settings] submitting MerchantRegistry.update", {
        registry: merchantRegistryAddress,
        fxThresholdBps,
        risk: RiskTolerance[draft.riskTolerance],
        riskTolerance: draft.riskTolerance,
        preferredStablecoin: draft.preferredStablecoin,
        preferredStablecoinAddress: stablecoinAddresses[draft.preferredStablecoin],
        chainId: activeChain.id,
      })

      const hash = await writeContractAsync({
        address: merchantRegistryAddress,
        abi: merchantRegistryAbi,
        functionName: "update",
        args: [
          fxThresholdBps,
          RiskTolerance[draft.riskTolerance],
          stablecoinAddresses[draft.preferredStablecoin],
          merchant.telegramChatId as `0x${string}`,
        ],
        chainId: activeChain.id,
      })

      setLastTxHash(hash)
      setSaveState("mining")
      setSaveMessage("Merchant Registry is confirming the treasury config update…")
      console.debug("[CounterAgent Settings] update tx submitted", { hash })
      await publicClient?.waitForTransactionReceipt({ hash })
      console.debug("[CounterAgent Settings] update tx confirmed", { hash })
      setMerchant((current) =>
        current
          ? {
              ...current,
              fxThresholdBps,
              risk: RiskTolerance[draft.riskTolerance],
              preferredStablecoin: stablecoinAddresses[draft.preferredStablecoin],
            }
          : current
      )
      setFxThresholdState([percent])
      setRiskToleranceState(draft.riskTolerance)
      setPreferredStablecoinState(draft.preferredStablecoin)
      treasuryOptimisticUntilRef.current = Date.now() + 20_000
      setSaveState("success")
      setSaveMessage("Treasury config updated on-chain. Settings values are updated locally while the registry cache catches up.")
      window.setTimeout(() => {
        treasuryOptimisticUntilRef.current = 0
        loadSession()
      }, 3_000)
    } catch (error) {
      console.error("[CounterAgent Settings] treasury config update failed", error)
      setSaveState("error")
      setSaveMessage(friendlyErrorMessage(error, "Treasury config update failed."))
    }
  }

  const isSaving = ["preparing", "switching", "confirming", "mining"].includes(saveState)
  const isEnsSaving = ["preparing", "switching", "confirming", "mining"].includes(ensSaveState)

  const saveEnsProfile = async () => {
    setEnsSaveMessage(null)
    setEnsLastTxHash(null)

    const node = merchant?.ens?.node
    const resolver = merchant?.ens?.resolver

    if (!address || !registered) {
      setEnsSaveState("error")
      setEnsSaveMessage("Connect a registered merchant wallet first.")
      return
    }
    if (!node || !resolver) {
      setEnsSaveState("error")
      setEnsSaveMessage("ENS node/resolver is not available yet. Re-open after onboarding finishes.")
      return
    }

    try {
      setEnsSaveState("preparing")
      setEnsSaveMessage("Orchestration Agent is preparing the ENS profile update…")
      let draftForSave = ensDraft

      if (ensImageFiles.merchantImage) {
        setEnsSaveState("preparing")
        setEnsSaveMessage("ENS Monitor Agent is sending the clipped avatar to the IPFS plugin…")
        const uploadedUrl = await uploadEnsImage("merchantImage", ensImageFiles.merchantImage)
        if (uploadedUrl) draftForSave = { ...draftForSave, merchantImage: uploadedUrl }
      }

      if (ensImageFiles.header) {
        setEnsSaveState("preparing")
        setEnsSaveMessage("ENS Monitor Agent is sending the clipped header to the IPFS plugin…")
        const uploadedUrl = await uploadEnsImage("header", ensImageFiles.header)
        if (uploadedUrl) draftForSave = { ...draftForSave, header: uploadedUrl }
      }

      if ((ensImagePreviews.merchantImage && !draftForSave.merchantImage.trim()) || (ensImagePreviews.header && !draftForSave.header.trim())) {
        setEnsSaveState("error")
        setEnsSaveMessage("Upload the clipped image to IPFS first, or paste a public image URL. ENS text records store URLs, not raw files.")
        return
      }

      setEnsSaveState("preparing")
      setEnsSaveMessage("ENS Monitor Agent is preparing the text-record map…")
      const plan = await prepareEnsProfileRecords(ensProfileRequestFromDraft(draftForSave))
      const currentRecords = merchant?.ens?.records ?? {}
      const entries = Object.entries(plan.records).filter(([key, value]) => equivalentCurrentEnsValue(currentRecords, key) !== value)

      if (entries.length === 0) {
        setEnsSaveState("success")
        setEnsSaveMessage("No ENS profile changes to write.")
        return
      }

      setEnsSaveState("switching")
      setEnsSaveMessage(`Please approve the switch to ${ensChain.name} for ENS resolver writes…`)
      await ensChainGuard.ensureChain()

      let lastHash: `0x${string}` | null = null
      for (const [index, [key, value]] of entries.entries()) {
        setEnsSaveState("confirming")
        setEnsSaveMessage(`Confirm ENS record ${index + 1} of ${entries.length}: ${key}`)
        const hash = await writeContractAsync({
          address: resolver,
          abi: publicResolverAbi,
          functionName: "setText",
          args: [node, key, value],
          chainId: ensChain.id,
        })
        lastHash = hash
        setEnsLastTxHash(hash)
        setEnsSaveState("mining")
        setEnsSaveMessage(`Mining ENS record ${index + 1} of ${entries.length}: ${key}`)
        await ensPublicClient?.waitForTransactionReceipt({ hash })
      }

      const nextEnsRecords = Object.fromEntries(entries)
      setMerchant((current) =>
        current
          ? {
              ...current,
              ens: {
                ...(current.ens ?? {}),
                records: {
                  ...(current.ens?.records ?? {}),
                  ...nextEnsRecords,
                },
              },
            }
          : current
      )
      if (address && typeof window !== "undefined") {
        window.localStorage.setItem(`counteragent:ens-records:${address.toLowerCase()}`, JSON.stringify(nextEnsRecords))
      }
      ensOptimisticUntilRef.current = Date.now() + 30_000
      setEnsDraft(draftForSave)
      setEnsImagePreviews({ merchantImage: "", header: "" })
      setEnsImageFiles({ merchantImage: null, header: null })
      setEnsSaveState("success")
      setEnsSaveMessage(`ENS profile records updated through the ENS Monitor Agent${lastHash ? "." : ""}`)
      window.setTimeout(() => {
        ensOptimisticUntilRef.current = 0
        loadSession()
      }, 5_000)
    } catch (error) {
      console.error("[CounterAgent Settings] ENS profile update failed", error)
      setEnsSaveState("error")
      setEnsSaveMessage(friendlyErrorMessage(error, "ENS profile update failed."))
    }
  }

  const renderEnsImageDropzone = (field: EnsImageField, label: string, helper: string) => {
    const value = ensDraft[field]
    const preview = ensImagePreviews[field] || value
    const isHeader = field === "header"

    return (
      <div className={isHeader ? "md:col-span-2" : undefined}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Label className="text-sm font-semibold text-foreground">{label}</Label>
          {(value || ensImagePreviews[field]) ? (
            <button
              type="button"
              onClick={() => clearEnsImage(field)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
              disabled={isEnsSaving}
            >
              <X className="h-3 w-3" /> Clear
            </button>
          ) : null}
        </div>

        <label
          className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-dashed bg-secondary/40 transition-colors ${
            draggingImageField === field ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
          } ${isHeader ? "min-h-40" : "min-h-52"}`}
          onDragEnter={(event) => {
            event.preventDefault()
            setDraggingImageField(field)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault()
            setDraggingImageField(null)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDraggingImageField(null)
            void previewEnsImageFile(field, event.dataTransfer.files?.[0])
          }}
        >
          {preview ? (
            <img
              src={preview}
              alt={`${label} preview`}
              className={`absolute inset-0 h-full w-full ${isHeader ? "object-cover" : "object-contain p-4"}`}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-muted-foreground">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-background shadow-sm">
                <UploadCloud className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Drag & drop an image</p>
                <p className="text-xs">or click to choose a local preview</p>
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-background/90 px-3 py-2 text-xs text-muted-foreground opacity-100 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            {ensImageFiles[field]
              ? `Clipped to ${ensImageSpec[field].width}×${ensImageSpec[field].height} ${ensImageSpec[field].ratioLabel}. Save will upload to IPFS first.`
              : ensImagePreviews[field] && !value
                ? "Clipped preview ready — upload to IPFS or save to upload before ENS write."
                : helper}
          </div>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={isEnsSaving}
            onChange={(event) => void previewEnsImageFile(field, event.target.files?.[0])}
          />
        </label>

        <div className="mt-2 flex gap-2">
          <Input
            value={value}
            onChange={(event) => updateEnsImageUrl(field, event.target.value)}
            placeholder="https://.../image.png"
            disabled={isEnsSaving || uploadingImageField === field}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void uploadEnsImage(field)}
            disabled={!ensImageFiles[field] || uploadingImageField === field || isEnsSaving}
          >
            {uploadingImageField === field ? "Uploading..." : "Upload IPFS"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Flow: clip/preview → IPFS URL via ENS Monitor Agent → ENS text record. Avatar is 1:1; header is prepared as {ensImageSpec[field].width}×{ensImageSpec[field].height}.
        </p>
      </div>
    )
  }

  const merchantEnsName = ensNameFromMerchant(merchant)
  const merchantEnsRecordsUrl = ensAppRecordsUrl(merchantEnsName)

  return (
    <div>
      <AppHeader />
      <main className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        {isConnected && treasuryChainGuard.status !== "ready" ? (
          <Card className="border-warning/40 bg-warning/10">
            <CardContent className="flex flex-col gap-3 px-4 py-3 text-sm text-warning-foreground sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">Wrong network for treasury updates</p>
                <p className="text-xs text-muted-foreground">
                  Your wallet is on {networkName}. Treasury actions require {activeChain.name}.
                </p>
              </div>
              <Button size="sm" onClick={() => void treasuryChainGuard.ensureChain()} disabled={treasuryChainGuard.isSwitching}>
                {treasuryChainGuard.isSwitching ? "Switching..." : `Switch to ${activeChain.name}`}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-0 bg-header-bg text-header-foreground">
          <CardContent className="flex items-center gap-3 px-4 py-4 lg:px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold lg:text-base">Merchant Wallet</p>
              <p className="font-mono text-xs text-header-foreground/60">
                {shortenAddress(address)} &middot; {networkName}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${walletStatusClass}`}>
              {walletStatus}
            </span>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Treasury Config</p>
              <div className="flex items-center gap-2">
                {isConnected && treasuryChainGuard.status !== "ready" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void treasuryChainGuard.ensureChain()}
                    disabled={treasuryChainGuard.isSwitching}
                  >
                    {treasuryChainGuard.isSwitching ? "Switching..." : `Switch to ${activeChain.name}`}
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" disabled={!registered} onClick={openEditDialog}>
                  Edit config
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="flex flex-col divide-y divide-border px-0 py-0">
                {treasuryConfig.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (!item.editable || !registered) return
                      if (item.label === "ENS Config") openEnsDialog()
                      else openEditDialog()
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed lg:px-5"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.value}</p>
                    </div>
                    {item.editable ? <span className="text-xs font-medium text-primary">{item.label === "ENS Config" ? "Manage" : "Edit"}</span> : null}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4 lg:gap-6">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Notifications</p>
              <Card>
                <CardContent className="flex flex-col divide-y divide-border px-0 py-0">
                  <div className="flex items-center gap-3 px-4 py-3 lg:px-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chart-3/10">
                      <MessageCircle className="h-4 w-4 text-chart-3" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">Telegram Alerts</p>
                      <p className="text-xs text-muted-foreground">{telegramDisplayFromMerchant(merchant)}</p>
                    </div>
                    <Switch checked={registered} disabled />
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 lg:px-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">Anomaly Alerts</p>
                      <p className="text-xs text-muted-foreground">Critical events only</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 lg:px-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <CalendarDays className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-card-foreground">Weekly Summary</p>
                      <p className="text-xs text-muted-foreground">Every Monday 9am</p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Integrations</p>
              <Card>
                <CardContent className="flex flex-col divide-y divide-border px-0 py-0">
                  {["Uniswap v4", "ENS Records", "OG Protocol"].map((name) => (
                    <div key={name} className="flex items-center gap-3 px-4 py-3 lg:px-5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-card-foreground">{name}</p>
                      </div>
                      <span className="text-xs font-medium text-success">Active</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Dialog open={ensOpen} onOpenChange={setEnsOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl lg:w-[1100px]">
          <DialogHeader>
            <DialogTitle>ENS Config</DialogTitle>
            <DialogDescription>
              Manage the merchant-facing ENS profile that the CounterAgent ENS plugin exposes to the agent swarm.
            </DialogDescription>
          </DialogHeader>

          <AgentInteractionFlow
            mode="ens-profile-update"
            phase={ensSaveState}
            heightClassName="h-[240px] sm:h-[270px]"
            className="mb-2"
          />

          <div className="grid max-h-[52vh] gap-4 overflow-y-auto py-2 pr-1">
            <Card>
              <CardContent className="grid gap-3 px-4 py-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label className="mb-2 block text-sm font-semibold text-foreground">ENS Name</Label>
                  <div className="flex flex-col gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-mono">{merchantEnsName}</span>
                    {merchantEnsRecordsUrl ? (
                      <a
                        className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
                        href={merchantEnsRecordsUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View ENS records <Link2 className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
                {renderEnsImageDropzone(
                  "merchantImage",
                  "Merchant image / avatar",
                  "Preview current avatar. Paste a hosted URL to publish it to ENS."
                )}
                {renderEnsImageDropzone(
                  "header",
                  "Header / banner",
                  "Preview current header. Paste a hosted URL to publish it to ENS."
                )}
                <div className="md:col-span-2">
                  <Label className="mb-2 block text-sm font-semibold text-foreground">Website</Label>
                  <Input
                    value={ensDraft.website}
                    onChange={(event) => updateEnsDraft({ website: event.target.value })}
                    placeholder="https://merchant.example"
                    disabled={isEnsSaving}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="mb-2 block text-sm font-semibold text-foreground">Description</Label>
                  <Textarea
                    value={ensDraft.description}
                    onChange={(event) => updateEnsDraft({ description: event.target.value })}
                    placeholder="Short public merchant profile for agents and humans."
                    disabled={isEnsSaving}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="grid gap-3 px-4 py-4 md:grid-cols-2">
                <div className="md:col-span-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ImageIcon className="h-4 w-4 text-primary" /> Social records
                </div>
                {([
                  ["twitter", "X / Twitter"],
                  ["github", "GitHub"],
                  ["discord", "Discord"],
                  ["telegram", "Telegram"],
                  ["linkedin", "LinkedIn"],
                  ["instagram", "Instagram"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label className="mb-2 block text-sm font-semibold text-foreground">{label}</Label>
                    <Input
                      value={ensDraft[key]}
                      onChange={(event) => updateEnsDraft({ [key]: event.target.value } as Partial<EnsProfileDraft>) }
                      placeholder={key === "telegram" || key === "twitter" ? "@handle" : "handle or URL"}
                      disabled={isEnsSaving}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="grid gap-3 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-semibold text-foreground">Agent subnames</Label>
                    <p className="text-xs text-muted-foreground">Stored in counteragent.subnames for the agent plugin to discover.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addSubname} disabled={isEnsSaving}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                {ensDraft.subnames.length === 0 ? (
                  <div className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    No subnames yet. Add examples like monitor.counteragent.eth or reporting.counteragent.eth.
                  </div>
                ) : null}
                {ensDraft.subnames.map((subname, index) => (
                  <div key={`${index}-${subname}`} className="flex gap-2">
                    <Input
                      value={subname}
                      onChange={(event) => updateSubname(index, event.target.value)}
                      placeholder="monitor.merchant.counteragent.eth"
                      disabled={isEnsSaving}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => removeSubname(index)} disabled={isEnsSaving}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              The ENS Monitor Agent prepares the ENS text-record map; your merchant wallet signs the resolver writes.
            </div>

            {ensSaveMessage ? (
              <p className={ensSaveState === "error" ? "text-sm text-destructive" : "text-sm text-success"}>{ensSaveMessage}</p>
            ) : null}
            {ensLastTxHash ? (
              <div className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                <p className="font-semibold">Latest ENS transaction</p>
                <a
                  className="font-mono text-primary underline-offset-4 hover:underline"
                  href={`${activeChain.blockExplorers?.default.url}/tx/${ensLastTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View tx {shortenAddress(ensLastTxHash)}
                </a>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEnsOpen(false)} disabled={isEnsSaving}>
              Close
            </Button>
            {ensChainGuard.status !== "ready" ? (
              <Button
                type="button"
                onClick={() => void ensChainGuard.ensureChain()}
                disabled={ensChainGuard.isSwitching || isEnsSaving || !registered}
              >
                {ensChainGuard.isSwitching ? "Switching network..." : `Switch to ${ensChain.name}`}
              </Button>
            ) : (
              <Button type="button" onClick={saveEnsProfile} disabled={isEnsSaving || !registered}>
                {ensSaveState === "preparing"
                  ? "Preparing agent flow..."
                  : ensSaveState === "switching"
                    ? "Switching network..."
                    : ensSaveState === "confirming"
                      ? "Confirm ENS record..."
                      : ensSaveState === "mining"
                        ? "Writing ENS record..."
                        : "Confirm ENS records"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl lg:w-[1100px]">
          <DialogHeader>
            <DialogTitle>Edit Treasury Config</DialogTitle>
            <DialogDescription>
              Updates are written on-chain through MerchantRegistry.update using your connected wallet.
            </DialogDescription>
          </DialogHeader>

          <AgentInteractionFlow
            mode="treasury-config-update"
            phase={saveState}
            heightClassName="h-[240px] sm:h-[270px]"
            className="mb-2"
          />

          <div className="grid gap-4 py-2">
            <Card>
              <CardContent className="px-4 py-4">
                <Label className="mb-3 block text-sm font-semibold text-foreground">FX Conversion Threshold</Label>
                <Slider
                  value={fxThreshold}
                  onValueChange={setFxThreshold}
                  onValueCommit={setFxThreshold}
                  max={2}
                  min={0.1}
                  step={0.1}
                  className="mb-2"
                  disabled={isSaving}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>0.1%</span>
                  <span className="font-bold text-foreground">{fxThreshold[0].toFixed(1)}%</span>
                  <span>2%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex h-full flex-col justify-center px-4 py-4">
                <Label className="mb-3 block text-sm font-semibold text-foreground">Risk Tolerance</Label>
                <div className="grid grid-cols-3 gap-2">
                  {riskLabels.map((risk) => (
                    <button
                      key={risk}
                      type="button"
                      onClick={() => setRiskTolerance(risk)}
                      disabled={isSaving}
                      className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                        riskTolerance === risk
                          ? "bg-header-bg text-header-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {risk}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="px-4 py-4">
                <Label className="mb-3 block text-sm font-semibold text-foreground">Preferred Stablecoin Output</Label>
                <div className="flex gap-2">
                  {stablecoinSymbols.map((symbol) => (
                    <button
                      key={symbol}
                      type="button"
                      onClick={() => setPreferredStablecoin(symbol)}
                      disabled={isSaving}
                      className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 ${
                        preferredStablecoin === symbol
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              Will submit: <span className="font-semibold text-foreground">{Math.round(fxThreshold[0] * 100)} bps</span>,{" "}
              <span className="font-semibold text-foreground">{riskTolerance}</span>,{" "}
              <span className="font-semibold text-foreground">{preferredStablecoin}</span>
            </div>

            {treasuryChainGuard.status !== "ready" ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-warning-foreground">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold">Treasury writes require {activeChain.name}</p>
                    <p className="text-xs text-muted-foreground">Your wallet will be asked to switch before signing the registry update.</p>
                  </div>
                  <Button size="sm" type="button" onClick={() => void treasuryChainGuard.ensureChain()} disabled={treasuryChainGuard.isSwitching}>
                    {treasuryChainGuard.isSwitching ? "Switching..." : `Switch to ${activeChain.name}`}
                  </Button>
                </div>
              </div>
            ) : null}

            {saveMessage ? (
              <p className={saveState === "error" ? "text-sm text-destructive" : "text-sm text-success"}>{saveMessage}</p>
            ) : null}
            {lastTxHash ? (
              <div className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                <p className="font-semibold">Transaction submitted</p>
                <a
                  className="font-mono text-primary underline-offset-4 hover:underline"
                  href={`${activeChain.blockExplorers?.default.url}/tx/${lastTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View tx {shortenAddress(lastTxHash)}
                </a>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={isSaving}>
              Close
            </Button>
            <Button type="button" onClick={saveTreasuryConfig} disabled={isSaving || !registered}>
              {saveState === "preparing"
                ? "Preparing agent flow..."
                : saveState === "switching"
                  ? "Switching network..."
                  : saveState === "confirming"
                    ? "Confirm in wallet..."
                    : saveState === "mining"
                      ? "Waiting for confirmation..."
                      : "Confirm on-chain update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
