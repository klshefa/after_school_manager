import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY

interface ClassRoster {
  classId: string
  className: string
  dayOfWeek: string
  time: string
  students: {
    name: string
    grade: number
    enrollmentType: string
    notes: string | null
    isAbsent?: boolean
  }[]
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const isTest = searchParams.get('test') === 'true'
  
  try {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
        },
      }
    )
    
    // Get today's day name
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const today = days[new Date().getDay()]
    
    // No ASP on Friday/Saturday/Sunday
    if (['Friday', 'Saturday', 'Sunday'].includes(today) && !isTest) {
      return NextResponse.json({ message: 'No ASP classes today' })
    }
    
    const targetDay = isTest ? 'Monday' : today // Use Monday for test
    
    // Get email recipients
    const { data: recipients, error: recipientsError } = await supabase
      .from('asp_users')
      .select('email, name')
      .eq('is_active', true)
      .eq('receives_daily_email', true)
    
    if (recipientsError) {
      return NextResponse.json({ error: `Database error: ${recipientsError.message}` }, { status: 500 })
    }
    
    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'No email recipients configured' }, { status: 400 })
    }
    
    // Get today's classes with enrollments
    const { data: classes } = await supabase
      .from('asp_classes')
      .select('*')
      .eq('day_of_week', targetDay)
      .eq('is_active', true)
      .order('start_time')
    
    if (!classes || classes.length === 0) {
      return NextResponse.json({ message: `No classes on ${targetDay}` })
    }
    
    // Get enrollments for these classes
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
    
    // Check today's attendance from master_attendance
    // Status codes 29, 30, 72 = absent in Veracross
    const today = new Date().toISOString().split('T')[0]
    const { data: attendanceData } = await supabase
      .from('master_attendance')
      .select('person_id, student_attendance_status')
      .in('person_id', studentIds)
      .eq('attendance_date', today)
      .in('student_attendance_status', [29, 30, 72])
    
    const absentStudents = new Set(attendanceData?.map(a => a.person_id) || [])
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
      
      // Parse class name
      const nameParts = cls.class_name.split(':')
      const displayName = nameParts.length > 2 
        ? nameParts[2].replace(/\([^)]*\)/, '').trim() 
        : nameParts[nameParts.length - 1].trim()
      
      return {
        classId: cls.id,
        className: displayName,
        dayOfWeek: cls.day_of_week,
        time: formatTime(cls.start_time, cls.end_time),
        students: classStudents
      }
    })
    
    // Build email HTML
    const emailHtml = buildEmailHtml(targetDay, rosters, isTest)
    
    // Send via Resend
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'Resend API key not configured' }, { status: 500 })
    }
    
    const recipientEmails = recipients.map(r => r.email)
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ASP Manager <asp@shefaschool.org>',
        to: recipientEmails,
        subject: `${isTest ? '[TEST] ' : ''}ASP Roster for ${targetDay}, ${new Date().toLocaleDateString()}`,
        html: emailHtml
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error: `Email send failed: ${error}` }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      sentTo: recipientEmails.join(', '),
      classCount: rosters.length,
      totalStudents: rosters.reduce((sum, r) => sum + r.students.length, 0)
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

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

function buildEmailHtml(day: string, rosters: ClassRoster[], isTest: boolean): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://afterschool.shefaschool.org'
  
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
            <strong style="color: #dc2626;">⚠️ ${absentCount} student${absentCount > 1 ? 's' : ''} marked absent today</strong>
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
                  <th style="text-align: left; padding: 8px 0; font-size: 12px; color: #64748b;">Notes</th>
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
                    <td style="padding: 8px 0; font-size: 14px;">
                      <span style="background: ${getTypeColor(s.enrollmentType)}; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
                        ${getTypeLabel(s.enrollmentType)}
                      </span>
                    </td>
                    <td style="padding: 8px 0; font-size: 12px; color: #64748b;">${s.notes || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `
        }
        <p style="margin: 12px 0 0; font-size: 14px;">
          <strong>${roster.students.length}</strong> students • 
          <a href="${baseUrl}/class/${roster.classId}" style="color: #164a7a;">View/Edit in Portal</a>
        </p>
      </div>
    </div>
  `}).join('')
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #164a7a; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">ASP Roster for ${day}</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          ${isTest ? '<p style="margin: 8px 0 0; background: #fbbf24; color: #000; padding: 4px 12px; border-radius: 4px; display: inline-block;">TEST EMAIL</p>' : ''}
        </div>
        
        <div style="padding: 24px;">
          <p style="color: #475569; margin: 0 0 20px;">
            Today's after school program classes and rosters. Please review and make any necessary updates in the portal.
          </p>
          
          ${classesHtml}
          
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="${baseUrl}" style="display: inline-block; background: #164a7a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              Open ASP Manager
            </a>
          </div>
        </div>
        
        <div style="background: #f1f5f9; padding: 16px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            This email was sent by the After School Manager system.<br>
            Questions? Contact the main office.
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    enrolled: '#dcfce7',
    registered: '#dbeafe',
    trial: '#f3e8ff',
    financial_aid: '#fef3c7',
    drop_in: '#cffafe'
  }
  return colors[type] || '#f1f5f9'
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    enrolled: 'Enrolled',
    registered: 'Registered',
    trial: 'Trial',
    financial_aid: 'Fin Aid',
    drop_in: 'Drop-in'
  }
  return labels[type] || type
}
