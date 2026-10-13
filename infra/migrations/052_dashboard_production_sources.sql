CREATE TABLE gateway_dashboard_sources (
 gateway_id uuid NOT NULL REFERENCES gateways(id),
 metric text NOT NULL CHECK(metric IN ('energy','power')),
 device_id uuid NOT NULL REFERENCES devices(id),tag text NOT NULL,
 updated_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(gateway_id,metric)
);
