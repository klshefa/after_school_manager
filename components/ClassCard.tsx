'use client'

import Link from 'next/link'
import { ASPClassWithCount } from '@/types/asp'
import { 
  ClockIcon, 
  UserGroupIcon, 
  MapPinIcon,
  ChevronRightIcon 
} from '@heroicons/react/24/outline'

interface ClassCardProps {
  classData: ASPClassWithCount
  isToday?: boolean
}

export function ClassCard({ classData, isToday }: ClassCardProps) {
  // Parse class name to get just the activity name
  // Format: "ASP1050-W: Winter : Ceramics Art (Mon)"
  const nameParts = classData.class_name.split(':')
  const displayName = nameParts.length > 2 
    ? nameParts[2].replace(/\([^)]*\)/, '').trim() 
    : nameParts[nameParts.length - 1].trim()
  
  const timeDisplay = classData.start_time && classData.end_time
    ? `${formatTime(classData.start_time)} - ${formatTime(classData.end_time)}`
    : 'Time TBD'
    
  return (
    <Link href={`/class/${classData.id}`}>
      <div className={`
        bg-white rounded-xl border p-5 transition-all hover:shadow-md hover:border-shefa-light cursor-pointer
        ${isToday ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'}
      `}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{displayName}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{classData.vc_class_id}</p>
          </div>
          <ChevronRightIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
        </div>
        
        {/* Details */}
        <div className="space-y-2 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-slate-400" />
            <span>{timeDisplay}</span>
          </div>
          
          {classData.instructor && classData.instructor !== 'None' && (
            <div className="flex items-center gap-2">
              <MapPinIcon className="w-4 h-4 text-slate-400" />
              <span>{classData.instructor}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <UserGroupIcon className="w-4 h-4 text-slate-400" />
            <span className="font-medium text-shefa-blue">
              {classData.enrollment_count} {classData.enrollment_count === 1 ? 'student' : 'students'}
            </span>
          </div>
        </div>
        
        {/* Today Badge */}
        {isToday && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
              Meeting Today
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

function formatTime(time: string): string {
  // Input format: "15:45:00" or "3:45 - 5:00"
  if (time.includes('-')) {
    return time // Already formatted
  }
  
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}
