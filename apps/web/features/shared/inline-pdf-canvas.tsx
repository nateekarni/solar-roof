'use client';
import {useEffect,useRef,useState} from 'react';

/** Read-only rendering of the same original bytes used by Download. No browser viewer chrome. */
export function InlinePdfCanvas({url,title,locale='th'}:{url:string;title:string;locale?:'th'|'en'}) {
 const host=useRef<HTMLDivElement>(null);
 const [error,setError]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{
  const element=host.current;if(!element)return;
  let stopped=false;
  let cleanup=()=>{};
  setError(false);setLoading(true);
  void (async()=>{
   const pdfjs=await import('pdfjs-dist');
   if(stopped)return;
   pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
   const task=pdfjs.getDocument({url});
   cleanup=()=>{void task.destroy().catch(()=>{});};
   const pdf=await task.promise;
   for(let number=1;number<=pdf.numPages&&!stopped;number++){
    const page=await pdf.getPage(number);if(stopped)break;
    const base=page.getViewport({scale:1});
    const width=Math.min(1400,Math.max(320,element.clientWidth));
    const viewport=page.getViewport({scale:width/base.width*Math.min(window.devicePixelRatio||1,2)});
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    canvas.style.width='100%';canvas.style.height='auto';canvas.style.display='block';
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${title} · ${number} / ${pdf.numPages}`);
    element.append(canvas);
    await page.render({canvas,viewport}).promise;
   }
   if(!stopped)setLoading(false);
  })().catch(()=>{if(!stopped){setError(true);setLoading(false);}});
  return()=>{stopped=true;cleanup();element.replaceChildren();};
 },[url,title]);
 return <div className="max-h-[70dvh] overflow-auto rounded border bg-muted/30" aria-label={title}>
  {loading&&<p role="status" className="p-3 text-sm">{locale==='th'?'กำลังโหลด PDF…':'Loading PDF…'}</p>}
  {error&&<p role="alert" className="p-3 text-sm">{locale==='th'?'ไม่สามารถแสดงตัวอย่าง PDF ได้ กรุณาใช้ปุ่มดาวน์โหลด':'PDF preview unavailable. Please use Download.'}</p>}
  <div ref={host} className="space-y-3"/>
 </div>;
}
