'use client';

import * as React from 'react';
import { CameraOff, Upload, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';

export async function readCompanyImage(file: File, locale: 'th'|'en'): Promise<string> {
  if (!['image/png','image/jpeg'].includes(file.type) || file.size > 1_048_576) {
    throw new Error(locale === 'th' ? 'เลือกภาพ PNG/JPEG ขนาดไม่เกิน 1 MB' : 'Choose a PNG/JPEG image up to 1 MB');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${file.type};base64,${btoa(binary)}`;
}

export function CompanyLogoField({
  id,
  purpose = 'logo',
  value,
  locale,
  onChange,
  disabled = false,
  readOnly = false,
  canEdit = true,
}: {
  id: string;
  purpose?: 'logo'|'signature';
  value: string;
  locale: 'th'|'en';
  onChange?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  canEdit?: boolean;
}) {
  const [error, setError] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const selection = React.useRef(0);
  const th = locale === 'th';
  const label = purpose === 'logo'
    ? (th ? 'โลโก้บริษัท' : 'Company logo')
    : (th ? 'ภาพลายเซ็นผู้วางบิล' : 'Billing signatory image');

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    const currentSelection = ++selection.current;
    setError('');
    if (!file) return;
    event.currentTarget.value = '';
    try {
      const next = await readCompanyImage(file, locale);
      if (currentSelection === selection.current) onChange?.(next);
    } catch (err) {
      if (currentSelection === selection.current) {
        setError(err instanceof Error ? err.message : (th ? 'ไม่สามารถอ่านภาพได้' : 'Unable to read image'));
      }
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    selection.current++;
    setError('');
    onChange?.('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Read-only Display Mode
  if (readOnly) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <div className="flex h-28 w-52 items-center justify-center rounded-xl border border-border/80 bg-muted/20 p-2.5 overflow-hidden">
          {value ? (
            <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center text-center gap-1 text-muted-foreground/60 p-2">
              <CameraOff className="size-6 shrink-0" />
              <span className="text-xs font-normal">{th ? 'ยังไม่ได้อัปโหลดโลโก้' : 'No logo uploaded'}</span>
              {canEdit && (
                <span className="text-[10px] text-muted-foreground">
                  {th ? 'เลือกแก้ไขเพื่อเพิ่มโลโก้บริษัท' : 'Choose Edit to add your company logo'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Edit / Interactive Mode
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-medium text-foreground">
          {label} <span className="font-normal text-muted-foreground">(PNG/JPEG, 1 MB)</span>
        </Label>
        {value && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3 mr-1" />
            {th ? 'ลบรูปภาพ' : 'Remove image'}
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg"
        disabled={disabled}
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`group relative flex h-28 w-full max-w-xs cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          disabled ? 'opacity-50 cursor-not-allowed border-border bg-muted/10' :
          value
            ? 'border-border/80 bg-muted/20 hover:border-primary/60 hover:bg-muted/40'
            : 'border-border hover:border-primary hover:bg-primary/5'
        }`}
      >
        {value ? (
          <>
            <div className="p-2 flex h-full w-full items-center justify-center">
              <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <div className="flex items-center gap-1.5 rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-900 shadow-sm">
                <RefreshCw className="size-3" />
                <span>{th ? 'คลิกเพื่อเปลี่ยนรูป' : 'Change logo'}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 p-3 text-center">
            <div className="rounded-full bg-primary/10 p-2 text-primary group-hover:scale-105 transition-transform">
              <Upload className="size-4" />
            </div>
            <span className="text-xs font-medium text-foreground">
              {th ? 'คลิกที่กล่องเพื่อเลือกรูป' : 'Click to upload logo'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {th ? 'PNG หรือ JPEG ไม่เกิน 1 MB' : 'PNG, JPEG up to 1 MB'}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
