ALTER TABLE payments
 DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE payments
 ADD COLUMN transfer_channel text,
 ADD COLUMN idempotency_key text,
 ADD COLUMN received_at date;

UPDATE payments
SET transfer_channel=CASE payment_method
 WHEN 'promptpay' THEN 'promptpay'
 WHEN 'bank_transfer' THEN 'bank_account'
 ELSE NULL
END
WHERE payment_method IN ('promptpay','bank_transfer');

UPDATE payments
SET payment_method='bank_transfer'
WHERE payment_method='promptpay';

ALTER TABLE payments
 ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer','cash')),
 ADD CONSTRAINT payments_transfer_channel_check
  CHECK (transfer_channel IS NULL OR transfer_channel IN ('bank_account','promptpay')),
 ADD CONSTRAINT payments_method_channel_check
  CHECK (
   (payment_method='bank_transfer' AND transfer_channel IN ('bank_account','promptpay')) OR
   (payment_method='cash' AND transfer_channel IS NULL) OR
   (payment_method IS NULL AND transfer_channel IS NULL)
  ),
 ADD CONSTRAINT payments_cash_fields_check
  CHECK (
   (payment_method='cash' AND idempotency_key IS NOT NULL AND received_at IS NOT NULL) OR
   (payment_method IS DISTINCT FROM 'cash' AND idempotency_key IS NULL AND received_at IS NULL)
  ),
 ADD CONSTRAINT payments_idempotency_key_check
  CHECK (idempotency_key IS NULL OR (char_length(idempotency_key) BETWEEN 1 AND 160 AND idempotency_key=btrim(idempotency_key)));

CREATE UNIQUE INDEX payments_cash_idempotency
 ON payments(submitted_by,idempotency_key)
 WHERE payment_method='cash';

UPDATE employee_domain_grants
SET overrides=jsonb_set(overrides,'{business.billing.record_cash_payment}','true'::jsonb,true),
    updated_at=now()
WHERE domain='business'
  AND coalesce(overrides->'business.billing.approve','false'::jsonb)='true'::jsonb;
