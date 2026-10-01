'use client';

import {useEffect,useRef} from 'react';
import {safeReturnTo} from '@/lib/session-navigation';

export default function SessionRefreshPage() {
  const started=useRef(false);
  useEffect(()=>{
    if(started.current)return;
    started.current=true;
    const returnTo=safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
    void (async()=>{
      try {
        // Browser supplies the genuine same-origin Origin and receives HttpOnly cookies.
        const response=await fetch('/v1/auth/refresh',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
        if(response.ok) {window.location.replace(returnTo);return;}
      } catch { /* A failed refresh must not send navigation back into a refresh loop. */ }
      try {await fetch('/v1/auth/logout',{method:'POST',credentials:'same-origin'});}catch {}
      window.location.replace('/login?sessionExpired=1');
    })();
  },[]);
  return <main><p role="status">กำลังต่ออายุเซสชัน / Restoring your session…</p></main>;
}
