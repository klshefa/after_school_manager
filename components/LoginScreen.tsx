'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { AcademicCapIcon } from '@heroicons/react/24/outline'

interface LoginScreenProps {
  onSignIn: () => void
  loading?: boolean
  error?: string
}

export function LoginScreen({ onSignIn, loading = false, error }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-shefa-blue px-8 py-6 text-center">
            <div className="flex justify-center mb-4">
              <AcademicCapIcon className="w-12 h-12 text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-bold text-white">After School Manager</h1>
            <p className="text-blue-200 text-sm mt-1">Manage ASP rosters and enrollments</p>
          </div>
          
          {/* Body */}
          <div className="p-8">
            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
              >
                {error}
              </motion.div>
            )}
            
            {/* Google Sign-In Button */}
            <motion.button
              onClick={onSignIn}
              disabled={loading}
              whileHover={loading ? {} : { scale: 1.02 }}
              whileTap={loading ? {} : { scale: 0.98 }}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 
                       border border-slate-300 rounded-lg hover:bg-slate-50 
                       transition-colors font-medium text-slate-700
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </motion.button>
            
            <p className="text-xs text-slate-500 text-center mt-6">
              Access restricted to @shefaschool.org accounts
            </p>
          </div>
        </div>
        
        {/* Footer */}
        <p className="text-xs text-slate-400 text-center mt-6">
          © 2026 Shefa School. All rights reserved.
        </p>
      </div>
    </div>
  )
}
