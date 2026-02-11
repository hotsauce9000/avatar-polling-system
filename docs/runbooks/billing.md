# Billing Runbook

## Credit Purchase Flow

1. Dashboard requests `POST /credits/checkout` with `pack_id`.
2. API creates Stripe Checkout Session and returns `checkout_url`.
3. User completes payment on Stripe-hosted page.
4. Stripe calls `POST /webhooks/stripe`.
5. API verifies webhook signature and applies credits via `apply_credit_purchase(...)`.
6. Credit operation is recorded in `credit_operations`.

## Idempotency

- `credit_operations.stripe_session_id` has a unique index.
- `apply_credit_purchase` uses `idempotency_key` + `stripe_session_id` guards.
- Webhook replay is safe and does not double-credit users.
- `apply_credit_purchase` is service-role-only and rejects non-service callers.

## Pre-Deploy Checks (Migration 0004)

Run before applying `supabase/migrations/0004_billing_analytics.sql`:

```sql
select stripe_session_id, count(*)
from public.credit_operations
where stripe_session_id is not null
group by stripe_session_id
having count(*) > 1;
```

Expected: zero rows (migration also deduplicates conservatively as a safety net).

Capture function definition for rollback:

```sql
select pg_get_functiondef('public.apply_credit_purchase(uuid,integer,uuid,text)'::regprocedure);
```

## Post-Deploy Verification

Verify index and policies:

```sql
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'credit_operations'
  and indexname = 'idx_credit_operations_stripe_session_unique';

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'analytics_events';
```

Smoke test webhook path with Stripe test event and verify:

- `POST /webhooks/stripe` returns `{ "ok": true }`
- `credit_operations` row inserted once per `stripe_session_id`
- `user_profiles.credit_balance` increments exactly once

## Environment Variables

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `WEB_APP_BASE_URL`
