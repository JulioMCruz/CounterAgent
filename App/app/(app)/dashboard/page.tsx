import { AppHeader } from "@/components/app-header"
import { TreasuryBalance } from "@/components/dashboard/treasury-balance"
import { Holdings } from "@/components/dashboard/holdings"
import { MonthlySavings } from "@/components/dashboard/monthly-savings"
import { AgentActivity } from "@/components/dashboard/agent-activity"
import { WorkflowEvaluation } from "@/components/dashboard/workflow-evaluation"
import { MerchantEnsProfile } from "@/components/dashboard/merchant-ens-profile"

export default function DashboardPage() {
  return (
    <div>
      <AppHeader />
      <main className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <MerchantEnsProfile />
        <WorkflowEvaluation />
        {/* Top row: treasury + holdings side by side on desktop */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
          <TreasuryBalance />
          <Holdings />
        </div>
        {/* Bottom row: savings + activity side by side on desktop */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
          <MonthlySavings />
          <AgentActivity />
        </div>
      </main>
    </div>
  )
}
