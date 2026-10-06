'use client';

import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/** Keeps native form registration and change events while displaying shadcn Select. */
export const ChoiceSelect = React.forwardRef<HTMLSelectElement, React.ComponentPropsWithoutRef<'select'>>(
  function ChoiceSelect({ children, className, onChange, onInvalid, value, defaultValue, id, ...props }, forwardedRef) {
    const nativeRef = React.useRef<HTMLSelectElement | null>(null);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const options = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<React.ComponentProps<'option'>>[];
    const [current, setCurrent] = React.useState(String(value ?? defaultValue ?? options[0]?.props.value ?? options[0]?.props.children ?? ''));
    React.useEffect(() => { if (nativeRef.current) setCurrent(nativeRef.current.value); }, [value, children]);
    const selected = String(value ?? current);
    const encode = (input: string) => input === '' ? '__empty_choice__' : input;
    return <>
      <select {...props} value={value} defaultValue={defaultValue} tabIndex={-1} aria-hidden="true" className="hidden"
        ref={node => { nativeRef.current = node; if (typeof forwardedRef === 'function') forwardedRef(node); else if (forwardedRef) forwardedRef.current = node; }}
        onInvalid={event => { event.preventDefault(); triggerRef.current?.focus(); onInvalid?.(event); }}
        onChange={event => { setCurrent(event.target.value); onChange?.(event); }}>
        {children}
      </select>
      <Select value={encode(selected)} disabled={Boolean(props.disabled)} onValueChange={next => {
        const node = nativeRef.current;
        if (!node) return;
        const nextValue = next === '__empty_choice__' ? '' : next;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(node, nextValue);
        node.dispatchEvent(new Event('change', { bubbles: true }));
        setCurrent(nextValue);
      }}>
        <SelectTrigger ref={triggerRef} id={id} aria-required={props.required} aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} aria-invalid={props['aria-invalid']} className={className} onBlur={() => nativeRef.current?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{options.map((option, index) => {
          const optionValue = String(option.props.value ?? option.props.children ?? '');
          return <SelectItem key={`${optionValue}-${index}`} value={encode(optionValue)} disabled={Boolean(option.props.disabled)}>{option.props.children}</SelectItem>;
        })}</SelectContent>
      </Select>
    </>;
  }
);
