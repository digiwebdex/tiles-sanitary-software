-- Drop old FK to plans table first
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_id_fkey;

-- Update existing subscription to use subscription_plans Starter plan id
UPDATE subscriptions 
SET plan_id = '93451caa-410b-4d00-b3f0-3e22b77cbd78' 
WHERE plan_id = '1cd1956a-cf39-4159-adc0-63a82f41458c';

-- Add new FK to subscription_plans table
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey 
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);