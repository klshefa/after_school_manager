'use client'

import { UserGroupIcon } from '@heroicons/react/24/outline'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface StaffMember {
  person_id: number
  first_name: string
  last_name: string
  email: string
}

interface StaffLookupProps {
  onSelect: (staff: StaffMember) => void
  placeholder?: string
  className?: string
}

export function StaffLookup({ onSelect, placeholder = 'Search staff...', className = '' }: StaffLookupProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StaffMember[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const searchStaff = async () => {
      if (query.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('staff')
        .select('person_id, first_name, last_name, email')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .order('last_name')
        .limit(10)

      if (!error && data) {
        setResults(data)
      }
      setLoading(false)
    }

    const debounce = setTimeout(searchStaff, 200)
    return () => clearTimeout(debounce)
  }, [query])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (staff: StaffMember) => {
    onSelect(staff)
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-shefa-blue focus:border-transparent transition-all"
      />
      
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-shefa-blue border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-md max-h-60 overflow-auto"
        >
          {results.map((staff) => (
            <button
              key={staff.person_id}
              onClick={() => handleSelect(staff)}
              className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
            >
              <div className="font-medium text-slate-800">
                {staff.last_name}, {staff.first_name}
              </div>
              <div className="text-sm text-slate-500">{staff.email}</div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-md p-4"
        >
          <div className="text-center py-8">
            <UserGroupIcon className="w-10 h-10 mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 mb-1">No staff found</p>
            <p className="text-xs text-slate-500">Try a different search term</p>
          </div>
        </div>
      )}
    </div>
  )
}
