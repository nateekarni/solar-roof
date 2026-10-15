"use client";
import React, {useEffect,useRef,type ComponentProps} from 'react';
import {focusErrorElement} from '../../lib/form-feedback';
import {cn} from '../../lib/utils';

export function FormErrorSummary({children,className,...props}:ComponentProps<'div'>){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(ref.current&&children)focusErrorElement(ref.current);},[children]);
 if(!children)return null;
 return <div {...props} ref={ref} role="alert" tabIndex={-1} className={cn('rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive',className)}>{children}</div>;
}
