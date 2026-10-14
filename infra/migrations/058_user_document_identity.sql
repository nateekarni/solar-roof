-- This feature migration is not yet released. Do not merge existing duplicate
-- identities: their permission presets may differ and require human review.
CREATE FUNCTION employee_position_name_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT lower(normalize(btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), NFC))
$$;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM employee_positions GROUP BY employee_position_name_key(name) HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate normalized position names; review existing presets before applying document identity';
 END IF;
END $$;

CREATE UNIQUE INDEX employee_positions_name_key_unique ON employee_positions(employee_position_name_key(name));

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
