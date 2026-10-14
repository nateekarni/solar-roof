ALTER TABLE users
  ADD COLUMN company_position_id uuid REFERENCES employee_positions(id),
  ADD COLUMN signature_data text;

ALTER TABLE users ADD CONSTRAINT users_signature_data_bounded CHECK (
  signature_data IS NULL OR (
    length(signature_data) <= 350000
    AND signature_data ~ '^data:image/(png|jpeg);base64,'
  )
);

WITH single_position AS (
  SELECT user_id, min(position_id::text)::uuid AS position_id
  FROM employee_domain_grants
  WHERE position_id IS NOT NULL
  GROUP BY user_id
  HAVING count(DISTINCT position_id) = 1
)
UPDATE users u SET company_position_id = p.position_id
FROM single_position p WHERE p.user_id = u.id;

CREATE INDEX users_company_position_idx ON users(company_position_id);
