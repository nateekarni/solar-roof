-- Actual lifecycle events, written in the business transaction. Contract history
-- starts here: legacy contracts have no creation timestamp, so no dates are guessed.
CREATE TABLE IF NOT EXISTS notification_feed_events (
 id text PRIMARY KEY, site_id uuid NOT NULL REFERENCES sites(id),
 title text NOT NULL, detail text NOT NULL, destination text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_feed_events_site_time ON notification_feed_events(site_id,created_at DESC,id);
CREATE TABLE IF NOT EXISTS notification_feed_reads (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 notification_id text NOT NULL, read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,notification_id)
);
CREATE OR REPLACE FUNCTION capture_notification_feed_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_site uuid; target_id text; heading text; description text; destination_path text;
BEGIN
 IF TG_TABLE_NAME='contracts' THEN
  IF TG_OP='UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
  target_site:=NEW.site_id;
  target_id:='contract:'||NEW.id::text||':'||gen_random_uuid()::text;
  heading:=CASE WHEN TG_OP='INSERT' THEN 'สร้างสัญญาแล้ว' ELSE 'ปรับปรุงสัญญาแล้ว' END;
  description:='เวอร์ชัน '||NEW.version::text;
  destination_path:='/records/contracts/'||NEW.id::text;
 ELSIF TG_TABLE_NAME='documents' THEN
  IF NEW.document_type NOT IN ('invoice','receipt') OR NEW.status NOT IN ('issued','finalized') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('issued','finalized') THEN RETURN NEW; END IF;
  target_site:=NEW.site_id; target_id:='document:'||NEW.id::text;
  heading:=CASE WHEN NEW.document_type='invoice' THEN 'ออกใบแจ้งหนี้แล้ว' ELSE 'ออกใบเสร็จแล้ว' END;
  description:=coalesce(NEW.document_number,'');
  destination_path:='/records/'||CASE WHEN NEW.document_type='invoice' THEN 'documents' ELSE 'receipts' END||'/'||NEW.id::text;
 ELSIF TG_TABLE_NAME='payments' THEN
  IF NEW.verified_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at THEN RETURN NEW; END IF;
  SELECT site_id INTO target_site FROM billing_cycles WHERE id=NEW.billing_cycle_id;
  target_id:='payment:'||NEW.id::text||':'||gen_random_uuid()::text;
  heading:='ตรวจสอบการชำระเงินแล้ว'; description:=NEW.status;
  destination_path:='/records/billing/'||NEW.billing_cycle_id::text;
 END IF;
 INSERT INTO notification_feed_events(id,site_id,title,detail,destination)
 VALUES(target_id,target_site,heading,description,destination_path) ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contracts_notification_feed ON contracts;
CREATE TRIGGER contracts_notification_feed AFTER INSERT OR UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION capture_notification_feed_event();
DROP TRIGGER IF EXISTS documents_notification_feed ON documents;
CREATE TRIGGER documents_notification_feed AFTER INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION capture_notification_feed_event();
DROP TRIGGER IF EXISTS payments_notification_feed ON payments;
CREATE TRIGGER payments_notification_feed AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION capture_notification_feed_event();
-- Historical verified payments retain their exact persisted verification time.
INSERT INTO notification_feed_events(id,site_id,title,detail,destination,created_at)
SELECT 'payment:'||p.id::text||':initial',b.site_id,'ตรวจสอบการชำระเงินแล้ว',p.status,
 '/records/billing/'||b.id::text,p.verified_at
FROM payments p JOIN billing_cycles b ON b.id=p.billing_cycle_id WHERE p.verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM notification_feed_events e WHERE starts_with(e.id,'payment:'||p.id::text||':')) ON CONFLICT DO NOTHING;
