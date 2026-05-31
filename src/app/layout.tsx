import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nami — Inventory Navigator',
  description: 'Navigate your inventory with precision',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0c10] text-slate-200">
        {children}
      </body>
    </html>
  )
}
