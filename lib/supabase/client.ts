import { createBrowserClient } from '@supabase/ssr'
import { getCookieDomain } from '@/lib/utils/cookieDomain'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return document.cookie.split('; ').map(c => {
            const [name, ...rest] = c.split('=')
            return { name, value: rest.join('=') }
          })
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          const cookieDomain = getCookieDomain()
          
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = {
              ...options,
              domain: cookieDomain,
              secure: true,
              sameSite: 'lax' as const,
              path: '/',
            }
            
            let cookieString = `${name}=${value}`
            if (cookieOptions.domain) cookieString += `; domain=${cookieOptions.domain}`
            if (cookieOptions.path) cookieString += `; path=${cookieOptions.path}`
            if (cookieOptions.secure) cookieString += `; secure`
            if (cookieOptions.sameSite) cookieString += `; samesite=${cookieOptions.sameSite}`
            
            document.cookie = cookieString
          })
        },
      },
    }
  )
}
