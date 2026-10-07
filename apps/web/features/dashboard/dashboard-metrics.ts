export const DEFAULT_DASHBOARD_METRICS=['totalSites','onlineSites','installedMwp','currentMw','periodKwh','periodAmount'];
export function dashboardMetrics(role:string,config:readonly string[]=DEFAULT_DASHBOARD_METRICS){const allowed=DEFAULT_DASHBOARD_METRICS.filter(key=>role!=='owner'||key!=='currentMw');const next=config.filter(key=>allowed.includes(key));return next.length?next:allowed;}
