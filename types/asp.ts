export interface ASPClass {
  id: string
  vc_class_id: string
  class_name: string
  instructor: string | null
  room: string | null
  day_of_week: string
  start_time: string | null
  end_time: string | null
  semester: string
  school_year: string
  min_grade: string | null
  max_grade: string | null
  is_active: boolean
  last_vc_sync: string | null
  created_at: string
}

export interface ASPEnrollment {
  id: string
  class_id: string
  student_person_id: number
  status: 'active' | 'removed' | 'expired'
  source: 'veracross' | 'manual'
  enrollment_type: 'enrolled' | 'registered' | 'trial' | 'financial_aid' | 'drop_in' | null
  fee_paid: boolean
  effective_start: string | null
  effective_end: string | null
  notes: string | null
  removal_reason: string | null
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

export interface Student {
  id: number
  person_id: number
  first_name: string
  last_name: string
  grade_level: number
}

export interface ASPClassWithCount extends ASPClass {
  enrollment_count: number
  absent_count?: number
}

export interface EnrollmentWithStudent extends ASPEnrollment {
  student: Student
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday'

export const DAYS_OF_WEEK: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday']

export function getDayName(date: Date): DayOfWeek | null {
  const days: (DayOfWeek | null)[] = [null, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', null, null]
  return days[date.getDay()]
}

export function getTodayDayName(): DayOfWeek | null {
  return getDayName(new Date())
}
