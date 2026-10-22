-- Backfill applied control-plane bindings for telemetry-only devices whose
-- logical mappings intentionally omit physical register decoder metadata.
-- Migration 068 remains immutable because it may already be recorded in
-- production schema_migrations.
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
    WHERE rm.device_id=d.id AND rm.effective_to IS NULL)=(
      SELECT count(*) FROM jsonb_array_elements(coalesce(configured.device->'mappings','[]'::jsonb)) physical(mapping)
      WHERE physical.mapping ? 'registerAddress')
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
    )<>1 OR (cm.mapping ? 'registerAddress' AND (SELECT count(*) FROM register_mapping_versions rm
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
    )<>1)
  )
ON CONFLICT (gateway_id,config_version,external_device_id) DO NOTHING;
