-- Migration 004: System Settings and Meter Presets
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meter_presets (
  id uuid PRIMARY KEY,
  brand text NOT NULL,
  model text NOT NULL,
  device_type text NOT NULL DEFAULT 'meter',
  registers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand, model)
);

INSERT INTO system_settings (key, value) VALUES
  ('invoicePrefix', 'INV-{year}-'),
  ('receiptPrefix', 'RCT-{year}-'),
  ('rawTelemetryRetentionYears', '2'),
  ('aggregateRetentionYears', '7'),
  ('language', 'th'),
  ('criticalEmailAlert', 'true'),
  ('inAppNotification', 'true'),
  ('defaultUnitPriceThb', '4.25'),
  ('defaultFetchFrequencySec', '60')
ON CONFLICT (key) DO NOTHING;
