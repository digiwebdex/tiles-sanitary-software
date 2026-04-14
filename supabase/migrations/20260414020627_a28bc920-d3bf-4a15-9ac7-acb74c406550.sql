-- Update Basic plan to Starter with email enabled
UPDATE subscription_plans 
SET name = 'Starter', 
    monthly_price = 999, 
    yearly_price = 10000, 
    max_users = 1, 
    email_enabled = true, 
    sms_enabled = false, 
    daily_summary_enabled = false
WHERE id = '93451caa-410b-4d00-b3f0-3e22b77cbd78';

-- Update Pro plan with correct pricing and all notifications
UPDATE subscription_plans 
SET monthly_price = 2000, 
    yearly_price = 20000, 
    max_users = 2, 
    email_enabled = true, 
    sms_enabled = true, 
    daily_summary_enabled = true
WHERE id = 'b978214c-b49e-4aa4-ade7-8aa9cb298c13';

-- Add Business plan with all notifications enabled
INSERT INTO subscription_plans (name, monthly_price, yearly_price, max_users, email_enabled, sms_enabled, daily_summary_enabled, is_active)
VALUES ('Business', 3000, 30000, 5, true, true, true, true);