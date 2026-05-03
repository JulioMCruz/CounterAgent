"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { formatUnits, parseAbi, parseUnits, zeroAddress } from "viem"
import { usePublicClient, useReadContracts, useWriteContract } from "wagmi"
import { baseSepolia } from "wagmi/chains"
import { ArrowRightLeft, Bot, CheckCircle2, KeyRound, Loader2, ShieldCheck, Vault, WalletCards } from "lucide-react"
import { AgentInteractionFlow } from "@/components/agent-interaction-flow"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConnectedWalletAddress } from "@/hooks/use-connected-wallet-address"
import { useRequiredChain } from "@/hooks/use-required-chain"
import { evaluateWorkflow, prepareVaultPlan, shortenAddress, type SupportedStablecoin, type WorkflowEvaluateResponse } from "@/lib/a0"

const factoryAddresses: Record<number, `0x${string}`> = {
  84532: "0x6FBbFb4F41b2366B10b93bae5D1a1A4aC3c734BA",
  11142220: "0xaD85EC495f8782fC581C0f06e73e4075A7C077E9",
}

const defaultRouterTargets: Record<number, `0x${string}`[]> = {
  84532: ["0x492E6456D9528771018DeB9E87ef7750EF184104"],
}

const permit2Targets: Record<number, `0x${string}`> = {
  84532: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
}

const defaultExecutionAgents: Record<number, `0x${string}`> = {
  84532: "0xDaa23fF7820b92eA5D78457adc41Cab1af97EbbC",
}

const tokenDecimals: Partial<Record<SupportedStablecoin, number>> = {
  USDC: 6,
  EURC: 6,
  USDT: 6,
  CUSD: 18,
  CEUR: 18,
  CELO: 18,
  cUSD: 18,
  cEUR: 18,
  cREAL: 18,
  cKES: 18,
  cCOP: 18,
  cGHS: 18,
}

const factoryAbi = parseAbi([
  "function vaultOf(address merchant) view returns (address)",
  "function predictedVault(address merchant) view returns (address)",
  "function createVault(address authorizedAgent,address[] initialTokens,address[] initialTargets) returns (address vault)",
])

const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function authorizedAgent() view returns (address)",
  "function allowedTarget(address target) view returns (bool)",
  "function policy() view returns (uint256 maxTradeAmount,uint256 dailyLimit,uint16 maxSlippageBps,uint64 expiresAt,bool active)",
  "function deposit(address token,uint256 amount)",
  "function configureAgent(address newAgent,(uint256 maxTradeAmount,uint256 dailyLimit,uint16 maxSlippageBps,uint64 expiresAt,bool active) newPolicy)",
  "function setTargetAllowed(address target,bool allowed)",
])

const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
])

function tokenUnitsToDisplay(value?: string | bigint, symbol = "USDC", decimals = 6, maxDigits = 2) {
  const amount = typeof value === "bigint" ? Number(formatUnits(value, decimals)) : Number(value ?? 0) / 10 ** decimals
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: maxDigits })} ${symbol}`
}

function defaultOutputForChain(chainId: number): SupportedStablecoin {
  return chainId === 42220 || chainId === 11142220 ? "CUSD" : "USDC"
}

function defaultDepositTokenForChain(chainId: number): SupportedStablecoin {
  return chainId === 42220 || chainId === 11142220 ? "CEUR" : "EURC"
}

function workflowTokenFor(symbol: SupportedStablecoin) {
  if (symbol === "cUSD") return "CUSD"
  if (symbol === "cEUR") return "CEUR"
  return symbol as "USDC" | "EURC" | "USDT" | "CUSD" | "CEUR" | "CELO"
}

function expiryDate(value?: number | bigint) {
  const timestamp = typeof value === "bigint" ? Number(value) : value
  if (!timestamp) return "Not configured"
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function baseScanTxUrl(chainId: number, hash?: string | null) {
  if (!hash) return undefined
  return chainId === 84532 ? `https://sepolia.basescan.org/tx/${hash}` : undefined
}

function policyFromPlan(plan?: Awaited<ReturnType<typeof prepareVaultPlan>>) {
  if (!plan?.vault.policy) return undefined
  const { maxTradeAmount, dailyLimit, maxSlippageBps, expiresAt, active } = plan.vault.policy
  return {
    maxTradeAmount: BigInt(maxTradeAmount),
    dailyLimit: BigInt(dailyLimit),
    maxSlippageBps,
    expiresAt: BigInt(expiresAt),
    active,
  }
}

export function AutopilotVaultCard({ onCompleted }: { onCompleted?: () => void }) {
  const { address } = useConnectedWalletAddress()
  const vaultChain = baseSepolia
  const vaultChainId = vaultChain.id
  const { ensureChain, isCorrectChain, isSwitching } = useRequiredChain(vaultChain)
  const publicClient = usePublicClient({ chainId: vaultChainId })
  const { writeContractAsync } = useWriteContract()
  const [depositToken, setDepositToken] = useState<SupportedStablecoin>(defaultDepositTokenForChain(vaultChainId))
  const [depositAmount, setDepositAmount] = useState("25")
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [workflow, setWorkflow] = useState<WorkflowEvaluateResponse | null>(null)
  const [flowPhase, setFlowPhase] = useState<"idle" | "preparing" | "switching" | "confirming" | "mining" | "success" | "error">("idle")

  const factoryAddress = factoryAddresses[vaultChainId]
  const routerTargets = defaultRouterTargets[vaultChainId] ?? []
  const permit2Target = permit2Targets[vaultChainId]
  const defaultExecutionAgent = defaultExecutionAgents[vaultChainId]
  const preferredStablecoin = defaultOutputForChain(vaultChainId)

  useEffect(() => {
    setDepositToken(defaultDepositTokenForChain(vaultChainId))
  }, [vaultChainId])

  const vaultPlanQuery = useQuery({
    queryKey: ["vault-plan", address, vaultChainId, preferredStablecoin],
    queryFn: () => prepareVaultPlan({ walletAddress: address!, chainId: vaultChainId, mode: "moderate", preferredStablecoin, targetAllowlist: routerTargets }),
    enabled: Boolean(address),
    staleTime: 60_000,
  })

  const policy = vaultPlanQuery.data?.vault.policy
  const tokenSymbols = vaultPlanQuery.data?.vault.tokenAllowlist.map((token) => token.symbol).join(" · ")
  const selectedToken = vaultPlanQuery.data?.vault.tokenAllowlist.find((token) => token.symbol === depositToken)
    ?? vaultPlanQuery.data?.vault.tokenAllowlist.find((token) => token.symbol === defaultDepositTokenForChain(vaultChainId))
  const selectedDecimals = tokenDecimals[selectedToken?.symbol ?? depositToken] ?? 6
  const parsedDepositAmount = useMemo(() => {
    try {
      return parseUnits(depositAmount || "0", selectedDecimals)
    } catch {
      return BigInt(0)
    }
  }, [depositAmount, selectedDecimals])

  const chainReads = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(address && factoryAddress) },
    contracts: [
      factoryAddress && address ? { address: factoryAddress, abi: factoryAbi, functionName: "vaultOf", args: [address], chainId: vaultChainId } : undefined,
      factoryAddress && address ? { address: factoryAddress, abi: factoryAbi, functionName: "predictedVault", args: [address], chainId: vaultChainId } : undefined,
    ].filter(Boolean) as any,
  })

  const chainData = chainReads.data as { status: string; result?: unknown }[] | undefined
  const deployedVault = chainData?.[0]?.status === "success" ? chainData[0].result as `0x${string}` : undefined
  const predictedVault = chainData?.[1]?.status === "success" ? chainData[1].result as `0x${string}` : undefined
  const vaultAddress = deployedVault && deployedVault !== zeroAddress ? deployedVault : predictedVault
  const vaultDeployed = Boolean(deployedVault && deployedVault !== zeroAddress)

  const vaultReads = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(address && selectedToken?.address && vaultAddress) },
    contracts: [
      selectedToken && address ? { address: selectedToken.address, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId: vaultChainId } : undefined,
      selectedToken && vaultAddress ? { address: selectedToken.address, abi: erc20Abi, functionName: "balanceOf", args: [vaultAddress], chainId: vaultChainId } : undefined,
      selectedToken && address && vaultAddress ? { address: selectedToken.address, abi: erc20Abi, functionName: "allowance", args: [address, vaultAddress], chainId: vaultChainId } : undefined,
      vaultDeployed && vaultAddress ? { address: vaultAddress, abi: vaultAbi, functionName: "authorizedAgent", chainId: vaultChainId } : undefined,
      vaultDeployed && vaultAddress ? { address: vaultAddress, abi: vaultAbi, functionName: "policy", chainId: vaultChainId } : undefined,
      vaultDeployed && vaultAddress && selectedToken ? { address: vaultAddress, abi: vaultAbi, functionName: "allowedTarget", args: [selectedToken.address], chainId: vaultChainId } : undefined,
      vaultDeployed && vaultAddress && permit2Target ? { address: vaultAddress, abi: vaultAbi, functionName: "allowedTarget", args: [permit2Target], chainId: vaultChainId } : undefined,
    ].filter(Boolean) as any,
  })

  const vaultData = vaultReads.data as { status: string; result?: unknown }[] | undefined
  const walletTokenBalance = vaultData?.[0]?.status === "success" ? vaultData[0].result as bigint : BigInt(0)
  const vaultTokenBalance = vaultData?.[1]?.status === "success" ? vaultData[1].result as bigint : BigInt(0)
  const currentAllowance = vaultData?.[2]?.status === "success" ? vaultData[2].result as bigint : BigInt(0)
  const authorizedAgent = vaultData?.[3]?.status === "success" ? vaultData[3].result as `0x${string}` : undefined
  const onchainPolicy = vaultData?.[4]?.status === "success" ? vaultData[4].result as readonly [bigint, bigint, number, bigint, boolean] : undefined
  const tokenApprovalTargetAllowed = vaultData?.[5]?.status === "success" ? Boolean(vaultData[5].result) : false
  const permit2TargetAllowed = vaultData?.[6]?.status === "success" ? Boolean(vaultData[6].result) : false
  const policyActive = Boolean(onchainPolicy?.[4])
  const needsApproval = parsedDepositAmount > BigInt(0) && currentAllowance < parsedDepositAmount
  const readyForAutopilot = Boolean(vaultDeployed && vaultTokenBalance > BigInt(0) && policyActive && tokenApprovalTargetAllowed && permit2TargetAllowed)

  const refresh = async () => {
    await Promise.all([vaultPlanQuery.refetch(), chainReads.refetch(), vaultReads.refetch()])
  }

  async function submitAndWait(label: string, fn: () => Promise<`0x${string}`>) {
    if (!publicClient) throw new Error("Public client unavailable for this chain.")
    setMessage(`${label}: waiting for wallet confirmation…`)
    const hash = await fn()
    setMessage(`${label} submitted: ${shortenAddress(hash)}`)
    await publicClient.waitForTransactionReceipt({ hash })
    setMessage(`${label} confirmed on-chain.`)
    return hash
  }

  async function withTx(label: string, fn: () => Promise<`0x${string}`>) {
    await ensureChain()
    setBusyAction(label)
    setFlowPhase(label === "Create vault" ? "switching" : label === "Configure A3 policy" ? "confirming" : label === "Deposit to vault" ? "mining" : "preparing")
    setMessage(null)
    try {
      await submitAndWait(label, fn)
      setFlowPhase("success")
      await refresh()
    } catch (error) {
      setFlowPhase("error")
      setMessage(error instanceof Error ? error.message : `${label} failed`)
    } finally {
      setBusyAction(null)
    }
  }

  async function createVault() {
    if (!factoryAddress || !vaultPlanQuery.data) return
    const tokenAddresses = vaultPlanQuery.data.vault.tokenAllowlist.map((token) => token.address)
    const initialTargets = Array.from(new Set([...routerTargets, ...tokenAddresses, permit2Target].filter(Boolean))) as `0x${string}`[]
    const agent = vaultPlanQuery.data.vault.authorizedAgent ?? defaultExecutionAgent
    if (!agent) {
      setMessage("A3 executor address is not configured in the vault plan.")
      return
    }
    await withTx("Create vault", () => writeContractAsync({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "createVault",
      args: [agent, tokenAddresses, initialTargets],
      chainId: vaultChainId,
    }))
  }

  async function setupVaultFlow() {
    if (!address || !factoryAddress || !vaultPlanQuery.data || !selectedToken || parsedDepositAmount <= BigInt(0)) return
    if (!publicClient) {
      setMessage("Public client unavailable for this chain.")
      return
    }
    const tokenAddresses = vaultPlanQuery.data.vault.tokenAllowlist.map((token) => token.address)
    const initialTargets = Array.from(new Set([...routerTargets, ...tokenAddresses, permit2Target].filter(Boolean))) as `0x${string}`[]
    const agent = vaultPlanQuery.data.vault.authorizedAgent ?? defaultExecutionAgent
    const nextPolicy = policyFromPlan(vaultPlanQuery.data)
    if (!agent || !nextPolicy) {
      setMessage("A3 executor policy is not configured in the vault plan.")
      return
    }

    await ensureChain()
    setBusyAction("Setup vault")
    setFlowPhase("preparing")
    setMessage(null)
    try {
      let activeVault = vaultAddress
      if (!vaultDeployed || !activeVault) {
        setFlowPhase("confirming")
        await submitAndWait("Create vault", () => writeContractAsync({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: "createVault",
          args: [agent, tokenAddresses, initialTargets],
          chainId: vaultChainId,
        }))
        activeVault = await publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "vaultOf", args: [address] }) as `0x${string}`
      }

      const walletBalanceNow = await publicClient.readContract({ address: selectedToken.address, abi: erc20Abi, functionName: "balanceOf", args: [address] }) as bigint
      if (walletBalanceNow < parsedDepositAmount) {
        throw new Error(`Insufficient ${selectedToken.symbol} balance for ${depositAmount} deposit.`)
      }

      const allowanceNow = await publicClient.readContract({ address: selectedToken.address, abi: erc20Abi, functionName: "allowance", args: [address, activeVault] }) as bigint
      if (allowanceNow < parsedDepositAmount) {
        setFlowPhase("confirming")
        await submitAndWait("Approve vault deposit", () => writeContractAsync({
          address: selectedToken.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [activeVault, parsedDepositAmount],
          chainId: vaultChainId,
        }))
      }

      setFlowPhase("mining")
      await submitAndWait("Deposit to vault", () => writeContractAsync({
        address: activeVault,
        abi: vaultAbi,
        functionName: "deposit",
        args: [selectedToken.address, parsedDepositAmount],
        chainId: vaultChainId,
      }))

      const policyNow = await publicClient.readContract({ address: activeVault, abi: vaultAbi, functionName: "policy" }) as readonly unknown[]
      if (!Boolean(policyNow?.[4])) {
        setFlowPhase("confirming")
        await submitAndWait("Configure A3 policy", () => writeContractAsync({
          address: activeVault,
          abi: vaultAbi,
          functionName: "configureAgent",
          args: [agent, nextPolicy],
          chainId: vaultChainId,
        }))
      }

      const approvalTargetAllowedNow = await publicClient.readContract({ address: activeVault, abi: vaultAbi, functionName: "allowedTarget", args: [selectedToken.address] }) as boolean
      if (!approvalTargetAllowedNow) {
        setFlowPhase("confirming")
        await submitAndWait("Authorize live swap approval", () => writeContractAsync({
          address: activeVault,
          abi: vaultAbi,
          functionName: "setTargetAllowed",
          args: [selectedToken.address, true],
          chainId: vaultChainId,
        }))
      }

      if (permit2Target) {
        const permit2TargetAllowedNow = await publicClient.readContract({ address: activeVault, abi: vaultAbi, functionName: "allowedTarget", args: [permit2Target] }) as boolean
        if (!permit2TargetAllowedNow) {
          setFlowPhase("confirming")
          await submitAndWait("Authorize Permit2", () => writeContractAsync({
            address: activeVault,
            abi: vaultAbi,
            functionName: "setTargetAllowed",
            args: [permit2Target, true],
            chainId: vaultChainId,
          }))
        }
      }

      setFlowPhase("success")
      setMessage("Vault setup complete: deposit received, A3 policy active, and Base Sepolia live swap target authorized.")
      await refresh()
      onCompleted?.()
    } catch (error) {
      setFlowPhase("error")
      setMessage(error instanceof Error ? error.message : "Vault setup failed")
    } finally {
      setBusyAction(null)
    }
  }

  async function approveDeposit() {
    if (!selectedToken || !vaultAddress || parsedDepositAmount <= BigInt(0)) return
    await withTx("Approve vault deposit", () => writeContractAsync({
      address: selectedToken.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [vaultAddress, parsedDepositAmount],
      chainId: vaultChainId,
    }))
  }

  async function depositToVault() {
    if (!selectedToken || !vaultAddress || parsedDepositAmount <= BigInt(0)) return
    await withTx("Deposit to vault", () => writeContractAsync({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: "deposit",
      args: [selectedToken.address, parsedDepositAmount],
      chainId: vaultChainId,
    }))
  }

  async function configurePolicy() {
    const agent = vaultPlanQuery.data?.vault.authorizedAgent ?? defaultExecutionAgent
    if (!vaultAddress || !agent) return
    const nextPolicy = policyFromPlan(vaultPlanQuery.data)
    if (!nextPolicy) return
    await withTx("Configure A3 policy", () => writeContractAsync({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: "configureAgent",
      args: [agent, nextPolicy],
      chainId: vaultChainId,
    }))
  }

  async function authorizeLiveSwapTarget() {
    if (!selectedToken || !vaultAddress) return
    await ensureChain()
    setBusyAction("Authorize live swap approval")
    setFlowPhase("confirming")
    setMessage(null)
    try {
      if (!tokenApprovalTargetAllowed) {
        await submitAndWait("Authorize token approval", () => writeContractAsync({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: "setTargetAllowed",
          args: [selectedToken.address, true],
          chainId: vaultChainId,
        }))
      }
      if (permit2Target && !permit2TargetAllowed) {
        await submitAndWait("Authorize Permit2", () => writeContractAsync({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: "setTargetAllowed",
          args: [permit2Target, true],
          chainId: vaultChainId,
        }))
      }
      setFlowPhase("success")
      setMessage("Live swap authorization complete: token and Permit2 targets are allowed for A3.")
      await refresh()
    } catch (error) {
      setFlowPhase("error")
      setMessage(error instanceof Error ? error.message : "Live swap authorization failed")
    } finally {
      setBusyAction(null)
    }
  }

  async function runAutonomousCycle() {
    if (!address) return
    setBusyAction("Run autonomous A3 cycle")
    setFlowPhase("preparing")
    setMessage(null)
    setWorkflow(null)
    try {
      const response = await evaluateWorkflow({
        workflowId: `vault-autopilot-${address.slice(2, 10).toLowerCase()}-${Date.now()}`,
        merchantEns: "vault.counteragents.eth",
        walletAddress: address,
        chainId: vaultChainId,
        fromToken: workflowTokenFor(depositToken),
        toToken: workflowTokenFor(preferredStablecoin),
        amount: depositAmount,
        fxThresholdBps: 50,
        riskTolerance: "moderate",
        slippageBps: policy?.maxSlippageBps ?? 50,
        vaultAddress: vaultDeployed ? vaultAddress : undefined,
        baselineRate: depositToken === "EURC" || depositToken === "CEUR" || depositToken === "cEUR" ? 1.07 : 1,
        dryRunRate: depositToken === "EURC" || depositToken === "CEUR" || depositToken === "cEUR" ? 1.09 : 1.012,
        metadata: {
          source: "dashboard-autopilot-vault",
          custody: "merchant-owned-vault",
          noHumanInLoopAfterDeposit: true,
          vaultAddress,
          vaultDeployed,
          policyActive,
        },
      })
      setWorkflow(response)
      setFlowPhase(response.decision?.decision?.action === "CONVERT" ? "success" : "confirming")
      setMessage(response.execution?.transactionHash
        ? `A3 submitted real Base Sepolia Uniswap swap: ${shortenAddress(response.execution.transactionHash)}`
        : `A3 evaluated the vault path: ${response.execution?.status ?? response.status}. No swap transaction was submitted.`)
      onCompleted?.()
    } catch (error) {
      setFlowPhase("error")
      setMessage(error instanceof Error ? error.message : "Autonomous cycle failed")
    } finally {
      setBusyAction(null)
    }
  }

  const latestSwapTxHash = workflow?.execution?.transactionHash
  const latestSwapTxUrl = baseScanTxUrl(vaultChainId, latestSwapTxHash)

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-col gap-3 px-5 pb-2 pt-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Autopilot Vault</CardTitle>
          <p className="mt-1 max-w-3xl text-sm text-card-foreground">
            Create a merchant-owned Base Sepolia vault, deposit test stablecoins, configure bounded A3 policy, then let the agent evaluate vault-aware trading paths.
          </p>
        </div>
        <Badge variant="outline" className={readyForAutopilot ? "border-success/30 bg-success/10 text-success" : "border-primary/30 bg-background text-primary"}>
          {readyForAutopilot ? "Autopilot ready" : "Setup required"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        <AgentInteractionFlow mode="vault-autopilot" phase={flowPhase} heightClassName="h-[260px] sm:h-[300px]" />

        {!isCorrectChain && address && (
          <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Vault actions run on {vaultChain.name}. Switch networks before creating, approving, depositing, or configuring policy.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void ensureChain()} disabled={isSwitching || Boolean(busyAction)}>
              {isSwitching ? <Loader2 className="animate-spin" /> : null} Switch to {vaultChain.name}
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><WalletCards className="h-3.5 w-3.5" /> Trade cap</div>
            <p className="mt-2 text-lg font-bold text-card-foreground">{vaultPlanQuery.isLoading ? "Loading..." : tokenUnitsToDisplay(policy?.maxTradeAmount, preferredStablecoin)}</p>
            <p className="mt-1 text-xs text-muted-foreground">per A3 vault call</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Vault balance</div>
            <p className="mt-2 text-lg font-bold text-card-foreground">{tokenUnitsToDisplay(vaultTokenBalance, selectedToken?.symbol ?? depositToken, selectedDecimals)}</p>
            <p className="mt-1 text-xs text-muted-foreground">wallet: {tokenUnitsToDisplay(walletTokenBalance, selectedToken?.symbol ?? depositToken, selectedDecimals)}</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> Policy</div>
            <p className="mt-2 text-lg font-bold text-card-foreground">{policyActive ? "Active" : `${policy?.maxSlippageBps ?? 0} bps`}</p>
            <p className="mt-1 text-xs text-muted-foreground">expires {expiryDate(onchainPolicy?.[3] ?? policy?.expiresAt)}</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Vault className="h-3.5 w-3.5" /> Vault</div>
            <p className="mt-2 text-sm font-bold text-card-foreground">{vaultAddress ? shortenAddress(vaultAddress) : "Not resolved"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{vaultDeployed ? `A3 ${shortenAddress(authorizedAgent)}` : "deterministic address"}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-background/70 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Deposit token</Label>
              <Select value={depositToken} onValueChange={(value) => setDepositToken(value as SupportedStablecoin)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(vaultPlanQuery.data?.vault.tokenAllowlist ?? []).map((token) => <SelectItem key={token.symbol} value={token.symbol}>{token.symbol}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-deposit-amount">Amount to deposit</Label>
              <Input id="vault-deposit-amount" inputMode="decimal" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 [&_button]:w-full">
            <Button type="button" variant="outline" className="justify-center" onClick={createVault} disabled={!address || !factoryAddress || vaultDeployed || isSwitching || Boolean(busyAction)}>
              {busyAction === "Create vault" ? <Loader2 className="animate-spin" /> : <Vault />} Create only
            </Button>
            <Button type="button" className="justify-center sm:col-span-2 lg:col-span-1" onClick={setupVaultFlow} disabled={!address || !factoryAddress || !selectedToken || parsedDepositAmount <= BigInt(0) || isSwitching || Boolean(busyAction)}>
              {busyAction === "Setup vault" ? <Loader2 className="animate-spin" /> : <WalletCards />} Setup vault + deposit
            </Button>
            <Button type="button" variant="outline" className="justify-center" onClick={approveDeposit} disabled={!vaultDeployed || !needsApproval || isSwitching || Boolean(busyAction)}>
              {busyAction === "Approve vault deposit" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Approve
            </Button>
            <Button type="button" variant="outline" className="justify-center" onClick={depositToVault} disabled={!vaultDeployed || needsApproval || parsedDepositAmount <= BigInt(0) || isSwitching || Boolean(busyAction)}>
              {busyAction === "Deposit to vault" ? <Loader2 className="animate-spin" /> : <WalletCards />} Deposit
            </Button>
            <Button type="button" variant="outline" className="justify-center" onClick={configurePolicy} disabled={!vaultDeployed || policyActive || isSwitching || Boolean(busyAction)}>
              {busyAction === "Configure A3 policy" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Policy
            </Button>
            <Button type="button" variant="outline" className="justify-center sm:col-span-2 lg:col-span-1" onClick={authorizeLiveSwapTarget} disabled={!vaultDeployed || !selectedToken || (tokenApprovalTargetAllowed && permit2TargetAllowed) || isSwitching || Boolean(busyAction)}>
              {busyAction === "Authorize live swap approval" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Authorize live swap
            </Button>
            <Button type="button" className="justify-center sm:col-span-2 lg:col-span-1" onClick={runAutonomousCycle} disabled={!address || !readyForAutopilot || Boolean(busyAction)}>
              {busyAction === "Run autonomous A3 cycle" ? <Loader2 className="animate-spin" /> : <Bot />} Run A3 autopilot
            </Button>
            {!readyForAutopilot && address && (
              <p className="sm:col-span-2 lg:col-span-4 2xl:col-span-7 text-xs text-muted-foreground">Use “Setup vault + deposit” for the guided flow. For existing vaults, “Authorize live swap” enables A3 to approve Permit2 for the selected test token, then Run A3 autopilot can submit the real Base Sepolia Uniswap transaction.</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-muted/40 p-3"><span className="font-semibold text-card-foreground">1. Deposit</span><br />Merchant signs real vault setup, approval, and deposit transactions.</div>
          <div className="rounded-lg bg-muted/40 p-3"><span className="font-semibold text-card-foreground">2. Autonomous policy</span><br />A3 is bounded by max trade, daily limit, slippage, allowed tokens, and allowed targets.</div>
          <div className="rounded-lg bg-muted/40 p-3"><span className="font-semibold text-card-foreground">3. Vault cycle</span><br />A0→A1→A2→A3→A4 evaluates the vault path; A3 submits a Base Sepolia Uniswap tx when router calldata and approval are ready.</div>
        </div>

        {message && (
          <div className="rounded-lg border border-border bg-background/70 p-3 text-sm text-muted-foreground">
            <p>{message}</p>
            {latestSwapTxHash && latestSwapTxUrl && (
              <a className="mt-2 inline-flex font-semibold text-primary underline-offset-4 hover:underline" href={latestSwapTxUrl} target="_blank" rel="noreferrer">
                Open swap transaction on BaseScan Sepolia ({shortenAddress(latestSwapTxHash)})
              </a>
            )}
          </div>
        )}

        {workflow && (
          <div className="rounded-xl border border-primary/15 bg-background/80 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Latest autonomous agent cycle</p>
                <p className="text-sm font-semibold text-card-foreground">{workflow.decision?.decision?.action ?? "—"} · {workflow.execution?.status ?? workflow.status}</p>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary"><ArrowRightLeft className="mr-1 h-3 w-3" /> {depositToken} → {preferredStablecoin}</Badge>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {workflow.decision?.decision?.reason ?? "A3 completed the vault-aware execution path."}
              {workflow.execution?.transactionHash ? " Swap transaction submitted on Base Sepolia." : " Current A3 mode validates the merchant vault and executeCall envelope without submitting a swap transaction unless live router calldata is available."}
            </p>
            {latestSwapTxHash && latestSwapTxUrl && (
              <a className="mt-2 inline-flex text-xs font-semibold text-primary underline-offset-4 hover:underline" href={latestSwapTxUrl} target="_blank" rel="noreferrer">
                View real swap transaction on BaseScan Sepolia ({shortenAddress(latestSwapTxHash)})
              </a>
            )}
          </div>
        )}

        {!factoryAddress && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">Vault factory is not configured for chain {vaultChainId}. Switch to Base Sepolia for the demo path.</p>}
        <p className="text-xs text-muted-foreground">Allowed rails: {tokenSymbols ?? "Base + Celo stablecoins"}. Router targets: {routerTargets.length ? routerTargets.map(shortenAddress).join(" · ") : "configured by backend"}.</p>
      </CardContent>
    </Card>
  )
}
