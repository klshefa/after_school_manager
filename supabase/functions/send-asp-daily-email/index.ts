import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://afterschool.shefaschool.org'

interface ClassRoster {
  className: string
  time: string
  students: {
    name: string
    grade: number
    enrollmentType: string
    notes: string | null
    isAbsent?: boolean
  }[]
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Get today's day name (EST timezone)
    const now = new Date()
    const estOffset = -5 * 60 // EST is UTC-5
    const estTime = new Date(now.getTime() + (now.getTimezoneOffset() + estOffset) * 60000)
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const today = days[estTime.getDay()]
    
    // No ASP on Friday/Saturday/Sunday
    if (['Friday', 'Saturday', 'Sunday'].includes(today)) {
      return new Response(JSON.stringify({ message: 'No ASP classes today' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Get email recipients
    const { data: recipients } = await supabase
      .from('asp_users')
      .select('email, name')
      .eq('is_active', true)
      .eq('receives_daily_email', true)
    
    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'No email recipients configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Get today's classes with enrollments
    const { data: classes } = await supabase
      .from('asp_classes')
      .select('*')
      .eq('day_of_week', today)
      .eq('is_active', true)
      .order('start_time')
    
    if (!classes || classes.length === 0) {
      return new Response(JSON.stringify({ message: `No classes on ${today}` }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Get enrollments
    const classIds = classes.map(c => c.id)
    const { data: enrollments } = await supabase
      .from('asp_enrollments')
      .select('*')
      .in('class_id', classIds)
      .eq('status', 'active')
    
    // Get student details
    const studentIds = [...new Set(enrollments?.map(e => e.student_person_id) || [])]
    const { data: students } = await supabase
      .from('students')
      .select('person_id, first_name, last_name, grade_level')
      .in('person_id', studentIds)
    
    // Check today's attendance
    const todayDate = estTime.toISOString().split('T')[0]
    const { data: attendance } = await supabase
      .from('attendance')
      .select('person_id, status')
      .in('person_id', studentIds)
      .eq('date', todayDate)
    
    const absentStudents = new Set(
      attendance?.filter(a => a.status === 'Absent').map(a => a.person_id) || []
    )
    
    const studentMap = new Map(students?.map(s => [s.person_id, s]) || [])
    
    // Build roster data
    const rosters: ClassRoster[] = classes.map(cls => {
      const classEnrollments = enrollments?.filter(e => e.class_id === cls.id) || []
      const classStudents = classEnrollments.map(e => {
        const student = studentMap.get(e.student_person_id)
        return {
          name: student ? `${student.last_name}, ${student.first_name}` : 'Unknown Student',
          grade: student?.grade_level || 0,
          enrollmentType: e.enrollment_type || 'enrolled',
          notes: e.notes,
          isAbsent: absentStudents.has(e.student_person_id)
        }
      }).sort((a, b) => a.name.localeCompare(b.name))
      
      const nameParts = cls.class_name.split(':')
      const displayName = nameParts.length > 2 
        ? nameParts[2].replace(/\([^)]*\)/, '').trim() 
        : nameParts[nameParts.length - 1].trim()
      
      return {
        className: displayName,
        time: formatTime(cls.start_time, cls.end_time),
        students: classStudents
      }
    })
    
    // Build and send email
    const emailHtml = buildEmailHtml(today, rosters, todayDate)
    
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Resend API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ASP Manager <asp@shefaschool.org>',
        to: recipients.map(r => r.email),
        subject: `ASP Roster for ${today}, ${new Date().toLocaleDateString()}`,
        html: emailHtml
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      return new Response(JSON.stringify({ error: `Email send failed: ${error}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      sentTo: recipients.length,
      classCount: rosters.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

function formatTime(start: string | null, end: string | null): string {
  if (!start || !end) return 'TBD'
  
  const format = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`
  }
  
  return `${format(start)} - ${format(end)}`
}

function buildEmailHtml(day: string, rosters: ClassRoster[], date: string): string {
  const classesHtml = rosters.map(roster => {
    const absentCount = roster.students.filter(s => s.isAbsent).length
    
    return `
    <div style="margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background: #164a7a; color: white; padding: 12px 16px;">
        <h3 style="margin: 0; font-size: 16px;">${roster.className}</h3>
        <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.8;">${roster.time}</p>
      </div>
      <div style="padding: 16px;">
        ${absentCount > 0 ? `
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px;">
            <strong style="color: #dc2626;">${absentCount} student${absentCount > 1 ? 's' : ''} marked absent today</strong>
          </div>
        ` : ''}
        ${roster.students.length === 0 
          ? '<p style="color: #64748b; margin: 0;">No students enrolled</p>'
          : `
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <th style="text-align: left; padding: 8px 0; font-size: 12px; color: #64748b;">Student</th>
                  <th style="text-align: left; padding: 8px 0; font-size: 12px; color: #64748b;">Gr</th>
                  <th style="text-align: left; padding: 8px 0; font-size: 12px; color: #64748b;">Type</th>
                </tr>
              </thead>
              <tbody>
                ${roster.students.map(s => `
                  <tr style="border-bottom: 1px solid #f1f5f9; ${s.isAbsent ? 'background: #fef2f2;' : ''}">
                    <td style="padding: 8px 0; font-size: 14px;">
                      ${s.isAbsent ? '⚠️ ' : ''}${s.name}
                      ${s.isAbsent ? '<span style="color: #dc2626; font-size: 12px;"> (ABSENT)</span>' : ''}
                    </td>
                    <td style="padding: 8px 0; font-size: 14px;">${s.grade}</td>
                    <td style="padding: 8px 0;">
                      <span style="background: ${getTypeColor(s.enrollmentType)}; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
                        ${getTypeLabel(s.enrollmentType)}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `
        }
        <p style="margin: 12px 0 0; font-size: 14px;">
          <strong>${roster.students.filter(s => !s.isAbsent).length}</strong> students expected
        </p>
      </div>
    </div>
  `}).join('')
  
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #164a7a; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">ASP Roster for ${day}</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">${date}</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #475569; margin: 0 0 20px;">
            Today's after school program classes and rosters. Students marked absent in Veracross are highlighted.
          </p>
          ${classesHtml}
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="${APP_URL}" style="display: inline-block; background: #164a7a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
              Open ASP Manager
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    enrolled: '#dcfce7', registered: '#dbeafe', trial: '#f3e8ff',
    financial_aid: '#fef3c7', drop_in: '#cffafe'
  }
  return colors[type] || '#f1f5f9'
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    enrolled: 'Enrolled', registered: 'Registered', trial: 'Trial',
    financial_aid: 'Fin Aid', drop_in: 'Drop-in'
  }
  return labels[type] || type
}
