"use client"

import { useQuery } from "@tanstack/react-query"
import { AgentActivity } from "@/components/dashboard/agent-activity"
import { AgentEnsMesh } from "@/components/dashboard/agent-ens-mesh"
import { AxlTransportStatus } from "@/components/dashboard/axl-transport-status"
import { AutopilotVaultCard } from "@/components/dashboard/autopilot-vault-card"
import { Holdings } from "@/components/dashboard/holdings"
import { MerchantEnsProfile } from "@/components/dashboard/merchant-ens-profile"
import { MonthlySavings } from "@/components/dashboard/monthly-savings"
import { TreasuryBalance } from "@/components/dashboard/treasury-balance"
import { WorkflowEvaluation } from "@/components/dashboard/workflow-evaluation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useConnectedWalletAddress } from "@/hooks/use-connected-wallet-address"
import { fetchDashboardState } from "@/lib/a0"

export function LiveDashboard() {
  const { address } = useConnectedWalletAddress()
  const dashboardQuery = useQuery({
    queryKey: ["dashboard-state", address],
    queryFn: () => fetchDashboardState(address!),
    enabled: Boolean(address),
    refetchInterval: 5_000,
    staleTime: 2_000,
  })

  const dashboard = dashboardQuery.data

  const refreshDashboard = () => window.setTimeout(() => void dashboardQuery.refetch(), 3_000)

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <MerchantEnsProfile />

      <Tabs defaultValue="overview" className="gap-4 lg:gap-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="grid h-auto min-w-max grid-cols-4 gap-1 rounded-2xl p-1 sm:min-w-0 sm:w-full lg:w-fit">
            <TabsTrigger value="overview" className="px-4 py-2 text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="ens" className="px-4 py-2 text-xs sm:text-sm">ENS</TabsTrigger>
            <TabsTrigger value="gensyn" className="px-4 py-2 text-xs sm:text-sm">Gensyn</TabsTrigger>
            <TabsTrigger value="uniswap" className="px-4 py-2 text-xs sm:text-sm">Uniswap</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 flex flex-col gap-4 lg:gap-6">
          <AutopilotVaultCard onCompleted={refreshDashboard} />
          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[1fr_1.1fr] xl:gap-6">
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 xl:flex xl:flex-col">
              <TreasuryBalance dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
              <Holdings dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
              <MonthlySavings dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
            </div>
            <AgentActivity dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
          </div>
        </TabsContent>

        <TabsContent value="ens" className="mt-0 flex flex-col gap-4 lg:gap-6">
          <AgentEnsMesh />
        </TabsContent>

        <TabsContent value="gensyn" className="mt-0 flex flex-col gap-4 lg:gap-6">
          <AxlTransportStatus />
          <AgentActivity dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
        </TabsContent>

        <TabsContent value="uniswap" className="mt-0 flex flex-col gap-4 lg:gap-6">
          <WorkflowEvaluation onCompleted={refreshDashboard} />
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
            <TreasuryBalance dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
            <Holdings dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
