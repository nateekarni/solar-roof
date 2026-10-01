/** Return destinations are local pages, never URLs supplied by a caller. */
export function safeReturnTo(value:string|null|undefined):string {
  if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f]/.test(value))return '/';
  const url=new URL(value,'http://return.local');
  if(url.origin!=='http://return.local'||/^\/session\/refresh(?:\/|$)/i.test(url.pathname)||/^\/login(?:\/|$)/i.test(url.pathname)||/^\/v1(?:\/|$)/i.test(url.pathname))return '/';
  url.searchParams.delete('_rsc');
  return url.pathname+url.search+url.hash;
}
