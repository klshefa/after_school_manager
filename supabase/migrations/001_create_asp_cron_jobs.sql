-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule ASP daily email
-- Runs at 8:30 AM ET (13:30 UTC) Monday-Thursday
SELECT cron.schedule(
  'asp-daily-email',
  '30 13 * * 1-4',
  $$
  SELECT net.http_post(
    url := 'https://jbmwfdxzsvpfwfpndjay.supabase.co/functions/v1/send-asp-daily-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Schedule ASP data sync
-- Runs at 8:15 AM ET (13:15 UTC) Monday-Friday
SELECT cron.schedule(
  'asp-data-sync',
  '15 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://afterschool.shefaschool.org/api/sync-asp-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
