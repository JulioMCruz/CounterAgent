import { AppHeader } from "@/components/app-header"
import { LiveDashboard } from "@/components/dashboard/live-dashboard"

export default function DashboardPage() {
  return (
    <div>
      <AppHeader />
      <main className="p-3 sm:p-4 lg:p-6">
        <LiveDashboard />
      </main>
    </div>
  )
}
