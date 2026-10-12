-- Rename the existing customer identity in place; UUIDs and FK relationships stay intact.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE user_invitations DROP CONSTRAINT user_invitations_role_check;
UPDATE users SET role='customer_user' WHERE role='school_user';
UPDATE user_invitations SET role='customer_user' WHERE role='school_user';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('owner','admin','operator','accountant','customer_user'));
ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_role_check CHECK(role IN ('owner','admin','operator','accountant','customer_user'));
ALTER TABLE schools RENAME TO customers;
ALTER TABLE users RENAME COLUMN school_id TO customer_id;
ALTER TABLE sites RENAME COLUMN school_id TO customer_id;
ALTER TABLE user_invitations RENAME COLUMN school_id TO customer_id;

-- Keep catalog names aligned, including constraint-owned indexes.
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT c.conname, t.relname FROM pg_constraint c
 JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname=current_schema() AND t.relname IN ('customers','users','sites','user_invitations') AND c.conname LIKE '%school%'
 LOOP EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I',item.relname,item.conname,replace(item.conname,'school','customer')); END LOOP;
 FOR item IN SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname LIKE '%school%'
 LOOP EXECUTE format('ALTER INDEX %I RENAME TO %I',item.indexname,replace(item.indexname,'school','customer')); END LOOP;
END $$;
