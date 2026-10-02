CREATE TABLE telemetry_archives (
 id uuid PRIMARY KEY,
 site_id uuid NOT NULL REFERENCES sites(id),
 range_from timestamptz NOT NULL,
 range_to timestamptz NOT NULL CHECK(range_to>range_from),
 generation integer NOT NULL CHECK(generation>0),
 object_key text NOT NULL UNIQUE,
 execution uuid NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 bytes bigint NOT NULL CHECK(bytes>=0),
 row_count bigint NOT NULL CHECK(row_count>=0),
 schema_version integer NOT NULL CHECK(schema_version=1),
 etag text NOT NULL,
 snapshot_at timestamptz NOT NULL,
 verified_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id,range_from,range_to,generation)
);
CREATE INDEX telemetry_archives_lookup ON telemetry_archives(site_id,range_from,range_to,generation);
CREATE TABLE telemetry_retention_holds (
 id uuid PRIMARY KEY,
 site_id uuid REFERENCES sites(id),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 released_at timestamptz
);
-- Catalog entries identify immutable verified generations. Corrections append a generation.
CREATE FUNCTION reject_archive_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Verified archive catalog is append-only'; END;
$$;
CREATE TRIGGER telemetry_archives_immutable BEFORE UPDATE OR DELETE ON telemetry_archives
 FOR EACH ROW EXECUTE FUNCTION reject_archive_mutation();
-- One user cannot race report and restore submissions into two active exports.
CREATE UNIQUE INDEX platform_jobs_one_active_export ON platform_jobs(created_by)
 WHERE kind IN ('report','restore') AND status IN ('queued','running');

-- One checkpoint per site, and one coalesced dirty marker per Bangkok day; never per raw row.
CREATE TABLE telemetry_archive_scan(site_id uuid PRIMARY KEY REFERENCES sites(id),next_from timestamptz,completed boolean NOT NULL DEFAULT false);
CREATE TABLE telemetry_archive_dirty(site_id uuid NOT NULL REFERENCES sites(id),day timestamptz NOT NULL,PRIMARY KEY(site_id,day));
CREATE UNIQUE INDEX platform_jobs_one_active_archive_day ON platform_jobs((payload->>'siteId'),(payload->>'from'),(payload->>'to')) WHERE kind='archive' AND status IN ('queued','running');
CREATE FUNCTION archive_raw_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN
  INSERT INTO telemetry_archive_dirty VALUES(OLD.site_id,date_trunc('day',OLD.source_time AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok') ON CONFLICT DO NOTHING;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  INSERT INTO telemetry_archive_dirty VALUES(NEW.site_id,date_trunc('day',NEW.source_time AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END;
$$;
CREATE TRIGGER archive_raw_dirty AFTER INSERT OR UPDATE OR DELETE ON telemetry_raw FOR EACH ROW EXECUTE FUNCTION archive_raw_changed();
