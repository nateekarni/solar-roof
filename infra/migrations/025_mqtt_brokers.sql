CREATE TABLE mqtt_brokers (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 url text NOT NULL,
 username text NOT NULL DEFAULT '',
 password_cipher text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gateways ADD COLUMN mqtt_broker_id uuid REFERENCES mqtt_brokers(id);
CREATE INDEX gateways_mqtt_broker_idx ON gateways(mqtt_broker_id);
