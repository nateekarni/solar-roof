-- Optimization for generation-energy and 30-day dashboard queries over large sample volumes.
-- Provides a leading index covering site, device, revision, tag, and polled_at range scan.
CREATE INDEX IF NOT EXISTS idx_payload_samples_generation_energy
ON payload_samples(site_id, device_id, profile_revision_id, tag, polled_at, received_at, id);
