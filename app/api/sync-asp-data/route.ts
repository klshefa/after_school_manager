import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BigQuery } from '@google-cloud/bigquery'

// Initialize BigQuery client
function getBigQueryClient() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (credentials) {
    return new BigQuery({
      credentials: JSON.parse(credentials),
      projectId: JSON.parse(credentials).project_id,
    })
  }
  return new BigQuery()
}

// Initialize Supabase admin client (bypasses RLS)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Parse meeting times like "Monday 3:45 PM - 5:00 PM"
function parseMeetingTimes(meetingTimes: string): { day_of_week: string; start_time: string; end_time: string } {
  const defaults = { day_of_week: 'Unknown', start_time: '15:45:00', end_time: '17:00:00' }
  
  if (!meetingTimes) return defaults
  
  const dayMatch = meetingTimes.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday)/)
  const timeMatch = meetingTimes.match(/(\d{1,2}:\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)/)
  
  if (!dayMatch) return defaults
  
  let startTime = defaults.start_time
  let endTime = defaults.end_time
  
  if (timeMatch) {
    const convertTo24Hour = (time: string, period: string): string => {
      const [hours, minutes] = time.split(':').map(Number)
      let h = hours
      if (period === 'PM' && h !== 12) h += 12
      if (period === 'AM' && h === 12) h = 0
      return `${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`
    }
    startTime = convertTo24Hour(timeMatch[1], timeMatch[2])
    endTime = convertTo24Hour(timeMatch[3], timeMatch[4])
  }
  
  return { day_of_week: dayMatch[1], start_time: startTime, end_time: endTime }
}

// Extract class name from "Program Name" field (e.g., "Art - Session 1 ASP Semester 1" -> "Art - Session 1")
function extractClassName(programName: string): string {
  return programName
    .replace(/\s*ASP Semester \d+\s*/gi, '')
    .replace(/\s+$/, '')
    .trim()
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Optional: verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow manual triggers without cron secret for now
    }
    
    const bigquery = getBigQueryClient()
    const supabase = getSupabaseAdmin()
    
    // 1. Fetch classes from BigQuery
    const classQuery = `
      SELECT 
        Class_ID as vc_class_id,
        \`Program Name\` as program_name,
        \`Meeting Times\` as meeting_times,
        Instructor as instructor,
        SAFE_CAST(\`Capacity\` AS INT64) as capacity
      FROM \`vc-data-1-project.vc_data.asp_class_list\`
      WHERE \`Program Name\` LIKE '%ASP Semester%'
    `
    
    const [classRows] = await bigquery.query({ query: classQuery })
    
    // 2. Fetch enrollments from BigQuery
    const enrollmentQuery = `
      SELECT 
        r.Class_ID as vc_class_id,
        r.Person_id as student_person_id,
        r.\`Enrollment Status\` as enrollment_status
      FROM \`vc-data-1-project.vc_data.asp_rosters\` r
      JOIN \`vc-data-1-project.vc_data.asp_class_list\` c 
        ON r.Class_ID = c.Class_ID
      WHERE c.\`Program Name\` LIKE '%ASP Semester%'
    `
    
    const [enrollmentRows] = await bigquery.query({ query: enrollmentQuery })
    
    // Track stats
    let classesInserted = 0
    let classesUpdated = 0
    let classesDeactivated = 0
    let enrollmentsUpserted = 0
    let enrollmentsDeactivated = 0
    const errors: string[] = []
    
    // Get existing classes
    const { data: existingClasses } = await supabase
      .from('asp_classes')
      .select('id, vc_class_id')
    
    const classIdMap = new Map<string, string>()
    if (existingClasses) {
      existingClasses.forEach(c => classIdMap.set(c.vc_class_id, c.id))
    }
    
    // 3. Upsert classes
    const bqClassIds = new Set<string>()
    
    for (const row of classRows) {
      const vcClassId = row.vc_class_id as string
      bqClassIds.add(vcClassId)
      
      const parsed = parseMeetingTimes(row.meeting_times as string)
      const className = extractClassName(row.program_name as string)
      
      const classData = {
        vc_class_id: vcClassId,
        class_name: className,
        day_of_week: parsed.day_of_week,
        start_time: parsed.start_time,
        end_time: parsed.end_time,
        instructor: (row.instructor as string) || null,
        capacity: (row.capacity as number) || null,
        is_active: true,
      }
      
      const existingId = classIdMap.get(vcClassId)
      
      if (existingId) {
        // Update existing class
        const { error } = await supabase
          .from('asp_classes')
          .update(classData)
          .eq('id', existingId)
        
        if (error) {
          errors.push(`Failed to update class ${vcClassId}: ${error.message}`)
        } else {
          classesUpdated++
        }
      } else {
        // Insert new class
        const { data: inserted, error } = await supabase
          .from('asp_classes')
          .insert(classData)
          .select('id')
          .single()
        
        if (error) {
          errors.push(`Failed to insert class ${vcClassId}: ${error.message}`)
        } else {
          classesInserted++
          classIdMap.set(vcClassId, inserted.id)
        }
      }
    }
    
    // 4. Deactivate classes no longer in BigQuery
    if (existingClasses) {
      for (const existing of existingClasses) {
        if (!bqClassIds.has(existing.vc_class_id)) {
          await supabase
            .from('asp_classes')
            .update({ is_active: false })
            .eq('id', existing.id)
          classesDeactivated++
        }
      }
    }
    
    // 5. Upsert enrollments
    const bqEnrollmentKeys = new Set<string>()
    
    for (const row of enrollmentRows) {
      const vcClassId = row.vc_class_id as string
      const studentPersonId = row.student_person_id as number
      const enrollmentStatus = row.enrollment_status as string
      
      const classUuid = classIdMap.get(vcClassId)
      if (!classUuid) {
        errors.push(`No class found for vc_class_id: ${vcClassId}`)
        continue
      }
      
      bqEnrollmentKeys.add(`${classUuid}:${studentPersonId}`)
      
      const enrollmentType = enrollmentStatus?.toLowerCase() === 'registered' ? 'registered' : 'enrolled'
      
      const { error } = await supabase
        .from('asp_enrollments')
        .upsert({
          class_id: classUuid,
          student_person_id: studentPersonId,
          enrollment_type: enrollmentType,
          source: 'veracross',
          status: 'active',
        }, { onConflict: 'class_id,student_person_id' })
      
      if (error) {
        errors.push(`Failed to upsert enrollment ${vcClassId}/${studentPersonId}: ${error.message}`)
      } else {
        enrollmentsUpserted++
      }
    }
    
    // 6. Deactivate Veracross enrollments no longer present
    const { data: existingEnrollments } = await supabase
      .from('asp_enrollments')
      .select('id, class_id, student_person_id')
      .eq('source', 'veracross')
      .eq('status', 'active')
    
    if (existingEnrollments) {
      for (const enrollment of existingEnrollments) {
        const key = `${enrollment.class_id}:${enrollment.student_person_id}`
        if (!bqEnrollmentKeys.has(key)) {
          await supabase
            .from('asp_enrollments')
            .update({ 
              status: 'inactive',
              removal_reason: 'Removed from Veracross'
            })
            .eq('id', enrollment.id)
          enrollmentsDeactivated++
        }
      }
    }
    
    // 7. Update last sync timestamp
    await supabase
      .from('asp_system_status')
      .upsert({
        id: 1,
        last_vc_sync: new Date().toISOString()
      }, { onConflict: 'id' })
    
    // 8. Log to audit
    await supabase.from('asp_audit_log').insert({
      action: 'sync',
      entity_type: 'system',
      new_value: {
        classes_inserted: classesInserted,
        classes_updated: classesUpdated,
        classes_deactivated: classesDeactivated,
        enrollments_upserted: enrollmentsUpserted,
        enrollments_deactivated: enrollmentsDeactivated,
        errors: errors.length,
        duration_ms: Date.now() - startTime
      }
    })
    
    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - startTime,
      classes: {
        inserted: classesInserted,
        updated: classesUpdated,
        deactivated: classesDeactivated,
        total_in_bq: classRows.length
      },
      enrollments: {
        upserted: enrollmentsUpserted,
        deactivated: enrollmentsDeactivated,
        total_in_bq: enrollmentRows.length
      },
      errors: errors.length > 0 ? errors : undefined,
      synced_at: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Error syncing ASP data:', error)
    return NextResponse.json(
      { error: 'Failed to sync ASP data', details: String(error) },
      { status: 500 }
    )
  }
}

// Support GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request)
}
