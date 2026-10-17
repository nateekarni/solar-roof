-- Adds contact phone number column to users table for customer and staff identity.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
