-- Immutable internal decoder provenance for each applied public config revision.
-- The public MQTT config intentionally carries no database profile revision IDs.
CREATE TABLE IF NOT EXISTS gateway_configuration_device_bindings (
  gateway_id uuid NOT NULL,
  config_version integer NOT NULL CHECK (config_version > 0),
  external_device_id text NOT NULL CHECK (length(btrim(external_device_id)) > 0),
  device_id uuid NOT NULL REFERENCES devices(id),
  profile_revision_id uuid NOT NULL REFERENCES payload_profile_revisions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway_id, config_version, external_device_id),
  UNIQUE (gateway_id, config_version, device_id),
  FOREIGN KEY (gateway_id, config_version)
    REFERENCES gateway_configuration_revisions(gateway_id, version)
);
CREATE INDEX IF NOT EXISTS gateway_configuration_device_bindings_profile_idx
  ON gateway_configuration_device_bindings(profile_revision_id);

-- Rotation fails closed until EMQX confirms the old session is gone.
ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS mqtt_access_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS control_managed_at timestamptz;

-- Older immutable snapshots sometimes carried the exact internal revision.
-- Preserve only a single explicit UUID which still belongs to that exact
-- gateway/device; malformed or ambiguous snapshots remain intentionally unbound.
WITH explicit_legacy AS (
  SELECT r.gateway_id,r.version,entry.device->>'deviceId' AS external_device_id,
    min(entry.device->>'profileRevisionId') AS profile_revision_id
  FROM gateway_configuration_revisions r
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.config->'devices','[]'::jsonb)) entry(device)
  WHERE entry.device->>'enabled'='true'
    AND entry.device->>'profileRevisionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  GROUP BY r.gateway_id,r.version,entry.device->>'deviceId'
  HAVING count(*)=1 AND min(entry.device->>'profileRevisionId')=max(entry.device->>'profileRevisionId')
)
INSERT INTO gateway_configuration_device_bindings(gateway_id,config_version,external_device_id,device_id,profile_revision_id)
SELECT legacy.gateway_id,legacy.version,legacy.external_device_id,d.id,p.id
FROM explicit_legacy legacy
JOIN devices d ON d.gateway_id=legacy.gateway_id AND d.external_device_id=legacy.external_device_id
JOIN payload_profile_revisions p ON p.id=legacy.profile_revision_id::uuid
  AND (p.owner_device_id IS NULL OR p.owner_device_id=d.id)
ON CONFLICT (gateway_id,config_version,external_device_id) DO NOTHING;
-- Existing strict revisions were already approved through this control plane.
-- A legacy snapshot with profileRevisionId stays unmanaged for compatibility.
UPDATE gateways g SET control_managed_at=managed.first_managed_at
FROM (
  SELECT gateway_id,min(desired_at) AS first_managed_at
  FROM gateway_configuration_revisions r
  WHERE config->>'messageType'='config'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(r.config->'devices','[]'::jsonb)) entry(device)
      WHERE entry.device ? 'profileRevisionId'
    )
  GROUP BY gateway_id
) managed
WHERE g.id=managed.gateway_id AND g.control_managed_at IS NULL;

-- Repair applied strict rows only when the current immutable profile is an
-- exact decoder match for the public snapshot. Same sender profile identity
-- alone is insufficient because semantic mappings can change locally.
INSERT INTO gateway_configuration_device_bindings(gateway_id,config_version,external_device_id,device_id,profile_revision_id)
SELECT r.gateway_id,r.version,configured.device->>'deviceId',d.id,p.id
FROM gateways g
JOIN gateway_configuration_revisions r ON r.gateway_id=g.id AND r.version=g.applied_config_version
CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.config->'devices','[]'::jsonb)) configured(device)
JOIN devices d ON d.gateway_id=r.gateway_id AND d.external_device_id=configured.device->>'deviceId'
JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id
  AND (p.owner_device_id IS NULL OR p.owner_device_id=d.id)
WHERE g.control_managed_at IS NOT NULL AND g.applied_config_version>0
  AND configured.device->>'enabled'='true' AND NOT (configured.device ? 'profileRevisionId')
  AND (SELECT count(*) FROM jsonb_array_elements(coalesce(r.config->'devices','[]'::jsonb)) sibling(device)
    WHERE sibling.device->>'enabled'='true'
      AND sibling.device->>'deviceId'=configured.device->>'deviceId')=1
  AND d.status<>'disabled'
  AND coalesce(p.config#>>'{sourceProfile,id}',p.config->>'id')=configured.device->>'profileId'
  AND coalesce(p.config#>>'{sourceProfile,version}',p.config->>'version')=configured.device->>'profileVersion'
  AND p.config->>'deviceType'=configured.device->>'deviceType'
  AND jsonb_array_length(coalesce(p.config->'pollGroups','[]'::jsonb))=(
    SELECT count(DISTINCT profile_group.name)
    FROM jsonb_array_elements_text(coalesce(p.config->'pollGroups','[]'::jsonb)) profile_group(name))
  AND jsonb_array_length(coalesce(configured.device->'pollGroups','[]'::jsonb))=(
    SELECT count(DISTINCT configured_group.name)
    FROM jsonb_array_elements_text(coalesce(configured.device->'pollGroups','[]'::jsonb)) configured_group(name))
  AND ARRAY(SELECT profile_group.name
    FROM jsonb_array_elements_text(coalesce(p.config->'pollGroups','[]'::jsonb)) profile_group(name)
    ORDER BY profile_group.name)=ARRAY(SELECT configured_group.name
    FROM jsonb_array_elements_text(coalesce(configured.device->'pollGroups','[]'::jsonb)) configured_group(name)
    ORDER BY configured_group.name)
  AND jsonb_array_length(coalesce(p.config->'fields','[]'::jsonb))=jsonb_array_length(coalesce(configured.device->'mappings','[]'::jsonb))
  AND (SELECT count(*) FROM register_mapping_versions rm
    WHERE rm.device_id=d.id AND rm.effective_to IS NULL)=jsonb_array_length(coalesce(configured.device->'mappings','[]'::jsonb))
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(configured.device->'mappings','[]'::jsonb)) cm(mapping)
    WHERE (SELECT count(*) FROM jsonb_array_elements(coalesce(p.config->'fields','[]'::jsonb)) pf(field)
      WHERE pf.field->>'tag'=cm.mapping->>'tag'
        AND coalesce(pf.field->>'sourceTag',pf.field->>'tag')=coalesce(cm.mapping->>'sourceTag',cm.mapping->>'tag')
        AND pf.field->>'pollGroup'=cm.mapping->>'pollGroup'
        AND pf.field->>'sourceUnit'=cm.mapping->>'sourceUnit'
        AND pf.field->>'targetUnit'=cm.mapping->>'targetUnit'
        AND pf.field->>'conversion'=cm.mapping->>'conversion'
        AND coalesce(pf.field->>'role','none')=coalesce(cm.mapping->>'role','none')
        AND coalesce(pf.field->>'required','false')=coalesce(cm.mapping->>'required','false')
    )<>1 OR (SELECT count(*) FROM register_mapping_versions rm
      WHERE rm.device_id=d.id AND rm.effective_to IS NULL
        AND rm.semantic_field=cm.mapping->>'tag'
        AND rm.register_address=cm.mapping->>'registerAddress'
        AND to_jsonb(rm.register_count)=cm.mapping->'registerCount'
        AND rm.data_type=cm.mapping->>'dataType'
        AND rm.byte_order=cm.mapping->>'byteOrder'
        AND rm.word_order=cm.mapping->>'wordOrder'
        AND to_jsonb(rm.scale)=cm.mapping->'scale'
        AND rm.unit=cm.mapping->>'sourceUnit'
        AND rm.quality_rule->>'pollGroup'=cm.mapping->>'pollGroup'
        AND coalesce(rm.quality_rule->'offset','0'::jsonb)=coalesce(cm.mapping->'offset','0'::jsonb)
        AND rm.signed=((cm.mapping->>'dataType') IN ('int16','int32'))
    )<>1
  )
ON CONFLICT (gateway_id,config_version,external_device_id) DO NOTHING;

