'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  ArrowLeftIcon,
  UserGroupIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PencilIcon
} from '@heroicons/react/24/outline'
import { StaffLookup } from '@/components/StaffLookup'

interface ASPUser {
  id: string
  email: string
  name: string | null
  is_active: boolean
  receives_daily_email: boolean
  created_at: string
}

interface AuditLog {
  id: string
  table_name: string
  record_id: string
  action: string
  changed_by: string
  old_values: any
  new_values: any
  changed_at: string
}

type TabType = 'users' | 'email' | 'sync' | 'audit'

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('users')
  
  // Users state
  const [aspUsers, setAspUsers] = useState<ASPUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<{ person_id: number; first_name: string; last_name: string; email: string } | null>(null)
  const [newUserReceivesEmail, setNewUserReceivesEmail] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  
  // Edit user state
  const [editingUser, setEditingUser] = useState<ASPUser | null>(null)
  const [editReceivesEmail, setEditReceivesEmail] = useState(false)
  const [editIsActive, setEditIsActive] = useState(true)
  
  // Sync state
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  
  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      loadASPUsers()
      loadLastSync()
    }
  }, [user])
  
  useEffect(() => {
    if (user && activeTab === 'audit') {
      loadAuditLogs()
    }
  }, [user, activeTab])

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

  async function loadASPUsers() {
    setLoadingUsers(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('asp_users')
      .select('*')
      .order('email')
    
    if (!error && data) {
      setAspUsers(data)
    }
    setLoadingUsers(false)
  }

  async function loadLastSync() {
    const supabase = createClient()
    const { data } = await supabase
      .from('asp_classes')
      .select('last_vc_sync')
      .order('last_vc_sync', { ascending: false })
      .limit(1)
      .single()
    
    if (data?.last_vc_sync) {
      setLastSync(new Date(data.last_vc_sync).toLocaleString())
    }
  }
  
  async function loadAuditLogs() {
    setLoadingAudit(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('asp_audit_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100)
    
    if (!error && data) {
      setAuditLogs(data)
    }
    setLoadingAudit(false)
  }

  async function handleAddUser() {
    if (!selectedStaff) return
    
    setSavingUser(true)
    const supabase = createClient()
    
    const { error } = await supabase.from('asp_users').insert({
      email: selectedStaff.email.toLowerCase().trim(),
      name: `${selectedStaff.first_name} ${selectedStaff.last_name}`,
      is_active: true,
      receives_daily_email: newUserReceivesEmail
    })
    
    if (error) {
      alert(error.message.includes('duplicate') 
        ? 'This staff member already has access.' 
        : 'Failed to add user.')
    } else {
      setShowAddUser(false)
      setSelectedStaff(null)
      setNewUserReceivesEmail(false)
      loadASPUsers()
    }
    
    setSavingUser(false)
  }

  function openEditUser(aspUser: ASPUser) {
    setEditingUser(aspUser)
    setEditReceivesEmail(aspUser.receives_daily_email)
    setEditIsActive(aspUser.is_active)
  }

  async function handleSaveEdit() {
    if (!editingUser) return
    
    setSavingUser(true)
    const supabase = createClient()
    
    const { error } = await supabase
      .from('asp_users')
      .update({ 
        is_active: editIsActive, 
        receives_daily_email: editReceivesEmail,
        updated_at: new Date().toISOString() 
      })
      .eq('id', editingUser.id)
    
    if (!error) {
      setEditingUser(null)
      loadASPUsers()
    } else {
      alert('Failed to update user.')
    }
    
    setSavingUser(false)
  }

  async function handleToggleEmail(aspUser: ASPUser) {
    const supabase = createClient()
    const { error } = await supabase
      .from('asp_users')
      .update({ receives_daily_email: !aspUser.receives_daily_email, updated_at: new Date().toISOString() })
      .eq('id', aspUser.id)
    
    if (!error) {
      loadASPUsers()
    }
  }

  async function handleDeleteUser(aspUser: ASPUser) {
    if (!confirm(`Remove ${aspUser.email} from ASP Manager access?`)) return
    
    const supabase = createClient()
    const { error } = await supabase
      .from('asp_users')
      .delete()
      .eq('id', aspUser.id)
    
    if (!error) {
      loadASPUsers()
    }
  }

  async function handleManualSync() {
    setSyncing(true)
    setSyncResult(null)
    
    try {
      const response = await fetch('/api/sync', { method: 'POST' })
      const result = await response.json()
      
      if (response.ok) {
        setSyncResult(`Sync complete: ${result.classesUpdated} classes, ${result.enrollmentsUpdated} enrollments updated.`)
        loadLastSync()
      } else {
        setSyncResult(`Sync failed: ${result.error}`)
      }
    } catch (err) {
      setSyncResult('Sync failed: Network error')
    }
    
    setSyncing(false)
  }

  async function handleSendTestEmail() {
    try {
      const response = await fetch('/api/send-daily-email?test=true', { method: 'POST' })
      const result = await response.json()
      
      if (response.ok) {
        alert(`Test email sent to ${result.sentTo}`)
      } else {
        alert(`Failed: ${result.error}`)
      }
    } catch {
      alert('Failed to send test email')
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-shefa-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const emailRecipients = aspUsers.filter(u => u.receives_daily_email && u.is_active)
  
  function formatAction(action: string): string {
    const actions: Record<string, string> = {
      insert: 'Added',
      update: 'Updated',
      delete: 'Removed',
      sync: 'Synced',
      create: 'Created'
    }
    return actions[action?.toLowerCase()] || action
  }
  
  function formatTableName(table: string): string {
    const tables: Record<string, string> = {
      asp_enrollments: 'Enrollments',
      asp_classes: 'Classes',
      asp_users: 'Users'
    }
    return tables[table] || table
  }

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
          Back to Dashboard
        </button>
        
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Admin Settings</h1>
          <p className="text-slate-600 mt-1">Manage users, email notifications, and data sync</p>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200 pb-4">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-shefa-blue text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <UserGroupIcon className="w-4 h-4" />
            Users
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'email'
                ? 'bg-shefa-blue text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <EnvelopeIcon className="w-4 h-4" />
            Email Settings
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'sync'
                ? 'bg-shefa-blue text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ArrowPathIcon className="w-4 h-4" />
            Data Sync
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'audit'
                ? 'bg-shefa-blue text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ClockIcon className="w-4 h-4" />
            Activity Log
          </button>
        </div>
        
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="font-semibold text-slate-900">Portal Users</h2>
              <button
                onClick={() => setShowAddUser(true)}
                className="flex items-center gap-2 px-3 py-2 bg-shefa-blue text-white rounded-lg text-sm hover:bg-shefa-blue/90"
              >
                <PlusIcon className="w-4 h-4" />
                Add User
              </button>
            </div>
            
            {loadingUsers ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-shefa-blue border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {aspUsers.map(aspUser => (
                  <div key={aspUser.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-slate-900">{aspUser.email}</p>
                      {aspUser.name && (
                        <p className="text-sm text-slate-500">{aspUser.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          aspUser.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {aspUser.is_active ? (
                          <><CheckCircleIcon className="w-3 h-3" /> Active</>
                        ) : (
                          <><XCircleIcon className="w-3 h-3" /> Inactive</>
                        )}
                      </span>
                      {aspUser.receives_daily_email && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                          <EnvelopeIcon className="w-3 h-3" /> Email
                        </span>
                      )}
                      <button
                        onClick={() => openEditUser(aspUser)}
                        className="p-2 text-slate-400 hover:text-shefa-blue rounded hover:bg-slate-100"
                        title="Edit user"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(aspUser)}
                        className="p-2 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                        title="Delete user"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {aspUsers.length === 0 && (
                  <p className="p-4 text-center text-slate-500">No users configured</p>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Email Tab */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h2 className="font-semibold text-slate-900">Daily Email Recipients</h2>
                <p className="text-sm text-slate-500 mt-1">
                  These users will receive the daily ASP roster email at 8:00 AM
                </p>
              </div>
              
              <div className="divide-y divide-slate-100">
                {aspUsers.filter(u => u.is_active).map(aspUser => (
                  <div key={aspUser.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-slate-900">{aspUser.email}</p>
                      {aspUser.name && (
                        <p className="text-sm text-slate-500">{aspUser.name}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleEmail(aspUser)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        aspUser.receives_daily_email
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      <EnvelopeIcon className="w-4 h-4" />
                      {aspUser.receives_daily_email ? 'Receiving' : 'Not Receiving'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Summary & Test */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Email Summary</h3>
              <p className="text-slate-600 mb-4">
                <span className="font-medium text-shefa-blue">{emailRecipients.length}</span> users will receive the daily email:
              </p>
              {emailRecipients.length > 0 ? (
                <ul className="text-sm text-slate-600 space-y-1 mb-6">
                  {emailRecipients.map(u => (
                    <li key={u.id}>• {u.email}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 mb-6">No recipients configured yet.</p>
              )}
              
              <button
                onClick={handleSendTestEmail}
                disabled={emailRecipients.length === 0}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Test Email Now
              </button>
            </div>
          </div>
        )}
        
        {/* Sync Tab */}
        {activeTab === 'sync' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Veracross Data Sync</h2>
            
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-slate-600">
                  <span className="font-medium">Last Sync:</span>{' '}
                  {lastSync || 'Never'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Data is automatically synced daily at 6:00 AM from BigQuery
                </p>
              </div>
              
              {syncResult && (
                <div className={`p-4 rounded-lg ${
                  syncResult.includes('failed') 
                    ? 'bg-red-50 text-red-700' 
                    : 'bg-green-50 text-green-700'
                }`}>
                  {syncResult}
                </div>
              )}
              
              <button
                onClick={handleManualSync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-shefa-blue text-white rounded-lg hover:bg-shefa-blue/90 disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="font-medium text-slate-900 mb-2">What gets synced:</h3>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• Classes from BigQuery asp_class_list</li>
                  <li>• Enrollments from BigQuery asp_rosters</li>
                  <li>• New students are added, removed students are marked inactive</li>
                  <li>• Manual additions (trials, drop-ins, etc.) are preserved</li>
                </ul>
              </div>
            </div>
          </div>
        )}
        
        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="font-semibold text-slate-900">Activity Log</h2>
              <p className="text-sm text-slate-500 mt-1">
                Recent changes to enrollments and classes
              </p>
            </div>
            
            {loadingAudit ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-shefa-blue border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No activity logged yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {auditLogs.map(log => (
                  <div key={log.id} className="p-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">
                          {formatAction(log.action)} in {formatTableName(log.table_name)}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                          By: {log.changed_by || 'Unknown'}
                        </p>
                        {log.new_values && (
                          <pre className="text-xs text-slate-600 bg-slate-50 p-2 rounded mt-2 max-w-md overflow-x-auto">
                            {JSON.stringify(log.new_values, null, 2)}
                          </pre>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {new Date(log.changed_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      
      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Add Portal User</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Search Staff *
                </label>
                {selectedStaff ? (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <p className="font-medium text-slate-900">
                        {selectedStaff.first_name} {selectedStaff.last_name}
                      </p>
                      <p className="text-sm text-slate-500">{selectedStaff.email}</p>
                    </div>
                    <button
                      onClick={() => setSelectedStaff(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <XCircleIcon className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <StaffLookup
                    onSelect={(staff) => setSelectedStaff(staff)}
                    placeholder="Type to search staff by name or email..."
                  />
                )}
              </div>
              
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="receives-email"
                  checked={newUserReceivesEmail}
                  onChange={(e) => setNewUserReceivesEmail(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-shefa-blue focus:ring-shefa-blue"
                />
                <label htmlFor="receives-email" className="text-sm text-slate-700">
                  Receives daily roster email
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddUser(false)
                  setSelectedStaff(null)
                  setNewUserReceivesEmail(false)
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                disabled={!selectedStaff || savingUser}
                className="px-4 py-2 bg-shefa-blue text-white rounded-lg hover:bg-shefa-blue/90 disabled:opacity-50"
              >
                {savingUser ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Edit User</h3>
            
            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
              <p className="font-medium text-slate-900">{editingUser.name || editingUser.email}</p>
              <p className="text-sm text-slate-500">{editingUser.email}</p>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-shefa-blue focus:ring-shefa-blue"
                />
                <label htmlFor="edit-active" className="text-sm text-slate-700">
                  Active (can access portal)
                </label>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="edit-email"
                  checked={editReceivesEmail}
                  onChange={(e) => setEditReceivesEmail(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-shefa-blue focus:ring-shefa-blue"
                />
                <label htmlFor="edit-email" className="text-sm text-slate-700">
                  Receives daily roster email
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingUser}
                className="px-4 py-2 bg-shefa-blue text-white rounded-lg hover:bg-shefa-blue/90 disabled:opacity-50"
              >
                {savingUser ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
