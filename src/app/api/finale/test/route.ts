import { NextResponse } from 'next/server'
import { testConnection } from '@/lib/finale'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await testConnection()
  return NextResponse.json(result)
}
