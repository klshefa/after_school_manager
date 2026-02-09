'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LoginScreen } from '@/components/LoginScreen'
import { Header } from '@/components/Header'
import { ClassCard } from '@/components/ClassCard'
import { ASPClassWithCount, DayOfWeek, DAYS_OF_WEEK, getTodayDayName } from '@/types/asp'
import { CalendarDaysIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/24/outline'

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [classes, setClasses] = useState<ASPClassWithCount[]>([])
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | 'all'>('all')
  const [loadingClasses, setLoadingClasses] = useState(false)

  useEffect(() => {
    checkUser()
    
    // Check URL for auth errors
    const params = new URLSearchParams(window.location.search)
    const urlError = params.get('error')
    if (urlError === 'unauthorized_domain') {
      setError('Access restricted to @shefaschool.org accounts')
    } else if (urlError === 'no_access') {
      setError('You do not have access to this portal. Contact an administrator.')
    } else if (urlError) {
      setError('Authentication failed. Please try again.')
    }
    
    // Clear URL params
    if (urlError) {
      window.history.replaceState({}, '', '/')
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadClasses()
    }
  }, [user, selectedDay])

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user || null)
    setLoading(false)
  }

  async function loadClasses() {
    setLoadingClasses(true)
    const supabase = createClient()
    
    let query = supabase
      .from('asp_classes')
      .select(`
        *,
        asp_enrollments!inner(count)
      `)
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time')
    
    if (selectedDay !== 'all') {
      query = query.eq('day_of_week', selectedDay)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error loading classes:', error)
      // For now, let's try a simpler query without the count
      const { data: simpleData, error: simpleError } = await supabase
        .from('asp_classes')
        .select('*')
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time')
      
      if (!simpleError && simpleData) {
        // Get enrollment counts separately
        const classesWithCounts = await Promise.all(
          simpleData.map(async (cls) => {
            const { count } = await supabase
              .from('asp_enrollments')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', cls.id)
              .eq('status', 'active')
            
            return {
              ...cls,
              enrollment_count: count || 0
            } as ASPClassWithCount
          })
        )
        
        setClasses(selectedDay === 'all' 
          ? classesWithCounts 
          : classesWithCounts.filter(c => c.day_of_week === selectedDay)
        )
      }
    } else if (data) {
      setClasses(data.map(d => ({
        ...d,
        enrollment_count: d.asp_enrollments?.[0]?.count || 0
      })) as ASPClassWithCount[])
    }
    
    setLoadingClasses(false)
  }

  async function handleSignIn() {
    setSigningIn(true)
    setError(null)
    
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: 'shefaschool.org'
        }
      }
    })
    
    if (error) {
      setError('Failed to initiate sign in. Please try again.')
      setSigningIn(false)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setClasses([])
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-shefa-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return (
      <LoginScreen
        onSignIn={handleSignIn}
        loading={signingIn}
        error={error || undefined}
      />
    )
  }

  // Main dashboard
  const today = getTodayDayName()
  const classesForDisplay = selectedDay === 'all' ? classes : classes.filter(c => c.day_of_week === selectedDay)
  const groupedClasses = DAYS_OF_WEEK.reduce((acc, day) => {
    acc[day] = classesForDisplay.filter(c => c.day_of_week === day)
    return acc
  }, {} as Record<DayOfWeek, ASPClassWithCount[]>)

  return (
    <div className="min-h-screen bg-slate-50">
      <Header userEmail={user.email} onSignOut={handleSignOut} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">After School Programs</h2>
          <p className="text-slate-600 mt-1">
            {today ? `Today is ${today}` : 'No ASP classes on weekends'}
          </p>
        </div>
        
        {/* Day Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSelectedDay('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedDay === 'all'
                ? 'bg-shefa-blue text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All Days
          </button>
          {DAYS_OF_WEEK.map(day => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedDay === day
                  ? 'bg-shefa-blue text-white'
                  : day === today
                    ? 'bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {day}
              {day === today && <span className="ml-1 text-xs">(Today)</span>}
            </button>
          ))}
        </div>
        
        {/* Classes Grid */}
        {loadingClasses ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-shefa-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : classesForDisplay.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <CalendarDaysIcon className="w-12 h-12 mx-auto text-slate-400 mb-4" />
            <p className="text-slate-600">No classes found for the selected day.</p>
            <p className="text-sm text-slate-500 mt-1">
              Classes may need to be synced from Veracross.
            </p>
          </div>
        ) : selectedDay === 'all' ? (
          // Grouped by day
          <div className="space-y-8">
            {DAYS_OF_WEEK.map(day => {
              const dayClasses = groupedClasses[day]
              if (dayClasses.length === 0) return null
              
              return (
                <div key={day}>
                  <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
                    day === today ? 'text-amber-700' : 'text-slate-700'
                  }`}>
                    <CalendarDaysIcon className="w-5 h-5" />
                    {day}
                    {day === today && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Today
                      </span>
                    )}
                    <span className="text-sm font-normal text-slate-500">
                      ({dayClasses.length} {dayClasses.length === 1 ? 'class' : 'classes'})
                    </span>
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {dayClasses.map(cls => (
                      <ClassCard key={cls.id} classData={cls} isToday={day === today} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // Single day view
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {classesForDisplay.map(cls => (
              <ClassCard key={cls.id} classData={cls} isToday={cls.day_of_week === today} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
