'use client'

import { useState } from 'react'
import { ClipboardList, Factory, ArrowLeftRight, PackageCheck, ShoppingCart } from 'lucide-react'
import ProductionPanel from './ProductionPanel'
import AdjustmentsPanel from './AdjustmentsPanel'
import TransfersPanel from './TransfersPanel'
import ReceivingPanel from './ReceivingPanel'
import EcomRestockPanel from './EcomRestockPanel'

type OpsTab = 'adjustments' | 'production' | 'transfers' | 'receiving' | 'ecomrestock'

const TABS: { key: OpsTab; label: string; icon: React.ReactNode }[] = [
  { key: 'adjustments', label: 'Inventory Adjustments',      icon: <ClipboardList className="w-4 h-4" /> },
  { key: 'production',  label: 'Production / Mfg Runs',     icon: <Factory className="w-4 h-4" /> },
  { key: 'transfers',   label: 'Transfer Between Locations', icon: <ArrowLeftRight className="w-4 h-4" /> },
  { key: 'receiving',   label: 'Receiving / Put-Away',       icon: <PackageCheck className="w-4 h-4" /> },
  { key: 'ecomrestock', label: 'Ecom Single Restock',        icon: <ShoppingCart className="w-4 h-4" /> },
]

export default function InventoryOpsPanel() {
  const [tab, setTab] = useState<OpsTab>('adjustments')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 bg-black shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30'
                : 'text-white/40 hover:bg-white/5 hover:text-white'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'adjustments' && <AdjustmentsPanel />}
        {tab === 'production'  && <ProductionPanel />}
        {tab === 'transfers'   && <TransfersPanel />}
        {tab === 'receiving'   && <ReceivingPanel />}
        {tab === 'ecomrestock' && <EcomRestockPanel />}
      </div>
    </div>
  )
}
