-- Permit a concrete device subscription while keeping the registered site/gateway scope.
ALTER TABLE gateways DROP CONSTRAINT gateways_topic_matches_name;
ALTER TABLE gateways ADD CONSTRAINT gateways_topic_matches_name CHECK (
 name !~ '[/+#]' AND lower(name) NOT IN ('response','config','ack') AND (
 endpoint IN ('energy/'||name||'/#','/'||name||'/#') OR
 (external_gateway_id IS NOT NULL AND endpoint ~ '^solar/v1/sites/[A-Za-z0-9_-]{1,128}/gateways/[A-Za-z0-9_-]{1,128}/devices/(\+|[A-Za-z0-9_-]{1,128})/telemetry$')
 ));
CREATE OR REPLACE FUNCTION validate_payload_gateway_topic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefix text;
BEGIN
 IF NEW.endpoint LIKE 'solar/v1/%' THEN
  prefix := 'solar/v1/sites/'||(SELECT external_site_id FROM sites WHERE id=NEW.site_id)||'/gateways/'||NEW.external_gateway_id||'/devices/';
  IF prefix IS NULL OR left(NEW.endpoint,length(prefix)) <> prefix OR substring(NEW.endpoint from length(prefix)+1) !~ '^(\+|[A-Za-z0-9_-]{1,128})/telemetry$' THEN
   RAISE EXCEPTION 'Payload topic does not match registered site/gateway';
  END IF;
 END IF;
 RETURN NEW;
END $$;
