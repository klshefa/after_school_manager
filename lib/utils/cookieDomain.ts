/**
 * Get the appropriate cookie domain for cross-subdomain auth
 */
export function getCookieDomain(): string | undefined {
  if (typeof window === 'undefined') {
    // Server-side - check for Vercel environment
    const vercelUrl = process.env.VERCEL_URL
    if (vercelUrl?.includes('shefaschool.org')) {
      return '.shefaschool.org'
    }
    return undefined
  }
  
  // Client-side
  const hostname = window.location.hostname
  
  if (hostname.includes('shefaschool.org')) {
    return '.shefaschool.org'
  }
  
  // localhost or other - no domain restriction
  return undefined
}
