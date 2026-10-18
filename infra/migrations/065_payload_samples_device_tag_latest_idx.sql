CREATE INDEX IF NOT EXISTS idx_payload_samples_device_tag_latest
ON payload_samples(device_id, tag, (coalesce(measured_at,polled_at)) DESC, received_at DESC, id DESC);
