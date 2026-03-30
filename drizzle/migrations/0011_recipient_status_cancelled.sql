ALTER TYPE recipient_status ADD VALUE IF NOT EXISTS 'cancelled';

UPDATE campaign_recipients
SET status = 'cancelled', last_error = NULL
WHERE status = 'failed'
  AND last_error = '{"cancelled":true}';
