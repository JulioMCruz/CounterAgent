import { BottomNav } from "@/components/bottom-nav"
import { RegistrationGuard } from "@/components/registration-guard"
import { SidebarNav } from "@/components/sidebar-nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RegistrationGuard>
      <div className="flex min-h-screen bg-background">
        {/* Desktop sidebar */}
        <SidebarNav />
        {/* Main content area */}
        <div className="flex-1">
          <div className="pb-20 lg:pb-0">
            {children}
          </div>
          {/* Mobile bottom nav */}
          <BottomNav />
        </div>
      </div>
    </RegistrationGuard>
  )
}
