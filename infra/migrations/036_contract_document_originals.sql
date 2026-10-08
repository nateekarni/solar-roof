-- Contract originals use the existing immutable document/artifact storage.
ALTER TABLE company_profile ADD COLUMN signatory_name text NOT NULL DEFAULT '', ADD COLUMN signatory_title text NOT NULL DEFAULT '';
ALTER TABLE contracts ADD COLUMN signer_title text NOT NULL DEFAULT '', ADD COLUMN customer_signer_name text NOT NULL DEFAULT '', ADD COLUMN customer_signer_title text NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN contract_id uuid REFERENCES contracts(id), ADD COLUMN template_version text;
ALTER TABLE documents DROP CONSTRAINT documents_document_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_document_type_check CHECK(document_type IN ('invoice','receipt','billing_statement','contract'));
ALTER TABLE documents ADD CONSTRAINT contract_original_complete CHECK(document_type <> 'contract' OR (contract_id IS NOT NULL AND template_version IS NOT NULL AND snapshot IS NOT NULL AND content_hash IS NOT NULL AND billing_cycle_id IS NULL));
-- One original survives template upgrades; the issuance key is also explicit.
CREATE UNIQUE INDEX documents_contract_original ON documents(contract_id) WHERE document_type='contract';
CREATE UNIQUE INDEX documents_contract_template ON documents(contract_id,template_version) WHERE document_type='contract';
