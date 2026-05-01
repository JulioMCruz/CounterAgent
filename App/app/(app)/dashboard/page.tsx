import { AppHeader } from "@/components/app-header"
import { LiveDashboard } from "@/components/dashboard/live-dashboard"
import { MerchantEnsProfile } from "@/components/dashboard/merchant-ens-profile"

export default function DashboardPage() {
  return (
    <div>
      <AppHeader />
      <main className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <MerchantEnsProfile />
        <LiveDashboard />
      </main>
    </div>
  )
}
