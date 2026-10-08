-- Organizations contain multiple sites; all current authorization derives school_id
-- from the specific site's primary key and operations queries bind school_id arrays.
-- Keep the relationship and foreign keys; remove only obsolete cardinality constraint.
DROP INDEX IF EXISTS sites_one_per_school_idx;
CREATE INDEX IF NOT EXISTS sites_school_id_idx ON sites(school_id);
