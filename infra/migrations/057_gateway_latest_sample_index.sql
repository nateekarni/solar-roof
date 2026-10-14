CREATE INDEX IF NOT EXISTS payload_samples_device_last_seen
ON payload_samples(device_id, (coalesce(measured_at,polled_at)) DESC, received_at DESC, id DESC);
