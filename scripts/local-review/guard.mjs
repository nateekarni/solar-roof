export function assertReviewTarget(connectionString, databaseName) {
 const url=new URL(connectionString);
 if(!['postgresql:','postgres:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='15439'||url.pathname!=='/solar_dashboard_review'||databaseName!=='solar_dashboard_review')throw new Error('Refusing to write outside the dedicated local review database');
}
