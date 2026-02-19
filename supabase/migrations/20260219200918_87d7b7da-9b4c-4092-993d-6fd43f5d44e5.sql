
-- ─── End-date-driven has_active_subscription() ───────────────────────────────
--
-- Previous implementation used status='active' as the primary gate, causing
-- false-blocks when the status field lagged behind the actual end_date.
--
-- New logic:
--   1. super_admin  → always TRUE (unchanged)
--   2. suspended    → always FALSE (unchanged)
--   3. end_date IS NULL → FALSE (no expiry date set)
--   4. TODAY <= end_date → TRUE  (within active window, regardless of status)
--   5. end_date < TODAY <= end_date + 3 days → TRUE (grace period)
--   6. beyond grace  → FALSE
--
-- Using DATE arithmetic with CURRENT_DATE (already local in Postgres per
-- the session timezone) ensures timezone-safe comparisons consistent with
-- the frontend parseLocalDate() helper.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _dealer_id uuid;
  _sub       record;
  _is_super  boolean;
BEGIN
  -- Rule 1: super_admin bypasses all subscription checks
  SELECT is_super_admin() INTO _is_super;
  IF _is_super THEN RETURN TRUE; END IF;

  -- Get dealer_id for the current user
  SELECT dealer_id INTO _dealer_id FROM profiles WHERE id = auth.uid();
  IF _dealer_id IS NULL THEN RETURN FALSE; END IF;

  -- Fetch latest subscription
  SELECT status, end_date INTO _sub
  FROM subscriptions
  WHERE dealer_id = _dealer_id
  ORDER BY start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Rule 2: suspended is always blocked, regardless of end_date
  IF _sub.status = 'suspended' THEN RETURN FALSE; END IF;

  -- Rule 3: no end_date → cannot determine validity → block
  IF _sub.end_date IS NULL THEN RETURN FALSE; END IF;

  -- Rule 4: within active window (end_date is the source of truth)
  IF CURRENT_DATE <= _sub.end_date THEN RETURN TRUE; END IF;

  -- Rule 5: within 3-day grace period after end_date
  IF CURRENT_DATE <= (_sub.end_date + interval '3 days')::date THEN
    RETURN TRUE;
  END IF;

  -- Rule 6: beyond grace → blocked
  RETURN FALSE;
END;
$$;
