/** Activate any enclosing inactive tab panel before focusing an invalid field. */
export function activateEnclosingTab(element: HTMLElement) {
 for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
  if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
  if (ancestor.getAttribute('role') === 'tabpanel' && (ancestor.getAttribute('data-state') === 'inactive' || ancestor.hasAttribute('hidden'))) {
   const labelledBy = ancestor.getAttribute('aria-labelledby');
   const panelId = ancestor.id;
   const trigger = (labelledBy ? document.getElementById(labelledBy) : null)
    ?? (panelId ? document.querySelector<HTMLElement>(`[role="tab"][aria-controls="${CSS.escape(panelId)}"]`) : null);
   if (trigger) {
    trigger.click();
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
   }
  }
 }
}

/** Reveal and focus errors without scrolling the page behind an open dialog. */
export function focusErrorElement(element: HTMLElement) {
 activateEnclosingTab(element);
 requestAnimationFrame(() => {
  if (!element.isConnected) return;
  const focusTarget = element.classList.contains('hidden')
   ? (element.parentElement?.querySelector<HTMLElement>('[data-slot="select-trigger"],input:not([type=hidden]),textarea,button,[tabindex]') ?? element)
   : element;
  if (!focusTarget.matches('input,select,textarea,button,[tabindex]')) focusTarget.tabIndex = -1;
  focusTarget.focus({preventScroll:true});
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  let container = focusTarget.parentElement;
  while (container && !/(auto|scroll)/.test(getComputedStyle(container).overflowY)) container = container.parentElement;
  if (container) {
   const target = focusTarget.getBoundingClientRect(), bounds = container.getBoundingClientRect();
   container.scrollTo({top:container.scrollTop + target.top - bounds.top - 24, behavior});
  } else focusTarget.scrollIntoView({block:'center',behavior});
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
    for (const errNode of errors) {
     const container = errNode.closest('[data-slot="field"], .space-y-2, .space-y-1, .space-y-1\\.5');
     const control = container?.querySelector<HTMLElement>('[data-slot="select-trigger"],input:not([type=hidden]),textarea,select,[role=combobox]');
     if (control) {
      control.setAttribute('aria-invalid', 'true');
      if (!errNode.id) errNode.id = `form-error-${crypto.randomUUID()}`;
      control.setAttribute('aria-errormessage', errNode.id);
     }
    }
    const error=errors[0]!;
    const field=error.closest('[data-slot="field"], .space-y-2, .space-y-1, .space-y-1\\.5')?.querySelector<HTMLElement>('[data-slot="select-trigger"],input:not([type=hidden]),textarea,select,[role=combobox]');
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
 function invalid(event:Event){
  if(!(event.target instanceof HTMLElement)) return;
  event.preventDefault();
  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const container = target.closest('[data-slot="field"], .space-y-2, .space-y-1, .space-y-1\\.5') ?? target.parentElement;
  const visibleTrigger = container?.querySelector<HTMLElement>('[data-slot="select-trigger"]') ?? target;
  target.setAttribute('aria-invalid', 'true');
  visibleTrigger.setAttribute('aria-invalid', 'true');
  if (container && !container.querySelector('[data-slot="field-error"], [role="alert"], p.text-destructive')) {
   const msg = document.createElement('p');
   msg.setAttribute('data-slot', 'field-error');
   msg.setAttribute('data-auto-error', 'true');
   msg.setAttribute('role', 'alert');
   msg.className = 'text-xs font-normal text-destructive mt-1';
   const isTh = document.documentElement.lang !== 'en';
   msg.textContent = target.tagName === 'SELECT'
    ? (isTh ? 'กรุณาเลือกรายการ' : 'Please select an option')
    : (target.validationMessage || (isTh ? 'กรุณากรอกข้อมูลในช่องนี้' : 'Please fill out this field'));
   container.appendChild(msg);
  }
  const clear = () => {
   target.removeAttribute('aria-invalid');
   visibleTrigger.removeAttribute('aria-invalid');
   container?.querySelector('[data-auto-error="true"]')?.remove();
   target.removeEventListener('input', clear);
   target.removeEventListener('change', clear);
  };
  target.addEventListener('input', clear);
  target.addEventListener('change', clear);
  if(!invalidPending){
   invalidPending=true;
   focusErrorElement(visibleTrigger);
   requestAnimationFrame(()=>{invalidPending=false;});
  }
 }
 return()=>{observer.disconnect();cancelAnimationFrame(scheduled);root.removeEventListener('submit',submit,true);root.removeEventListener('invalid',invalid,true);};
}

