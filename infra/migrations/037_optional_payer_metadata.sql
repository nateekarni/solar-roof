-- Optional descriptive metadata for the existing transfer evidence workflow.
-- No backfill or method inference for historical payments.
ALTER TABLE payments
 ADD COLUMN payer_name text CHECK (payer_name IS NULL OR (char_length(payer_name) BETWEEN 1 AND 200 AND payer_name=btrim(payer_name))),
 ADD COLUMN payment_method text CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer','promptpay')),
 ADD COLUMN origin_bank text CHECK (origin_bank IS NULL OR (char_length(origin_bank) BETWEEN 1 AND 120 AND origin_bank=btrim(origin_bank))),
 ADD COLUMN origin_account text CHECK (origin_account IS NULL OR (char_length(origin_account) BETWEEN 1 AND 80 AND origin_account=btrim(origin_account)));
