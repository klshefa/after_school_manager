import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCookieDomain } from '@/lib/utils/cookieDomain'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = await cookies()
    const cookieDomain = getCookieDomain()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set({
                name,
                value,
                ...options,
                domain: cookieDomain,
                secure: true,
                sameSite: 'lax',
                path: '/',
              })
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
    }

    // Get user info after successful exchange
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user?.email) {
      // Check domain restriction
      if (!user.email.endsWith('@shefaschool.org')) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/?error=unauthorized_domain`)
      }

      // Check if user has access to ASP Manager
      const { data: accessData } = await supabase
        .from('asp_users')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .eq('is_active', true)
        .maybeSingle()

      if (!accessData) {
        // Also check super_admins for fallback access
        const { data: superAdmin } = await supabase
          .from('super_admins')
          .select('*')
          .eq('email', user.email.toLowerCase())
          .maybeSingle()
          
        if (!superAdmin) {
          return NextResponse.redirect(`${origin}/?error=no_access`)
        }
      }
      
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
}
