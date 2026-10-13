-- Data URI attachments exceed PostgreSQL's B-tree tuple size. Compare fixed-size
-- SHA-256 digests while retaining the original evidence unchanged in payments.
-- convert_to is catalogued STABLE because its encoding argument is variable;
-- this wrapper fixes UTF8 and pg_catalog, making its result deterministic.
CREATE FUNCTION payment_evidence_sha256(value text) RETURNS text
 LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
 SET search_path=pg_catalog
 AS $$ SELECT encode(sha256(convert_to(value,'UTF8')),'hex') $$;
DROP INDEX payments_new_active_evidence;
DROP INDEX payments_new_active_slip;
CREATE UNIQUE INDEX payments_new_active_evidence ON payments
 (payment_evidence_sha256(evidence_key))
 WHERE submitted_by IS NOT NULL AND evidence_key IS NOT NULL AND status IN('pending_verification','paid');
CREATE UNIQUE INDEX payments_new_active_slip ON payments
 (payment_evidence_sha256(slip_url))
 WHERE submitted_by IS NOT NULL AND slip_url IS NOT NULL AND status IN('pending_verification','paid');
