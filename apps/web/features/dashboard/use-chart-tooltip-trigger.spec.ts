import test from 'node:test';
import assert from 'node:assert/strict';
import {chartTooltipTriggerStore,createChartTooltipInputMode} from './use-chart-tooltip-trigger';
test('actual key and touch events switch tooltip mode independently for each chart',()=>{
 const chart=createChartTooltipInputMode(),other=createChartTooltipInputMode();let updates=0;
 const unsubscribe=chart.subscribe(()=>{updates++;});
 assert.equal(chart.getSnapshot(),false);
 chart.handlers.onKeyDownCapture();assert.equal(chart.getSnapshot(),true);assert.equal(updates,1);assert.equal(other.getSnapshot(),false);
 chart.handlers.onTouchStartCapture();assert.equal(chart.getSnapshot(),false);assert.equal(updates,2);
 chart.handlers.onKeyDownCapture();assert.equal(chart.getSnapshot(),true);assert.equal(updates,3);
 unsubscribe();chart.handlers.onTouchStartCapture();assert.equal(updates,3);assert.equal(createChartTooltipInputMode().getSnapshot(),false);
});
test('coarse pointer uses supported click trigger after chart remount and pointer changes remain reactive',()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'window');
 let coarse=true;const listeners=new Set<()=>void>();
 const media={get matches(){return coarse;},addEventListener:(_type:string,listener:()=>void)=>listeners.add(listener),removeEventListener:(_type:string,listener:()=>void)=>listeners.delete(listener)};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia:(query:string)=>{assert.equal(query,'(pointer: coarse)');return media;}}});
 try{
  assert.equal(chartTooltipTriggerStore.getServerSnapshot(),'hover');
  assert.equal(chartTooltipTriggerStore.getSnapshot(),'click');
  let updates=0;const first=chartTooltipTriggerStore.subscribe(()=>{updates++;});assert.equal(listeners.size,1);
  coarse=false;for(const notify of listeners)notify();assert.equal(updates,1);assert.equal(chartTooltipTriggerStore.getSnapshot(),'hover');
  first();assert.equal(listeners.size,0);
  coarse=true;const remounted=chartTooltipTriggerStore.subscribe(()=>{updates++;});assert.equal(chartTooltipTriggerStore.getSnapshot(),'click');assert.equal(listeners.size,1);remounted();assert.equal(listeners.size,0);
 }finally{if(prior)Object.defineProperty(globalThis,'window',prior);else Reflect.deleteProperty(globalThis,'window');}
});
test('server tooltip trigger does not access a browser or change hydration default',()=>{
 assert.equal(chartTooltipTriggerStore.getServerSnapshot(),'hover');assert.equal(chartTooltipTriggerStore.getSnapshot(),'hover');assert.doesNotThrow(()=>chartTooltipTriggerStore.subscribe(()=>{})());
});
test('coarse compatibility hover is blocked so it cannot override keyboard data; fine mouse hover remains unchanged',()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'window');let coarse=true,stopped=0;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia:()=>({get matches(){return coarse;}})}});
 try{
  const chart=createChartTooltipInputMode(),event={stopPropagation:()=>{stopped++;}};
  chart.handlers.onMouseOverCapture(event);chart.handlers.onMouseMoveCapture(event);assert.equal(stopped,2);
  chart.handlers.onKeyDownCapture();chart.handlers.onMouseMoveCapture(event);assert.equal(stopped,3);assert.equal(chart.getSnapshot(),true);
  coarse=false;chart.handlers.onMouseOverCapture(event);chart.handlers.onMouseMoveCapture(event);assert.equal(stopped,3);
 }finally{if(prior)Object.defineProperty(globalThis,'window',prior);else Reflect.deleteProperty(globalThis,'window');}
});
