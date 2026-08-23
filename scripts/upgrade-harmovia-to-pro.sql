-- HarmiRecruit: manually upgrade the Harmovia workspace from Starter to Pro.
--
-- Target Cloud SQL database: harmoviajobs_courses_db
-- Target schema:             harmirecruit
--
-- Default subscription period: one month.
-- For an annual subscription, change INTERVAL '1 month' below to INTERVAL '1 year'.
-- This is a manual administrative activation and does not create a Razorpay
-- billing_payments row.

BEGIN;

SET LOCAL search_path TO harmirecruit, public;

DO $upgrade_harmovia_to_pro$
DECLARE
  v_tenant_id INTEGER;
  v_tenant_count INTEGER;
  v_current_plan TEXT;
  v_current_status TEXT;
  v_current_expiry TIMESTAMPTZ;
  v_subscription_period INTERVAL := INTERVAL '1 month';
BEGIN
  SELECT COUNT(*), MIN(id)
    INTO v_tenant_count, v_tenant_id
  FROM tenants
  WHERE LOWER(slug) = 'harmovia';

  IF v_tenant_count <> 1 OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'Expected exactly one Harmovia tenant, found %; subscription was not changed',
      v_tenant_count;
  END IF;

  SELECT plan, status, plan_expires_at
    INTO v_current_plan, v_current_status, v_current_expiry
  FROM tenants
  WHERE id = v_tenant_id
  FOR UPDATE;

  IF v_current_plan = 'enterprise' THEN
    RAISE EXCEPTION
      'Harmovia is already on Enterprise; refusing to downgrade it to Pro';
  ELSIF v_current_plan NOT IN ('starter', 'pro') THEN
    RAISE EXCEPTION
      'Unexpected current Harmovia plan: %; subscription was not changed',
      v_current_plan;
  END IF;

  UPDATE tenants
  SET plan = 'pro',
      status = 'active',
      trial_ends_at = NULL,
      plan_expires_at = CASE
        -- Rerunning the script must not repeatedly extend a current Pro period.
        WHEN v_current_plan = 'pro' AND v_current_expiry > NOW()
          THEN v_current_expiry
        ELSE NOW() + v_subscription_period
      END
  WHERE id = v_tenant_id;

  RAISE NOTICE
    'Harmovia upgraded: plan % -> pro, status % -> active',
    v_current_plan,
    v_current_status;
END
$upgrade_harmovia_to_pro$;

COMMIT;

-- Verification: must return one Harmovia row with plan=pro and status=active.
SELECT
  id,
  slug,
  name,
  plan,
  status,
  trial_ends_at,
  plan_expires_at
FROM harmirecruit.tenants
WHERE LOWER(slug) = 'harmovia';
