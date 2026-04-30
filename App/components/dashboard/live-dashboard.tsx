"use client"

import { useQuery } from "@tanstack/react-query"
import { useAccount } from "wagmi"

import { AgentActivity } from "@/components/dashboard/agent-activity"
import { Holdings } from "@/components/dashboard/holdings"
import { MonthlySavings } from "@/components/dashboard/monthly-savings"
import { TreasuryBalance } from "@/components/dashboard/treasury-balance"
import { WorkflowEvaluation } from "@/components/dashboard/workflow-evaluation"
import { fetchDashboardState } from "@/lib/a0"

export function LiveDashboard() {
  const { address } = useAccount()
  const dashboardQuery = useQuery({
    queryKey: ["dashboard-state", address],
    queryFn: () => fetchDashboardState(address!),
    enabled: Boolean(address),
    refetchInterval: 5_000,
    staleTime: 2_000,
  })

  const dashboard = dashboardQuery.data

  return (
    <>
      <WorkflowEvaluation onCompleted={() => window.setTimeout(() => void dashboardQuery.refetch(), 3_000)} />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
        <TreasuryBalance dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
        <Holdings dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
        <MonthlySavings dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
        <AgentActivity dashboard={dashboard} isLoading={dashboardQuery.isLoading} />
      </div>
    </>
  )
}
