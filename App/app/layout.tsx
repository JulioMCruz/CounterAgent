import type { Metadata, Viewport } from 'next'
import { BuildBadge } from '@/components/build-badge'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Counter Agent - Merchant Treasury Co-Pilot',
  description: 'Autonomous stablecoin treasury management. Get paid in any stablecoin, keep the best rate.',
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <footer className="fixed bottom-2 right-3 z-[9999] flex items-center gap-2 text-xs text-muted-foreground">
          <span>Version</span>
          <BuildBadge />
        </footer>
      </body>
    </html>
  )
}
