/** Change only site scope: preserve the user's date range and other dashboard controls. */
export function dashboardSiteHref(search: string, siteId: string) {
  const params = new URLSearchParams(search);
  if (siteId) params.set('site_id', siteId); else params.delete('site_id');
  return params.size ? `/?${params}` : '/';
}
export function dashboardScopeMatches(selectedSiteId: string, dataSiteId?: string) {
  return selectedSiteId === (dataSiteId || '');
}
