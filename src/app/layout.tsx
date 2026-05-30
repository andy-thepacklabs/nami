import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nami Inventory Dashboard — The Pack Labs',
  description: 'Real-time inventory discrepancy detection and resolution',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] text-neutral-200">
        {children}
      </body>
    </html>
  )
}
