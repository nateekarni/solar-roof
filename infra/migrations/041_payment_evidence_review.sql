-- Customer declarations are historical evidence, not staff verified facts.
ALTER TABLE payments ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN paid_at DROP NOT NULL;
ALTER TABLE payments ADD COLUMN declared_amount numeric(24,8);
ALTER TABLE payments ADD COLUMN declared_transfer_at timestamptz;
ALTER TABLE payments ADD COLUMN verified_amount numeric(24,8);
ALTER TABLE payments ADD COLUMN verified_transfer_at timestamptz;
ALTER TABLE payments ADD COLUMN transfer_reference text;
UPDATE payments SET declared_amount=amount,declared_transfer_at=paid_at;
UPDATE payments SET verified_amount=amount,verified_transfer_at=paid_at WHERE status='paid';
UPDATE payments SET amount=NULL,paid_at=NULL WHERE status<>'paid';
ALTER TABLE payments ADD CONSTRAINT payments_reviewed_money CHECK (verified_amount IS NULL OR verified_amount>0);
CREATE UNIQUE INDEX payments_approved_reference ON payments(transfer_reference) WHERE status='paid' AND transfer_reference IS NOT NULL;

-- Decision notices are durable pending mail, never an implied successful send.
CREATE TABLE payment_decision_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES payments(id),
 user_id uuid NOT NULL REFERENCES users(id),
 notification_id uuid NOT NULL REFERENCES notification_deliveries(id),
 site_id uuid NOT NULL REFERENCES sites(id),
 recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(payment_id,user_id)
);
CREATE FUNCTION queue_payment_rejection_notice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_site uuid; recipient_user record; notice_id uuid;
BEGIN
 IF NEW.status<>'rejected' OR NEW.verified_at IS NULL OR (TG_OP='UPDATE' AND OLD.status='rejected') THEN RETURN NEW; END IF;
 SELECT site_id INTO target_site FROM billing_cycles WHERE id=NEW.billing_cycle_id;
 UPDATE notification_feed_events SET detail='ปฏิเสธหลักฐาน / Evidence rejected: '||coalesce(NEW.rejection_reason,'')
 WHERE starts_with(id,'payment:'||NEW.id::text||':');
 FOR recipient_user IN
  SELECT DISTINCT u.id,u.email FROM users u
  JOIN site_account_assignments a ON a.user_id=u.id AND a.site_id=target_site AND a.revoked_at IS NULL
  JOIN sites s ON s.id=a.site_id JOIN customers c ON c.id=s.customer_id
  WHERE u.role='customer_user' AND u.status='active' AND c.status='active'
   AND u.customer_id=s.customer_id AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email
 LOOP
  notice_id:=gen_random_uuid();
  INSERT INTO notification_deliveries(id,user_id,title,channel,recipient,status,dedupe_key)
  VALUES(notice_id,recipient_user.id,'หลักฐานถูกปฏิเสธ / Evidence rejected','email',recipient_user.email,'queued','payment-rejected:'||NEW.id::text||':'||recipient_user.id::text)
  ON CONFLICT(dedupe_key) DO NOTHING;
  IF FOUND THEN
   INSERT INTO payment_decision_outbox(payment_id,user_id,notification_id,site_id,recipient,subject,body)
   VALUES(NEW.id,recipient_user.id,notice_id,target_site,recipient_user.email,'หลักฐานถูกปฏิเสธ / Evidence rejected',coalesce(NEW.rejection_reason,'')||E'\nกรุณาส่งหลักฐานใหม่ / Please resubmit evidence.');
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
-- Trigger names execute alphabetically: feed capture precedes the notice enrichment.
CREATE TRIGGER payments_rejection_notice AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION queue_payment_rejection_notice();
