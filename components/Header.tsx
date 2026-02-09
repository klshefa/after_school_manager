'use client'

import Link from 'next/link'
import { AcademicCapIcon, ArrowRightOnRectangleIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'

interface HeaderProps {
  userEmail?: string
  onSignOut: () => void
  showAdminLink?: boolean
}

export function Header({ userEmail, onSignOut, showAdminLink = true }: HeaderProps) {
  return (
    <header className="bg-shefa-blue text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <AcademicCapIcon className="w-8 h-8" />
            <div>
              <h1 className="text-lg font-bold">After School Manager</h1>
              <p className="text-xs text-blue-200">ASP Roster Management</p>
            </div>
          </Link>
          
          {/* User & Actions */}
          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="text-sm text-blue-200 hidden md:block">
                {userEmail}
              </span>
            )}
            
            {showAdminLink && (
              <Link
                href="/admin"
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <Cog6ToothIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
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
