-- Historical gateways remain linked to their original site. The active-only
-- uniqueness introduced in050 replaces the legacy all-history uniqueness.
DROP INDEX IF EXISTS gateways_one_per_site_idx;
