import {z} from 'zod';

const schema=z.object({
 DATABASE_URL:z.string().url().refine(value=>['postgres:','postgresql:'].includes(new URL(value).protocol)),
 DEMO_MAINTENANCE_ENABLED:z.literal('true'),
 DEMO_ACTION:z.enum(['reset-billing','delete-gateway','delete-site']),
 DEMO_TARGET:z.string().trim().min(1).max(160),DEMO_CONFIRM:z.string(),
}).superRefine((value,ctx)=>{
 const expected=`${value.DEMO_ACTION.toUpperCase()}:${value.DEMO_TARGET}`;
 if(value.DEMO_CONFIRM!==expected)ctx.addIssue({code:'custom',path:['DEMO_CONFIRM'],message:'Confirmation mismatch'});
});

export function parseDemoMaintenance(input:Record<string,string|undefined>){
 const result=schema.safeParse(input);if(!result.success)throw Error(`Invalid demo maintenance fields: ${[...new Set(result.error.issues.map(issue=>issue.path.join('.')))].join(', ')}`);
 return {databaseUrl:result.data.DATABASE_URL,action:result.data.DEMO_ACTION,target:result.data.DEMO_TARGET};
}

type Client={query(sql:string,values?:unknown[]):Promise<{rows:any[]}>};

export async function resetBilling(client:Client,target:string){
 const sites=(await client.query(`SELECT id,external_site_id,name FROM sites WHERE id::text=$1 OR external_site_id=$1 FOR UPDATE`,[target])).rows;
 if(sites.length!==1)throw Error(`Expected exactly one site matching ${target}`);const site=sites[0];
 await client.query(`CREATE TEMP TABLE demo_billing_site ON COMMIT DROP AS SELECT id FROM sites WHERE id=$1`,[site.id]);
 await client.query(`CREATE TEMP TABLE demo_cycles ON COMMIT DROP AS SELECT id FROM billing_cycles WHERE site_id IN (SELECT id FROM demo_billing_site);
 CREATE TEMP TABLE demo_docs ON COMMIT DROP AS SELECT id FROM documents WHERE site_id IN (SELECT id FROM demo_billing_site) AND document_type IN ('invoice','receipt','billing_statement');
 CREATE TEMP TABLE demo_payments ON COMMIT DROP AS SELECT id FROM payments WHERE billing_cycle_id IN (SELECT id FROM demo_cycles);
 CREATE TEMP TABLE demo_financial_outbox ON COMMIT DROP AS SELECT id FROM financial_delivery_outbox WHERE document_id IN (SELECT id FROM demo_docs);
 CREATE TEMP TABLE demo_operational_outbox ON COMMIT DROP AS SELECT id FROM operational_delivery_outbox WHERE billing_cycle_id IN (SELECT id FROM demo_cycles);
 CREATE TEMP TABLE demo_payment_outbox ON COMMIT DROP AS SELECT id,notification_id FROM payment_decision_outbox WHERE payment_id IN (SELECT id FROM demo_payments);
 CREATE TEMP TABLE demo_feed ON COMMIT DROP AS SELECT id FROM notification_feed_events WHERE site_id IN (SELECT id FROM demo_billing_site) AND (id LIKE 'document:%' OR id LIKE 'payment:%');
 ALTER TABLE documents DISABLE TRIGGER documents_immutable;
 ALTER TABLE document_artifacts DISABLE TRIGGER document_artifact_immutable;
 DELETE FROM operational_delivery_attempts WHERE (source='operational_delivery_outbox' AND outbox_id IN (SELECT id FROM demo_operational_outbox)) OR (source='payment_decision_outbox' AND outbox_id IN (SELECT id FROM demo_payment_outbox));
 DELETE FROM payment_decision_outbox WHERE id IN (SELECT id FROM demo_payment_outbox);
 DELETE FROM notification_deliveries WHERE id IN (SELECT notification_id FROM demo_payment_outbox);
 DELETE FROM operational_delivery_outbox WHERE id IN (SELECT id FROM demo_operational_outbox);
 DELETE FROM billing_replacement_drafts WHERE billing_cycle_id IN (SELECT id FROM demo_cycles) OR supersedes_document_id IN (SELECT id FROM demo_docs);
 DELETE FROM financial_delivery_outbox WHERE id IN (SELECT id FROM demo_financial_outbox);
 UPDATE payments SET receipt_document_id=NULL WHERE id IN (SELECT id FROM demo_payments);
 DELETE FROM payments WHERE id IN (SELECT id FROM demo_payments);
 DELETE FROM document_artifacts WHERE document_id IN (SELECT id FROM demo_docs);
 DELETE FROM documents WHERE id IN (SELECT id FROM demo_docs);
 ALTER TABLE document_artifacts ENABLE TRIGGER document_artifact_immutable;
 ALTER TABLE documents ENABLE TRIGGER documents_immutable;
 DELETE FROM notification_feed_reads WHERE notification_id IN (SELECT id FROM demo_feed);
 DELETE FROM operational_event_recipients WHERE notification_id IN (SELECT id FROM demo_feed);
 DELETE FROM notification_feed_events WHERE id IN (SELECT id FROM demo_feed);
 DELETE FROM financial_staff_notices WHERE site_id IN (SELECT id FROM demo_billing_site);
 DELETE FROM financial_month_jobs WHERE site_id IN (SELECT id FROM demo_billing_site);
 DELETE FROM billing_cycles WHERE id IN (SELECT id FROM demo_cycles);`);
 const result=(await client.query(`SELECT (SELECT count(*)::int FROM documents WHERE site_id=$1 AND document_type IN ('invoice','receipt','billing_statement')) AS "billingDocuments",(SELECT count(*)::int FROM billing_cycles WHERE site_id=$1) AS "billingCycles",(SELECT count(*)::int FROM payments p JOIN billing_cycles b ON b.id=p.billing_cycle_id WHERE b.site_id=$1) AS payments,(SELECT count(*)::int FROM documents WHERE site_id=$1 AND document_type='contract') AS "retainedContractDocuments"`,[site.id])).rows[0];
 return {siteId:site.id,externalSiteId:site.external_site_id,...result};
}

export async function deleteGateway(client:Client,target:string){
 const gateways=(await client.query(`SELECT id,external_gateway_id,name FROM gateways WHERE id::text=$1 OR external_gateway_id=$1 FOR UPDATE`,[target])).rows;
 if(gateways.length!==1)throw Error(`Expected exactly one gateway matching ${target}`);const gateway=gateways[0];
 await client.query(`CREATE TEMP TABLE demo_gateway ON COMMIT DROP AS SELECT * FROM gateways WHERE id=$1`,[gateway.id]);
 await client.query(`CREATE TEMP TABLE demo_preset_counts ON COMMIT DROP AS SELECT (SELECT count(*) FROM meter_presets) AS meter_presets,(SELECT count(*) FROM payload_profile_revisions WHERE owner_device_id IS NULL) AS shared_profiles,(SELECT count(*) FROM payload_preset_archives) AS preset_archives`);
 await client.query(`CREATE TEMP TABLE demo_devices ON COMMIT DROP AS SELECT id FROM devices WHERE gateway_id=$1`,[gateway.id]);
 await client.query(`CREATE TEMP TABLE demo_local_profiles ON COMMIT DROP AS SELECT id FROM payload_profile_revisions WHERE owner_device_id IN (SELECT id FROM demo_devices)`);
 await client.query(`CREATE TEMP TABLE demo_bindings ON COMMIT DROP AS SELECT id FROM billing_source_bindings WHERE device_id IN (SELECT id FROM demo_devices)`);
 await client.query(`CREATE TEMP TABLE demo_pairs ON COMMIT DROP AS SELECT id FROM measurement_comparison_pairs WHERE gateway_id=$1 OR left_device_id IN (SELECT id FROM demo_devices) OR right_device_id IN (SELECT id FROM demo_devices)`,[gateway.id]);
 await client.query(`CREATE TEMP TABLE demo_alerts ON COMMIT DROP AS SELECT id FROM alerts WHERE gateway_id=$1 OR comparison_pair_id IN (SELECT id FROM demo_pairs)`,[gateway.id]);
 await client.query(`CREATE TEMP TABLE demo_operational_outbox ON COMMIT DROP AS SELECT id FROM operational_delivery_outbox WHERE alert_id IN (SELECT id FROM demo_alerts)`);
 await client.query(`CREATE TEMP TABLE demo_discovered ON COMMIT DROP AS SELECT id FROM discovered_gateways WHERE assigned_gateway_id=$1`,[gateway.id]);
 const cross=(await client.query(`SELECT EXISTS(SELECT 1 FROM devices WHERE gateway_id<>$1 AND payload_profile_revision_id IN (SELECT id FROM demo_local_profiles)) AS referenced`,[gateway.id])).rows[0]?.referenced;
 if(cross)throw Error('Gateway local profile is referenced by another gateway');
 await client.query(`DELETE FROM operational_delivery_attempts WHERE source='operational_delivery_outbox' AND outbox_id IN (SELECT id FROM demo_operational_outbox);
 DELETE FROM notification_feed_reads WHERE notification_id IN (SELECT 'alert:'||id::text FROM demo_alerts UNION ALL SELECT 'workflow:'||id::text FROM demo_operational_outbox);
 DELETE FROM operational_event_recipients WHERE notification_id IN (SELECT 'alert:'||id::text FROM demo_alerts UNION ALL SELECT 'workflow:'||id::text FROM demo_operational_outbox);
 DELETE FROM notification_feed_events WHERE id IN (SELECT 'alert:'||id::text FROM demo_alerts UNION ALL SELECT 'workflow:'||id::text FROM demo_operational_outbox);
 DELETE FROM operational_delivery_outbox WHERE id IN (SELECT id FROM demo_operational_outbox);
 DELETE FROM gateway_discovery_snapshots WHERE discovered_gateway_id IN (SELECT id FROM demo_discovered);
 UPDATE discovered_gateways SET assigned_site_id=NULL,assigned_gateway_id=NULL,status='unassigned',assigned_at=NULL WHERE id IN (SELECT id FROM demo_discovered);
 DELETE FROM alerts WHERE id IN (SELECT id FROM demo_alerts);
 DELETE FROM measurement_comparison_dirty WHERE pair_id IN (SELECT id FROM demo_pairs);
 DELETE FROM measurement_comparison_windows WHERE pair_id IN (SELECT id FROM demo_pairs);
 DELETE FROM measurement_comparison_pairs WHERE id IN (SELECT id FROM demo_pairs);
 DELETE FROM gateway_dashboard_sources WHERE gateway_id IN (SELECT id FROM demo_gateway) OR device_id IN (SELECT id FROM demo_devices);
 DELETE FROM gateway_config_proposals WHERE gateway_id IN (SELECT id FROM demo_gateway);
 DELETE FROM gateway_config_status_events WHERE gateway_id IN (SELECT id FROM demo_gateway);
 DELETE FROM gateway_connection_events WHERE gateway_id IN (SELECT id FROM demo_gateway);
 DELETE FROM gateway_mqtt_credentials WHERE gateway_id IN (SELECT id FROM demo_gateway);
 DELETE FROM gateway_configuration_publications WHERE gateway_id IN (SELECT id FROM demo_gateway);
 DELETE FROM gateway_configuration_device_bindings WHERE gateway_id IN (SELECT id FROM demo_gateway) OR device_id IN (SELECT id FROM demo_devices);
 DELETE FROM gateway_configuration_revisions WHERE gateway_id IN (SELECT id FROM demo_gateway);
 UPDATE gateway_installation_history SET replaced_by_gateway_id=NULL WHERE replaced_by_gateway_id IN (SELECT id FROM demo_gateway) AND gateway_id NOT IN (SELECT id FROM demo_gateway);
 DELETE FROM gateway_installation_history WHERE gateway_id IN (SELECT id FROM demo_gateway);
 DELETE FROM telemetry_raw WHERE device_id IN (SELECT id FROM demo_devices);
 DELETE FROM telemetry_aggregate WHERE device_id IN (SELECT id FROM demo_devices);
 DELETE FROM payload_rejections WHERE gateway_id IN (SELECT id FROM demo_gateway);
 DELETE FROM payload_messages WHERE gateway_id IN (SELECT id FROM demo_gateway) OR device_id IN (SELECT id FROM demo_devices);
 DELETE FROM gateway_payload_receive_revisions WHERE gateway_id IN (SELECT id FROM demo_gateway);
 UPDATE billing_meters SET billing_source_binding_id=NULL WHERE device_id IN (SELECT id FROM demo_devices);
 DELETE FROM billing_source_bindings WHERE id IN (SELECT id FROM demo_bindings);
 DELETE FROM billing_meters WHERE device_id IN (SELECT id FROM demo_devices);
 DELETE FROM device_profile_assignments WHERE device_id IN (SELECT id FROM demo_devices);
 DELETE FROM register_mapping_versions WHERE device_id IN (SELECT id FROM demo_devices);
 UPDATE devices SET payload_profile_revision_id=NULL WHERE id IN (SELECT id FROM demo_devices);
 ALTER TABLE payload_profile_revisions DISABLE TRIGGER payload_revision_immutable;
 DELETE FROM payload_profile_revisions WHERE id IN (SELECT id FROM demo_local_profiles);
 ALTER TABLE payload_profile_revisions ENABLE TRIGGER payload_revision_immutable;
 DELETE FROM devices WHERE id IN (SELECT id FROM demo_devices);
 DELETE FROM gateways WHERE id IN (SELECT id FROM demo_gateway);`);
 const presets=(await client.query(`SELECT (SELECT count(*) FROM meter_presets)=(SELECT meter_presets FROM demo_preset_counts) AND (SELECT count(*) FROM payload_profile_revisions WHERE owner_device_id IS NULL)=(SELECT shared_profiles FROM demo_preset_counts) AND (SELECT count(*) FROM payload_preset_archives)=(SELECT preset_archives FROM demo_preset_counts) AS preserved`)).rows[0]?.preserved;
 if(!presets)throw Error('Preset preservation guard failed');return {deletedGatewayId:gateway.id,externalGatewayId:gateway.external_gateway_id,presetsPreserved:true};
}

export async function deleteSite(client:Client,target:string){
 const sites=(await client.query(`SELECT id,external_site_id,name FROM sites WHERE id::text=$1 OR external_site_id=$1 FOR UPDATE`,[target])).rows;
 if(sites.length!==1)throw Error(`Expected exactly one site matching ${target}`);const site=sites[0];
 const blockers=(await client.query(`SELECT (SELECT count(*) FROM gateways WHERE site_id=$1) AS gateways,(SELECT count(*) FROM devices WHERE site_id=$1) AS devices,(SELECT count(*) FROM contracts WHERE site_id=$1) AS contracts,(SELECT count(*) FROM billing_cycles WHERE site_id=$1) AS cycles,(SELECT count(*) FROM documents WHERE site_id=$1) AS documents,(SELECT count(*) FROM telemetry_archives WHERE site_id=$1) AS archives,(SELECT count(*) FROM telemetry_retention_holds WHERE site_id=$1) AS retention_holds`,[site.id])).rows[0];
 if(Object.values(blockers).some(value=>Number(value)>0))throw Error(`Site still has dependent records: ${JSON.stringify(blockers)}. Delete its gateway and financial history first; contracts/documents are intentionally protected.`);
 await client.query(`CREATE TEMP TABLE demo_site ON COMMIT DROP AS SELECT id FROM sites WHERE id=$1`,[site.id]);
 await client.query(`CREATE TEMP TABLE demo_global_counts ON COMMIT DROP AS SELECT (SELECT count(*) FROM customers) AS customers,(SELECT count(*) FROM users) AS users,(SELECT count(*) FROM meter_presets) AS meter_presets,(SELECT count(*) FROM payload_profile_revisions WHERE owner_device_id IS NULL) AS shared_profiles`);
 await client.query(`CREATE TEMP TABLE demo_operational_outbox ON COMMIT DROP AS SELECT id FROM operational_delivery_outbox WHERE site_id=$1`,[site.id]);
 await client.query(`CREATE TEMP TABLE demo_payment_outbox ON COMMIT DROP AS SELECT id,notification_id FROM payment_decision_outbox WHERE site_id=$1`,[site.id]);
 await client.query(`CREATE TEMP TABLE demo_feed ON COMMIT DROP AS SELECT id FROM notification_feed_events WHERE site_id=$1`,[site.id]);
 await client.query(`CREATE TEMP TABLE demo_alerts ON COMMIT DROP AS SELECT id FROM alerts WHERE site_id=$1`,[site.id]);
 await client.query(`DELETE FROM operational_delivery_attempts WHERE (source='operational_delivery_outbox' AND outbox_id IN (SELECT id FROM demo_operational_outbox)) OR (source='payment_decision_outbox' AND outbox_id IN (SELECT id FROM demo_payment_outbox));
 DELETE FROM notification_deliveries WHERE id IN (SELECT notification_id FROM demo_payment_outbox);
 DELETE FROM operational_delivery_outbox WHERE id IN (SELECT id FROM demo_operational_outbox);
 DELETE FROM payment_decision_outbox WHERE id IN (SELECT id FROM demo_payment_outbox);
 DELETE FROM notification_feed_reads WHERE notification_id IN (SELECT id FROM demo_feed) OR notification_id IN (SELECT 'alert:'||id::text FROM demo_alerts);
 DELETE FROM operational_event_recipients WHERE notification_id IN (SELECT id FROM demo_feed) OR notification_id IN (SELECT 'alert:'||id::text FROM demo_alerts);
 DELETE FROM notification_feed_events WHERE id IN (SELECT id FROM demo_feed);
 DELETE FROM operational_alert_rules WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM financial_staff_notices WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM financial_month_jobs WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM site_account_assignments WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM rate_versions WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM site_billing_settings WHERE site_id IN (SELECT id FROM demo_site);
 UPDATE discovered_gateways SET assigned_site_id=NULL,assigned_gateway_id=NULL,status='unassigned',assigned_at=NULL WHERE assigned_site_id IN (SELECT id FROM demo_site);
 DELETE FROM gateway_installation_history WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM telemetry_raw WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM telemetry_aggregate WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM alerts WHERE id IN (SELECT id FROM demo_alerts);
 DELETE FROM billing_source_bindings WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM billing_meters WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM payload_samples WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM payload_rejections WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM telemetry_archive_dirty WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM telemetry_archive_scan WHERE site_id IN (SELECT id FROM demo_site);
 DELETE FROM sites WHERE id IN (SELECT id FROM demo_site);`);
 const preserved=(await client.query(`SELECT (SELECT count(*) FROM customers)=(SELECT customers FROM demo_global_counts) AND (SELECT count(*) FROM users)=(SELECT users FROM demo_global_counts) AND (SELECT count(*) FROM meter_presets)=(SELECT meter_presets FROM demo_global_counts) AND (SELECT count(*) FROM payload_profile_revisions WHERE owner_device_id IS NULL)=(SELECT shared_profiles FROM demo_global_counts) AS value`)).rows[0]?.value;
 if(!preserved)throw Error('Unrelated-data preservation guard failed');return {deletedSiteId:site.id,externalSiteId:site.external_site_id,unrelatedDataPreserved:true};
}
