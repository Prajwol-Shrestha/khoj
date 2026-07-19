import { createBrowserClient } from '@supabase/ssr'
import { getGuestToken } from '@/lib/guest'

export function createClient() {
  const token = typeof window !== 'undefined' ? getGuestToken() : ''

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        headers: {
          'x-session-token': token,
        },
      },
    }
  )
}