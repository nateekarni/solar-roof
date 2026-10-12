/** Reveal and focus errors without scrolling the page behind an open dialog. */
export function focusErrorElement(element: HTMLElement) {
 for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
  if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
 }
 requestAnimationFrame(() => {
  if (!element.isConnected) return;
  if (!element.matches('input,select,textarea,button,[tabindex]')) element.tabIndex = -1;
  element.focus({preventScroll:true});
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  let container = element.parentElement;
  while (container && !/(auto|scroll)/.test(getComputedStyle(container).overflowY)) container = container.parentElement;
  if (container) {
   const target = element.getBoundingClientRect(), bounds = container.getBoundingClientRect();
   container.scrollTo({top:container.scrollTop + target.top - bounds.top - 24, behavior});
  } else element.scrollIntoView({block:'center',behavior});
 });
}

type ValidationError = {message?: unknown; ref?: unknown; [key:string]:unknown};
export function focusInvalidFields(errors: unknown, reveal?: () => void) {
 reveal?.();
 const fields: {element:HTMLElement;message:string}[] = [];
 const visit = (value:unknown) => {
  if (!value || typeof value !== 'object') return;
  const error=value as ValidationError;
  if (error.ref instanceof HTMLElement && error.ref.isConnected) fields.push({element:error.ref,message:String(error.message??'')});
  else if (error.ref && typeof error.ref==='object' && 'name' in error.ref) {
   const name=String(error.ref.name);
   const element=document.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
   if(element) fields.push({element,message:String(error.message??'')});
  }
  for(const [key,child] of Object.entries(error)) if(key!=='ref'&&key!=='types')visit(child);
 };
 visit(errors);
 fields.sort((a,b)=>a.element.compareDocumentPosition(b.element)&Node.DOCUMENT_POSITION_PRECEDING?1:-1);
 for(const {element,message} of fields){
  element.setAttribute('aria-invalid','true');
  // The message remains available to assistive technology even for legacy fields.
  if(message) element.setAttribute('aria-description',message);
  element.addEventListener('input',()=>{element.removeAttribute('aria-invalid');element.removeAttribute('aria-description');},{once:true});
 }
 if(fields[0])focusErrorElement(fields[0].element);
}

/** Existing modal forms use both FieldError and legacy inline error paragraphs. */
export function observeFormErrors(root:HTMLElement) {
 let previous='';
 let scheduled=0;
 const check=()=>{
  cancelAnimationFrame(scheduled);
  scheduled=requestAnimationFrame(()=>{
   const errors=Array.from(root.querySelectorAll<HTMLElement>('[role="alert"], [data-slot="field-error"], p.text-destructive'))
    .filter(node=>node.textContent?.trim() && !node.closest('[hidden]'));
   const fingerprint=errors.map(node=>node.textContent).join('|');
   if(fingerprint && fingerprint!==previous){
    const error=errors[0]!;
    const field=error.closest('[data-slot="field"], .space-y-2, .space-y-1, .space-y-1\\.5')?.querySelector<HTMLElement>('input:not([type=hidden]),textarea,select,[role=combobox]');
    if(field){field.setAttribute('aria-invalid','true');if(!error.id)error.id=`form-error-${crypto.randomUUID()}`;field.setAttribute('aria-errormessage',error.id);}
    focusErrorElement(field??error);
   }
   previous=fingerprint;
  });
 };
 const observer=new MutationObserver(check);
 observer.observe(root,{subtree:true,childList:true,characterData:true});
 const submit=()=>{previous='';check();};
 root.addEventListener('submit',submit,true);
 root.addEventListener('invalid',invalid,true);
 let invalidPending=false;
 function invalid(event:Event){if(!invalidPending && event.target instanceof HTMLElement){invalidPending=true;focusErrorElement(event.target);requestAnimationFrame(()=>{invalidPending=false;});}}
 return()=>{observer.disconnect();cancelAnimationFrame(scheduled);root.removeEventListener('submit',submit,true);root.removeEventListener('invalid',invalid,true);};
}
