-- Migration 062: Retire contract notifications trigger and purge legacy contract feed events
DROP TRIGGER IF EXISTS contracts_notification_feed ON contracts;

DELETE FROM notification_feed_events
WHERE starts_with(id, 'contract:')
   OR destination LIKE '/records/contracts/%'
   OR title IN ('สร้างสัญญาแล้ว', 'ปรับปรุงสัญญาแล้ว');

CREATE OR REPLACE FUNCTION capture_notification_feed_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_site uuid; target_id text; heading text; description text; destination_path text;
BEGIN
 IF TG_TABLE_NAME='documents' THEN
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
