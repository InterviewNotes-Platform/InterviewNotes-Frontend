import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseEnv, hasSupabaseEnv } from '@/lib/supabase/env'
import { coldStartGate } from '@/lib/coldStart'

export async function proxy(request: NextRequest) {
  const starting = await coldStartGate(request.method, request.nextUrl.pathname, {
    API_URL: process.env.API_URL,
    API_WAKE_BUDGET_MS: process.env.API_WAKE_BUDGET_MS,
    API_WAKE_FRESH_MS: process.env.API_WAKE_FRESH_MS,
  })
  if (starting) return starting

  if (!hasSupabaseEnv()) {
    return NextResponse.next({ request })
  }
  const { url, anonKey } = getSupabaseEnv()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session token if expired. Must not use getSession() here
  // as it reads from cookies (not verified). getUser() hits the Supabase API.
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
