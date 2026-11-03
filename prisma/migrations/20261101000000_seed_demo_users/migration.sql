-- Seed the documented demo accounts for environments using migrations only.
-- Keep this migration idempotent so it is safe when an account was created first.
INSERT INTO "User" ("id", "phone", "role", "isVerified")
VALUES
  ('10000000-0000-4000-8000-000000000001', '+923001234561', 'PATIENT', true),
  ('10000000-0000-4000-8000-000000000002', '+923001234562', 'DOCTOR', true),
  ('10000000-0000-4000-8000-000000000003', '+923001234563', 'PHARMACIST', true),
  ('10000000-0000-4000-8000-000000000004', '+923001234564', 'SUPER_ADMIN', true),
  ('10000000-0000-4000-8000-000000000005', '+923001234565', 'PATIENT', true)
ON CONFLICT ("phone") DO NOTHING;
