-- Append-only migration. Run transactionally through db-migrate. Large existing
-- installations must create the two raw indexes in a reviewed maintenance window
-- (or separately CONCURRENTLY), then apply this migration before enabling reads.
CREATE INDEX IF NOT EXISTS telemetry_raw_site_time_idx ON telemetry_raw(site_id,source_time DESC);
CREATE INDEX IF NOT EXISTS telemetry_raw_device_time_idx ON telemetry_raw(device_id,source_time DESC);
CREATE TABLE energy_daily (
 device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 day date NOT NULL, opening_kwh numeric(24,8), closing_kwh numeric(24,8),
 opening_at timestamptz, closing_at timestamptz, sample_count integer NOT NULL,
 kwh numeric(24,8), quality text NOT NULL CHECK(quality IN ('complete','partial','missing','reset')),
 reason text, version bigint NOT NULL, refreshed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(device_id,day), CHECK(kwh IS NULL OR kwh>=0)
);
CREATE INDEX energy_daily_site_day_idx ON energy_daily(site_id,day);
CREATE TABLE energy_dirty_days (
 device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 day date NOT NULL, version bigint NOT NULL DEFAULT 1,
 dirtied_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(device_id,day)
);
CREATE TABLE energy_backfill_checkpoints (
 name text PRIMARY KEY, from_day date NOT NULL, to_day date NOT NULL,
 cursor_device uuid, cursor_day date, completed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), CHECK(to_day>=from_day)
);
-- F2 consumes these pending notices after a separately approved reconciliation.
-- No financial table or issued snapshot is updated by Q3.
CREATE TABLE energy_financial_impact_notices (
 device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE, day date NOT NULL,
 reason text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed')),
 noticed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(device_id,day,reason)
);
CREATE FUNCTION energy_mark_dirty(p_device uuid,p_at timestamptz,p_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE affected date; successor date;
BEGIN
 affected := (p_at AT TIME ZONE 'Asia/Bangkok')::date;
 SELECT (source_time AT TIME ZONE 'Asia/Bangkok')::date INTO successor FROM telemetry_raw
 WHERE device_id=p_device AND source_time>p_at AND total_energy_kwh IS NOT NULL ORDER BY source_time LIMIT 1;
 INSERT INTO energy_dirty_days(device_id,day)
 SELECT p_device,d FROM (SELECT affected d UNION SELECT affected-1 WHERE p_at=(affected::timestamp AT TIME ZONE 'Asia/Bangkok') UNION SELECT affected+1 UNION SELECT successor WHERE successor IS NOT NULL) days
 ORDER BY d ON CONFLICT(device_id,day) DO UPDATE SET version=energy_dirty_days.version+1,dirtied_at=now();
 IF p_reason IS NOT NULL THEN
  INSERT INTO energy_financial_impact_notices(device_id,day,reason)
  SELECT p_device,d,p_reason FROM (SELECT affected d UNION SELECT affected-1 WHERE p_at=(affected::timestamp AT TIME ZONE 'Asia/Bangkok') UNION SELECT affected+1 UNION SELECT successor WHERE successor IS NOT NULL) days
  WHERE d<(now() AT TIME ZONE 'Asia/Bangkok')::date
  ON CONFLICT(device_id,day,reason) DO UPDATE SET status='pending',noticed_at=now();
 END IF;
END $$;
CREATE FUNCTION energy_raw_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.total_energy_kwh IS NOT DISTINCT FROM OLD.total_energy_kwh AND NEW.quality IS NOT DISTINCT FROM OLD.quality
   AND NEW.mapping_version_id IS NOT DISTINCT FROM OLD.mapping_version_id
   AND NEW.source_time=OLD.source_time AND NEW.device_id=OLD.device_id AND NEW.site_id IS NOT DISTINCT FROM OLD.site_id THEN RETURN NEW; END IF;
  PERFORM energy_mark_dirty(OLD.device_id,OLD.source_time,'raw_correction');
  INSERT INTO energy_financial_impact_notices(device_id,day,reason) VALUES(OLD.device_id,(OLD.source_time AT TIME ZONE 'Asia/Bangkok')::date,'raw_correction')
   ON CONFLICT(device_id,day,reason) DO UPDATE SET status='pending',noticed_at=now();
 END IF;
 IF TG_OP='DELETE' THEN
  PERFORM energy_mark_dirty(OLD.device_id,OLD.source_time,'raw_correction'); RETURN OLD;
 END IF;
 IF NEW.total_energy_kwh IS NOT NULL THEN PERFORM energy_mark_dirty(NEW.device_id,NEW.source_time,CASE WHEN TG_OP='INSERT' THEN 'late_sample' ELSE 'raw_correction' END); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER energy_raw_dirty AFTER INSERT OR UPDATE OR DELETE ON telemetry_raw FOR EACH ROW EXECUTE FUNCTION energy_raw_changed();
CREATE FUNCTION energy_mapping_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.semantic_field='total_energy' THEN
  PERFORM energy_mark_dirty(NEW.device_id,NEW.effective_from);
  IF NEW.effective_to IS NOT NULL THEN PERFORM energy_mark_dirty(NEW.device_id,NEW.effective_to); END IF;
  INSERT INTO energy_financial_impact_notices(device_id,day,reason) VALUES(NEW.device_id,(NEW.effective_from AT TIME ZONE 'Asia/Bangkok')::date,'mapping_change')
   ON CONFLICT(device_id,day,reason) DO UPDATE SET status='pending',noticed_at=now();
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER energy_mapping_dirty AFTER INSERT OR UPDATE ON register_mapping_versions FOR EACH ROW EXECUTE FUNCTION energy_mapping_changed();
