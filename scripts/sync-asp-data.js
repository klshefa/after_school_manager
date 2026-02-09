#!/usr/bin/env node
/**
 * Sync ASP (After School Program) data from BigQuery to Supabase
 * 
 * Source: BigQuery `asp_class_list` and `asp_rosters` tables
 * Target: Supabase `asp_classes` and `asp_enrollments` tables
 * 
 * Usage: 
 *   node scripts/sync-asp-data.js
 * 
 * Prerequisites:
 * - gcloud CLI authenticated (gcloud auth application-default login)
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * 
 * Can also be run via GitHub Actions on a schedule.
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rkfwphowryckqkozscfi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BIGQUERY_PROJECT = 'vc-data-1-project';

// Current school year
const CURRENT_SCHOOL_YEAR = '25-26';

async function queryBigQuery(sql) {
  console.log('Querying BigQuery...');
  
  // Write SQL to temp file to avoid shell escaping issues
  const tempFile = '/tmp/bq_query.sql';
  fs.writeFileSync(tempFile, sql);
  
  const { stdout, stderr } = await execPromise(
    `bq query --use_legacy_sql=false --project_id=${BIGQUERY_PROJECT} --format=json --max_rows=10000 < ${tempFile}`,
    { maxBuffer: 50 * 1024 * 1024 }
  );
  
  if (stderr && !stderr.includes('Waiting on')) {
    console.log('BigQuery stderr:', stderr);
  }
  
  return JSON.parse(stdout);
}

async function supabaseRequest(method, endpoint, body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const options = {
    method,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase ${method} failed: ${response.status} - ${error}`);
  }
  
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function upsertClasses(classes) {
  console.log(`\nUpserting ${classes.length} classes...`);
  
  const batchSize = 50;
  let successCount = 0;
  
  for (let i = 0; i < classes.length; i += batchSize) {
    const batch = classes.slice(i, i + batchSize);
    
    const url = `asp_classes?on_conflict=vc_class_id`;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${url}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`  Batch error: ${error}`);
    } else {
      successCount += batch.length;
    }
  }
  
  console.log(`  ✓ Upserted ${successCount} classes`);
  return successCount;
}

async function getClassIdMap() {
  // Get mapping of vc_class_id -> uuid from asp_classes
  const response = await fetch(`${SUPABASE_URL}/rest/v1/asp_classes?select=id,vc_class_id`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    }
  });
  
  const classes = await response.json();
  const map = {};
  for (const c of classes) {
    map[c.vc_class_id] = c.id;
  }
  return map;
}

async function syncEnrollments(enrollments, classIdMap) {
  console.log(`\nSyncing ${enrollments.length} enrollments...`);
  
  // First, get existing VC-sourced enrollments
  const existingResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/asp_enrollments?source=eq.veracross&select=id,class_id,student_person_id`, 
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      }
    }
  );
  const existingEnrollments = await existingResponse.json();
  const existingKeys = new Set(existingEnrollments.map(e => `${e.class_id}|${e.student_person_id}`));
  
  // Prepare new enrollments with uuid class_id
  const newEnrollments = [];
  const currentKeys = new Set();
  
  for (const e of enrollments) {
    const classUuid = classIdMap[e.vc_class_id];
    if (!classUuid) {
      console.log(`  Warning: No class found for ${e.vc_class_id}`);
      continue;
    }
    
    const key = `${classUuid}|${e.student_person_id}`;
    currentKeys.add(key);
    
    newEnrollments.push({
      class_id: classUuid,
      student_person_id: e.student_person_id,
      status: 'active',
      source: 'veracross',
      enrollment_type: 'full',
      fee_paid: e.fee_paid,
      notes: e.notes || null,
      created_by: 'sync_script',
      updated_by: 'sync_script',
      updated_at: new Date().toISOString()
    });
  }
  
  // Upsert enrollments in batches
  const batchSize = 100;
  let upsertedCount = 0;
  
  for (let i = 0; i < newEnrollments.length; i += batchSize) {
    const batch = newEnrollments.slice(i, i + batchSize);
    
    const url = `asp_enrollments?on_conflict=class_id,student_person_id`;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${url}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`  Batch error: ${error}`);
    } else {
      upsertedCount += batch.length;
    }
    
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(newEnrollments.length / batchSize)} complete`);
  }
  
  // Mark removed students as inactive (only for veracross-sourced enrollments)
  const toDeactivate = [...existingKeys].filter(key => !currentKeys.has(key));
  let deactivatedCount = 0;
  
  if (toDeactivate.length > 0) {
    console.log(`\n  Deactivating ${toDeactivate.length} removed enrollments...`);
    
    for (const key of toDeactivate) {
      const [classId, studentPersonId] = key.split('|');
      
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/asp_enrollments?class_id=eq.${classId}&student_person_id=eq.${studentPersonId}&source=eq.veracross`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            status: 'inactive',
            removal_reason: 'Removed from Veracross',
            updated_by: 'sync_script',
            updated_at: new Date().toISOString()
          })
        }
      );
      
      if (response.ok) {
        deactivatedCount++;
      }
    }
  }
  
  console.log(`  ✓ Upserted ${upsertedCount} enrollments`);
  console.log(`  ✓ Deactivated ${deactivatedCount} removed enrollments`);
  
  return { upserted: upsertedCount, deactivated: deactivatedCount };
}

function parseMeetingTimes(meetingTimes) {
  // Parse meeting times like "M:3:45 - 5:00" or "W:3:45 - 5:00"
  // Returns { day_of_week, start_time, end_time }
  
  if (!meetingTimes) return { day_of_week: 'Unknown', start_time: null, end_time: null };
  
  const dayMap = {
    'M': 'Monday',
    'T': 'Tuesday', 
    'W': 'Wednesday',
    'R': 'Thursday',
    'F': 'Friday'
  };
  
  const match = meetingTimes.match(/^([MTWRF]):(\d+:\d+)\s*-\s*(\d+:\d+)$/);
  
  if (match) {
    return {
      day_of_week: dayMap[match[1]] || match[1],
      start_time: match[2] + ':00',
      end_time: match[3] + ':00'
    };
  }
  
  // Try to at least extract the day
  const dayMatch = meetingTimes.match(/^([MTWRF])/);
  if (dayMatch) {
    return {
      day_of_week: dayMap[dayMatch[1]] || dayMatch[1],
      start_time: null,
      end_time: null
    };
  }
  
  return { day_of_week: 'Unknown', start_time: null, end_time: null };
}

async function main() {
  console.log('='.repeat(60));
  console.log('ASP Data Sync: BigQuery → Supabase');
  console.log('='.repeat(60));
  console.log(`School Year: ${CURRENT_SCHOOL_YEAR}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  if (!SUPABASE_SERVICE_KEY) {
    console.error('\n❌ ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    process.exit(1);
  }
  
  try {
    // ========== SYNC CLASSES ==========
    console.log('\n--- Syncing Classes ---');
    
    const classSql = `
      SELECT 
        \`Class ID\` as class_id,
        \`Program Name\` as program_name,
        \`Teacher\` as teacher,
        \`School Year\` as school_year,
        \`Meeting Times\` as meeting_times,
        \`Minimum Grade Level\` as min_grade,
        \`Maximum Grade Level\` as max_grade,
        \`Begin Date\` as begin_date,
        \`End Date\` as end_date,
        \`Status\` as status
      FROM \`vc-data-1-project.vc_data.asp_class_list\`
      WHERE \`School Year\` = '${CURRENT_SCHOOL_YEAR}'
        AND \`Status\` = 'Active'
    `;
    
    const classRows = await queryBigQuery(classSql);
    console.log(`✓ Fetched ${classRows.length} classes from BigQuery`);
    
    // Transform classes
    const classes = classRows.map(row => {
      const { day_of_week, start_time, end_time } = parseMeetingTimes(row.meeting_times);
      
      // Extract class name from program name (e.g., "ASP1050-W: Winter : Ceramics Art (Mon)" -> "Ceramics Art (Mon)")
      const nameParts = row.program_name.split(':');
      const className = nameParts.length > 2 ? nameParts.slice(2).join(':').trim() : row.program_name;
      
      // Determine semester from class ID or grading period
      let semester = null;
      if (row.class_id.includes('-W')) {
        semester = 'ASP Semester 2';  // Winter = Semester 2
      } else if (row.class_id.includes('-F')) {
        semester = 'ASP Semester 1';  // Fall = Semester 1
      }
      
      return {
        vc_class_id: row.class_id,
        class_name: className,
        instructor: row.teacher !== 'None' ? row.teacher : null,
        day_of_week,
        start_time,
        end_time,
        semester,
        school_year: row.school_year,
        min_grade: row.min_grade,
        max_grade: row.max_grade,
        is_active: true,
        last_vc_sync: new Date().toISOString()
      };
    });
    
    const classCount = await upsertClasses(classes);
    
    // Get class ID mapping for enrollments
    const classIdMap = await getClassIdMap();
    
    // ========== SYNC ENROLLMENTS ==========
    console.log('\n--- Syncing Enrollments ---');
    
    const enrollmentSql = `
      SELECT 
        \`CLASS: Class ID\` as vc_class_id,
        \`STUDENT: Person ID\` as student_person_id,
        \`Person\` as student_name,
        \`Grade\` as grade,
        \`Currently Enrolled\` as currently_enrolled,
        \`Fee Paid\` as fee_paid,
        \`Notes\` as notes
      FROM \`vc-data-1-project.vc_data.asp_rosters\`
      WHERE \`CLASS: School Year\` = '${CURRENT_SCHOOL_YEAR}'
        AND \`Currently Enrolled\` = true
    `;
    
    const enrollmentRows = await queryBigQuery(enrollmentSql);
    console.log(`✓ Fetched ${enrollmentRows.length} enrollments from BigQuery`);
    
    // Transform enrollments
    const enrollments = enrollmentRows.map(row => ({
      vc_class_id: row.vc_class_id,
      student_person_id: parseInt(row.student_person_id),
      fee_paid: row.fee_paid === true || row.fee_paid === 'true',
      notes: row.notes || null
    }));
    
    const enrollmentResult = await syncEnrollments(enrollments, classIdMap);
    
    // ========== MARK INACTIVE CLASSES ==========
    console.log('\n--- Marking Inactive Classes ---');
    
    // Get all active classes in DB
    const activeClassesResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/asp_classes?is_active=eq.true&select=vc_class_id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        }
      }
    );
    const activeClasses = await activeClassesResponse.json();
    const activeClassIds = new Set(activeClasses.map(c => c.vc_class_id));
    const currentClassIds = new Set(classes.map(c => c.vc_class_id));
    
    // Deactivate classes no longer in BigQuery
    const toDeactivate = [...activeClassIds].filter(id => !currentClassIds.has(id));
    let deactivatedClasses = 0;
    
    for (const vcClassId of toDeactivate) {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/asp_classes?vc_class_id=eq.${encodeURIComponent(vcClassId)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ is_active: false })
        }
      );
      if (response.ok) deactivatedClasses++;
    }
    
    console.log(`  ✓ Deactivated ${deactivatedClasses} classes no longer in Veracross`);
    
    // ========== LOG AUDIT ==========
    await fetch(`${SUPABASE_URL}/rest/v1/asp_audit_log`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        table_name: 'asp_classes',
        action: 'sync',
        changed_by: 'sync_script',
        new_values: {
          classes_synced: classCount,
          enrollments_synced: enrollmentResult.upserted,
          enrollments_deactivated: enrollmentResult.deactivated,
          classes_deactivated: deactivatedClasses,
          sync_time: new Date().toISOString()
        }
      })
    });
    
    // ========== SUMMARY ==========
    console.log('\n' + '='.repeat(60));
    console.log('✓ Sync complete!');
    console.log('='.repeat(60));
    console.log(`  Classes synced: ${classCount}`);
    console.log(`  Classes deactivated: ${deactivatedClasses}`);
    console.log(`  Enrollments synced: ${enrollmentResult.upserted}`);
    console.log(`  Enrollments deactivated: ${enrollmentResult.deactivated}`);
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  }
}

main();
