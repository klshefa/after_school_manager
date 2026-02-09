'use client'

import { AcademicCapIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'

interface HeaderProps {
  userEmail?: string
  onSignOut: () => void
}

export function Header({ userEmail, onSignOut }: HeaderProps) {
  return (
    <header className="bg-shefa-blue text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <AcademicCapIcon className="w-8 h-8" />
            <div>
              <h1 className="text-lg font-bold">After School Manager</h1>
              <p className="text-xs text-blue-200">ASP Roster Management</p>
            </div>
          </div>
          
          {/* User & Sign Out */}
          <div className="flex items-center gap-4">
            {userEmail && (
              <span className="text-sm text-blue-200 hidden sm:block">
                {userEmail}
              </span>
            )}
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
