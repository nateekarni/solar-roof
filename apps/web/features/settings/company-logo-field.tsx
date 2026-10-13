'use client';

import * as React from 'react';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {Label} from '../../components/ui/label';

export async function readCompanyImage(file: File, locale: 'th'|'en'): Promise<string> {
  if (!['image/png','image/jpeg'].includes(file.type) || file.size > 1_048_576) {
    throw new Error(locale === 'th' ? 'เลือกภาพ PNG/JPEG ขนาดไม่เกิน 1 MB' : 'Choose a PNG/JPEG image up to 1 MB');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A byte loop avoids overflowing the argument stack for images near 1 MiB.
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${file.type};base64,${btoa(binary)}`;
}

export function CompanyLogoField({id, purpose, value, locale, onChange, disabled = false}: {
  id: string; purpose: 'logo'|'signature'; value: string; locale: 'th'|'en'; onChange: (value: string) => void; disabled?: boolean;
}) {
  const [error, setError] = React.useState('');
  const selection = React.useRef(0);
  const label = purpose === 'logo' ? (locale === 'th' ? 'โลโก้บริษัท' : 'Company logo') : (locale === 'th' ? 'ภาพลายเซ็นผู้วางบิล' : 'Billing signatory image');
  return <div className="space-y-2">
    <Label htmlFor={id}>{label} (PNG/JPEG, 1 MB)</Label>
    <Input id={id} type="file" accept="image/png,image/jpeg" disabled={disabled} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={async event => {
      const file = event.currentTarget.files?.[0];
      const currentSelection = ++selection.current;
      setError('');
      if (!file) return;
      event.currentTarget.value = '';
      try {
        const next = await readCompanyImage(file, locale);
        if (currentSelection === selection.current) onChange(next);
      } catch (err) {
        if (currentSelection === selection.current) setError(err instanceof Error ? err.message : (locale === 'th' ? 'ไม่สามารถอ่านภาพได้' : 'Unable to read image'));
      }
    }}/>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    {value && <><img src={value} alt={label} className="h-16 max-w-full object-contain"/><Button type="button" variant="outline" disabled={disabled} onClick={() => { selection.current++; setError(''); onChange(''); }}>{locale === 'th' ? 'ลบภาพ' : 'Remove image'}</Button></>}
  </div>;
}
