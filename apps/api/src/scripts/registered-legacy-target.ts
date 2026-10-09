/** Legacy MQTT examples must use the commissioned subscription, not an invented identity. */
export function legacyTelemetryTopic(subscription:string):string {
 if(!/^(energy\/)?[A-Za-z0-9_-]+\/#$/.test(subscription)&&!/^\/[A-Za-z0-9_-]+\/#$/.test(subscription))
  throw new Error('Select a registered legacy MQTT gateway; standard payload gateways require profile fixtures.');
 return subscription.slice(0,-1)+'telemetry';
}

export const registeredLegacyTargetsSql=`SELECT s.id AS "siteId",s.name AS "siteName",g.id AS "gatewayId",g.name AS "gatewayName",g.endpoint,
 d.id AS "deviceId",d.model AS "deviceModel",d.serial_number AS "serialNumber"
 FROM sites s JOIN gateways g ON g.site_id=s.id JOIN devices d ON d.gateway_id=g.id AND d.site_id=s.id
 WHERE s.status<>'archived' AND g.protocol='mqtt' AND g.endpoint NOT LIKE 'solar/v1/%'
 AND g.mqtt_broker_id IS NULL AND ($1::uuid IS NULL OR s.id=$1::uuid)
 ORDER BY s.created_at,g.id,d.id`;
