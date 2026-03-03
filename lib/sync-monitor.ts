import { createClient } from '@supabase/supabase-js'

const APP_NAME = 'after-school-manager'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface SyncResult {
  status: 'success' | 'failed' | 'partial'
  records_processed?: number
  records_created?: number
  records_updated?: number
  records_failed?: number
  error_message?: string
  error_details?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export class SyncMonitor {
  private supabase = getServiceClient()
  private syncLogId: string | null = null
  private startedAt: number = Date.now()

  async syncStart(syncName: string, source: string, triggeredBy: 'scheduled' | 'manual' = 'scheduled'): Promise<void> {
    this.startedAt = Date.now()
    try {
      const { data, error } = await this.supabase
        .from('system_sync_log')
        .insert({
          sync_name: syncName,
          app_name: APP_NAME,
          status: 'running',
          triggered_by: triggeredBy,
          metadata: { source },
        })
        .select('id')
        .single()

      if (error) {
        console.error('[SyncMonitor] Failed to log sync start:', error.message)
        return
      }
      this.syncLogId = data?.id ?? null
    } catch (err) {
      console.error('[SyncMonitor] Error logging sync start:', err)
    }
  }

  async syncComplete(result: SyncResult): Promise<void> {
    const durationMs = Date.now() - this.startedAt
    try {
      const payload = {
        status: result.status,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        records_processed: result.records_processed,
        records_created: result.records_created,
        records_updated: result.records_updated,
        records_failed: result.records_failed,
        error_message: result.error_message,
        error_details: result.error_details,
        metadata: result.metadata,
      }

      if (this.syncLogId) {
        await this.supabase
          .from('system_sync_log')
          .update(payload)
          .eq('id', this.syncLogId)
      } else {
        await this.supabase
          .from('system_sync_log')
          .insert({ sync_name: 'unknown', app_name: APP_NAME, ...payload })
      }
    } catch (err) {
      console.error('[SyncMonitor] Error logging sync complete:', err)
    }
  }
}
