-- Adds Cancel OTP / Resend OTP support to the cow registration authorization workflow.
-- Idempotent: safe to run multiple times.

ALTER TABLE cow_registration_batches ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL;
ALTER TABLE cow_registration_authorizations ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL;
ALTER TABLE cow_registration_authorizations ADD COLUMN IF NOT EXISTS resend_count INT NOT NULL DEFAULT 0;
