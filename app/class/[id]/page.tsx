'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { ASPClass, ASPEnrollment, Student, EnrollmentWithStudent } from '@/types/asp'
import { 
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ClockIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'

type EnrollmentType = 'enrolled' | 'registered' | 'trial' | 'financial_aid' | 'drop_in'

const ENROLLMENT_TYPE_LABELS: Record<EnrollmentType, { label: string; color: string; bg: string }> = {
  enrolled: { label: 'VC Enrolled', color: 'text-green-700', bg: 'bg-green-100' },
  registered: { label: 'VC Registered', color: 'text-blue-700', bg: 'bg-blue-100' },
  trial: { label: 'Trial', color: 'text-purple-700', bg: 'bg-purple-100' },
  financial_aid: { label: 'Fin Aid', color: 'text-amber-700', bg: 'bg-amber-100' },
  drop_in: { label: 'Drop-in', color: 'text-cyan-700', bg: 'bg-cyan-100' },
}

export default function ClassDetailPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [classData, setClassData] = useState<ASPClass | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentWithStudent[]>([])
  const [absentStudents, setAbsentStudents] = useState<Set<number>>(new Set())
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedEnrollment, setSelectedEnrollment] = useState<EnrollmentWithStudent | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Add student form state
  const [newStudentId, setNewStudentId] = useState<number | null>(null)
  const [newEnrollmentType, setNewEnrollmentType] = useState<EnrollmentType>('drop_in')
  const [newNotes, setNewNotes] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user && classId) {
      loadClassData()
      loadEnrollments()
      loadAllStudents()
    }
  }, [user, classId])

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      router.push('/')
      return
    }
    setUser(session.user)
    setLoading(false)
  }

  async function loadClassData() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('asp_classes')
      .select('*')
      .eq('id', classId)
      .single()
    
    if (error) {
      console.error('Error loading class:', error)
      return
    }
    
    setClassData(data)
  }

  async function loadEnrollments() {
    const supabase = createClient()
    
    // Get enrollments
    const { data: enrollmentData, error: enrollmentError } = await supabase
      .from('asp_enrollments')
      .select('*')
      .eq('class_id', classId)
      .eq('status', 'active')
      .order('created_at')
    
    if (enrollmentError) {
      console.error('Error loading enrollments:', enrollmentError)
      return
    }
    
    if (!enrollmentData || enrollmentData.length === 0) {
      setEnrollments([])
      return
    }
    
    // Get student details for each enrollment
    const studentIds = enrollmentData.map(e => e.student_person_id)
    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .select('id, person_id, first_name, last_name, grade_level')
      .in('person_id', studentIds)
    
    if (studentError) {
      console.error('Error loading students:', studentError)
      return
    }
    
    // Check today's attendance
    const today = new Date().toISOString().split('T')[0]
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('person_id, status')
      .in('person_id', studentIds)
      .eq('date', today)
    
    const absentSet = new Set(
      attendanceData?.filter(a => a.status === 'Absent').map(a => a.person_id) || []
    )
    setAbsentStudents(absentSet)
    
    // Combine data
    const enrichedEnrollments = enrollmentData.map(enrollment => {
      const student = studentData?.find(s => s.person_id === enrollment.student_person_id)
      return {
        ...enrollment,
        student: student || {
          id: 0,
          person_id: enrollment.student_person_id,
          first_name: 'Unknown',
          last_name: 'Student',
          grade_level: 0
        }
      } as EnrollmentWithStudent
    })
    
    // Sort by last name
    enrichedEnrollments.sort((a, b) => 
      a.student.last_name.localeCompare(b.student.last_name)
    )
    
    setEnrollments(enrichedEnrollments)
  }

  async function loadAllStudents() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('students')
      .select('id, person_id, first_name, last_name, grade_level')
      .order('last_name')
      .order('first_name')
    
    if (error) {
      console.error('Error loading all students:', error)
      return
    }
    
    setAllStudents(data || [])
  }

  async function handleAddStudent() {
    if (!newStudentId || !user) return
    
    setSaving(true)
    const supabase = createClient()
    
    const student = allStudents.find(s => s.person_id === newStudentId)
    const studentName = student ? `${student.first_name} ${student.last_name}` : 'Unknown'
    
    const { data, error } = await supabase.from('asp_enrollments').insert({
      class_id: classId,
      student_person_id: newStudentId,
      status: 'active',
      source: 'manual',
      enrollment_type: newEnrollmentType,
      fee_paid: false,
      effective_start: new Date().toISOString().split('T')[0],
      effective_end: newEndDate || null,
      notes: newNotes || null,
      created_by: user.email,
      updated_by: user.email
    }).select('id').single()
    
    if (error) {
      console.error('Error adding student:', error)
      alert('Failed to add student. They may already be enrolled.')
    } else {
      // Log to audit
      await supabase.from('asp_audit_log').insert({
        table_name: 'asp_enrollments',
        record_id: data?.id,
        action: 'insert',
        changed_by: user.email,
        new_values: { 
          student: studentName, 
          enrollment_type: newEnrollmentType,
          notes: newNotes || null 
        }
      })
      
      setShowAddModal(false)
      setNewStudentId(null)
      setNewEnrollmentType('drop_in')
      setNewNotes('')
      setNewEndDate('')
      loadEnrollments()
    }
    
    setSaving(false)
  }

  async function handleRemoveStudent(enrollment: EnrollmentWithStudent) {
    if (!confirm(`Remove ${enrollment.student.first_name} ${enrollment.student.last_name} from this class?`)) {
      return
    }
    
    const supabase = createClient()
    
    const { error } = await supabase
      .from('asp_enrollments')
      .update({ 
        status: 'removed',
        removal_reason: 'manual_removal',
        updated_by: user?.email,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollment.id)
    
    if (error) {
      console.error('Error removing student:', error)
      alert('Failed to remove student.')
    } else {
      // Log to audit
      await supabase.from('asp_audit_log').insert({
        table_name: 'asp_enrollments',
        record_id: enrollment.id,
        action: 'delete',
        changed_by: user?.email,
        old_values: { 
          student: `${enrollment.student.first_name} ${enrollment.student.last_name}`,
          enrollment_type: enrollment.enrollment_type
        }
      })
      loadEnrollments()
    }
  }

  async function handleUpdateEnrollment() {
    if (!selectedEnrollment || !user) return
    
    setSaving(true)
    const supabase = createClient()
    
    const { error } = await supabase
      .from('asp_enrollments')
      .update({
        enrollment_type: newEnrollmentType,
        notes: newNotes || null,
        effective_end: newEndDate || null,
        updated_by: user.email,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedEnrollment.id)
    
    if (error) {
      console.error('Error updating enrollment:', error)
      alert('Failed to update enrollment.')
    } else {
      // Log to audit
      await supabase.from('asp_audit_log').insert({
        table_name: 'asp_enrollments',
        record_id: selectedEnrollment.id,
        action: 'update',
        changed_by: user.email,
        old_values: {
          enrollment_type: selectedEnrollment.enrollment_type,
          notes: selectedEnrollment.notes
        },
        new_values: {
          student: `${selectedEnrollment.student.first_name} ${selectedEnrollment.student.last_name}`,
          enrollment_type: newEnrollmentType,
          notes: newNotes || null
        }
      })
      
      setShowEditModal(false)
      setSelectedEnrollment(null)
      loadEnrollments()
    }
    
    setSaving(false)
  }

  function openEditModal(enrollment: EnrollmentWithStudent) {
    setSelectedEnrollment(enrollment)
    setNewEnrollmentType(enrollment.enrollment_type as EnrollmentType || 'enrolled')
    setNewNotes(enrollment.notes || '')
    setNewEndDate(enrollment.effective_end || '')
    setShowEditModal(true)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  // Filter students not already enrolled
  const enrolledStudentIds = enrollments.map(e => e.student_person_id)
  const availableStudents = allStudents.filter(s => 
    !enrolledStudentIds.includes(s.person_id) &&
    (searchQuery === '' || 
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-shefa-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Parse class name
  const nameParts = classData?.class_name.split(':') || []
  const displayName = nameParts.length > 2 
    ? nameParts[2].replace(/\([^)]*\)/, '').trim() 
    : nameParts[nameParts.length - 1]?.trim() || 'Unknown Class'

  return (
    <div className="min-h-screen bg-slate-50">
      <Header userEmail={user?.email} onSignOut={handleSignOut} />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Classes
        </button>
        
        {/* Class Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
              <p className="text-slate-500 text-sm mt-1">{classData?.vc_class_id}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-slate-600">
                <CalendarDaysIcon className="w-4 h-4" />
                <span>{classData?.day_of_week}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 mt-1">
                <ClockIcon className="w-4 h-4" />
                <span>
                  {classData?.start_time && classData?.end_time
                    ? `${formatTime(classData.start_time)} - ${formatTime(classData.end_time)}`
                    : 'Time TBD'}
                </span>
              </div>
            </div>
          </div>
          
          {classData?.instructor && classData.instructor !== 'None' && (
            <p className="text-slate-600 mt-3">
              Instructor: {classData.instructor}
            </p>
          )}
        </div>
        
        {/* Roster Section */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Roster Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <UserGroupIcon className="w-5 h-5 text-slate-600" />
              <h2 className="font-semibold text-slate-900">
                Roster ({enrollments.length} students)
              </h2>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-shefa-blue text-white rounded-lg hover:bg-shefa-blue/90 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add Student
            </button>
          </div>
          
          {/* Absent Alert */}
          {absentStudents.size > 0 && (
            <div className="p-3 bg-red-50 border-b border-red-100">
              <p className="text-sm text-red-700 font-medium">
                ⚠️ {absentStudents.size} student{absentStudents.size > 1 ? 's' : ''} marked absent today
              </p>
            </div>
          )}
          
          {/* Roster List */}
          {enrollments.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <UserGroupIcon className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p>No students enrolled in this class.</p>
              <p className="text-sm mt-1">Click "Add Student" to add students manually.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {enrollments.map(enrollment => {
                const isAbsent = absentStudents.has(enrollment.student_person_id)
                return (
                <div
                  key={enrollment.id}
                  className={`flex items-center justify-between p-4 hover:bg-slate-50 ${
                    isAbsent ? 'bg-red-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className={`font-medium ${isAbsent ? 'text-red-700' : 'text-slate-900'}`}>
                        {isAbsent && '⚠️ '}
                        {enrollment.student.last_name}, {enrollment.student.first_name}
                        {isAbsent && <span className="text-xs ml-2 text-red-600">(ABSENT)</span>}
                      </p>
                      <p className="text-sm text-slate-500">
                        Grade {enrollment.student.grade_level}
                      </p>
                    </div>
                    
                    {/* Enrollment Type Badge */}
                    {enrollment.enrollment_type && ENROLLMENT_TYPE_LABELS[enrollment.enrollment_type as EnrollmentType] && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        ENROLLMENT_TYPE_LABELS[enrollment.enrollment_type as EnrollmentType].bg
                      } ${ENROLLMENT_TYPE_LABELS[enrollment.enrollment_type as EnrollmentType].color}`}>
                        {ENROLLMENT_TYPE_LABELS[enrollment.enrollment_type as EnrollmentType].label}
                      </span>
                    )}
                    
                    {/* End Date Warning */}
                    {enrollment.effective_end && new Date(enrollment.effective_end) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && (
                      <span className="text-xs text-amber-700 flex items-center gap-1">
                        <ExclamationTriangleIcon className="w-3 h-3" />
                        Ends {new Date(enrollment.effective_end).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Notes indicator */}
                    {enrollment.notes && (
                      <span className="text-xs text-slate-500 max-w-[200px] truncate hidden sm:block">
                        "{enrollment.notes}"
                      </span>
                    )}
                    
                    <button
                      onClick={() => openEditModal(enrollment)}
                      className="p-2 text-slate-400 hover:text-shefa-blue rounded-lg hover:bg-slate-100"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => handleRemoveStudent(enrollment)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      title="Remove"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </main>
      
      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold">Add Student to Class</h3>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Student Search */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Search Student
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type to search..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-shefa-blue focus:border-transparent"
                />
              </div>
              
              {/* Student List */}
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                {availableStudents.slice(0, 50).map(student => (
                  <button
                    key={student.person_id}
                    onClick={() => setNewStudentId(student.person_id)}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between ${
                      newStudentId === student.person_id ? 'bg-shefa-blue/10' : ''
                    }`}
                  >
                    <span>
                      {student.last_name}, {student.first_name}
                      <span className="text-slate-500 ml-2">Gr {student.grade_level}</span>
                    </span>
                    {newStudentId === student.person_id && (
                      <CheckCircleIcon className="w-5 h-5 text-shefa-blue" />
                    )}
                  </button>
                ))}
                {availableStudents.length === 0 && (
                  <p className="p-3 text-slate-500 text-sm">No matching students found</p>
                )}
              </div>
              
              {/* Enrollment Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Enrollment Type
                </label>
                <select
                  value={newEnrollmentType}
                  onChange={(e) => setNewEnrollmentType(e.target.value as EnrollmentType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-shefa-blue focus:border-transparent"
                >
                  <option value="trial">Trial</option>
                  <option value="drop_in">Drop-in</option>
                  <option value="financial_aid">Financial Aid</option>
                  <option value="enrolled">Permanent (Manual)</option>
                </select>
              </div>
              
              {/* End Date (for trials/drop-ins) */}
              {(newEnrollmentType === 'trial' || newEnrollmentType === 'drop_in') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    End Date (optional)
                  </label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-shefa-blue focus:border-transparent"
                  />
                </div>
              )}
              
              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Why is this student being added?"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-shefa-blue focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setSearchQuery('')
                  setNewStudentId(null)
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStudent}
                disabled={!newStudentId || saving}
                className="px-4 py-2 bg-shefa-blue text-white rounded-lg hover:bg-shefa-blue/90 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Student'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Enrollment Modal */}
      {showEditModal && selectedEnrollment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold">
                Edit Enrollment: {selectedEnrollment.student.first_name} {selectedEnrollment.student.last_name}
              </h3>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Enrollment Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Enrollment Type
                </label>
                <select
                  value={newEnrollmentType}
                  onChange={(e) => setNewEnrollmentType(e.target.value as EnrollmentType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-shefa-blue focus:border-transparent"
                >
                  <option value="enrolled">VC Enrolled</option>
                  <option value="registered">VC Registered</option>
                  <option value="trial">Trial</option>
                  <option value="drop_in">Drop-in</option>
                  <option value="financial_aid">Financial Aid</option>
                </select>
              </div>
              
              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  End Date (leave blank for indefinite)
                </label>
                <input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-shefa-blue focus:border-transparent"
                />
              </div>
              
              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-shefa-blue focus:border-transparent"
                />
              </div>
              
              {/* Metadata */}
              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg">
                <p>Source: {selectedEnrollment.source}</p>
                <p>Added: {new Date(selectedEnrollment.created_at).toLocaleDateString()}</p>
                {selectedEnrollment.created_by && (
                  <p>By: {selectedEnrollment.created_by}</p>
                )}
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setSelectedEnrollment(null)
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateEnrollment}
                disabled={saving}
                className="px-4 py-2 bg-shefa-blue text-white rounded-lg hover:bg-shefa-blue/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(time: string): string {
  if (time.includes('-')) return time
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}
