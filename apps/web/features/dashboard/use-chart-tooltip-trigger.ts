'use client';
import {useState,useSyncExternalStore} from 'react';
const pointerQuery=()=>typeof window==='undefined'||!window.matchMedia?null:window.matchMedia('(pointer: coarse)');
/** Recharts' click trigger uses native taps. Fine pointers retain hover, and keyboard stays in accessibilityLayer. */
export const chartTooltipTriggerStore={
 getSnapshot:(): 'hover'|'click'=>pointerQuery()?.matches?'click':'hover',
 getServerSnapshot:(): 'hover'|'click'=>'hover',
 subscribe:(listener:()=>void)=>{const media=pointerQuery();media?.addEventListener('change',listener);return()=>media?.removeEventListener('change',listener);},
};
/** Per-chart input mode: touch can focus the SVG, so only an actual key event enables keyboard mode. */
export function createChartTooltipInputMode(){
 let keyboard=false;const listeners=new Set<()=>void>();
 const update=(value:boolean)=>{if(value===keyboard)return;keyboard=value;for(const listener of listeners)listener();};
 // A native tap also emits mouseover/mousemove. Recharts retains that hover datum above keyboard state.
 // Coarse pointers use click, so suppress only hover-only compatibility events; clicks, keys and touch pass through.
 const suppressCoarseHover=(event:{stopPropagation:()=>void})=>{if(pointerQuery()?.matches)event.stopPropagation();};
 return {getSnapshot:()=>keyboard,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},handlers:{onKeyDownCapture:()=>update(true),onTouchStartCapture:()=>update(false),onMouseOverCapture:suppressCoarseHover,onMouseMoveCapture:suppressCoarseHover}};
}
export function useChartTooltipTrigger(){
 const pointerTrigger=useSyncExternalStore(chartTooltipTriggerStore.subscribe,chartTooltipTriggerStore.getSnapshot,chartTooltipTriggerStore.getServerSnapshot);
 const [inputMode]=useState(createChartTooltipInputMode);
 const keyboard=useSyncExternalStore(inputMode.subscribe,inputMode.getSnapshot,()=>false);
 return {trigger:keyboard?'hover' as const:pointerTrigger,handlers:inputMode.handlers};
}
