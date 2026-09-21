-- Migration 005: Clean Contract Scope (1 Contract per Site, School is looked up via Site)
ALTER TABLE contracts DROP COLUMN IF EXISTS school_id;
