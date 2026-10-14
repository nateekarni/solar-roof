"use client";

import {useEffect, useId, useRef, useState} from 'react';
import {FormErrorSummary} from '../../components/feedback/form-feedback';
import {Button} from '../../components/ui/button';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {authStore, useAuth} from '../../stores/auth-store';

type Profile = {
  displayName: string;
  companyPosition: string | null;
  hasSignature?: boolean;
  signatureDataUri?: string | null;
};
type SignatureResult = {hasSignature: boolean; signatureDataUri?: string};

export async function readSignatureFile(file: File, locale: 'th' | 'en'): Promise<string> {
  const th = locale === 'th';
  if (!file.size || file.size > 256 * 1024 || !['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error(th ? 'เลือกลายเซ็น PNG หรือ JPEG ขนาดไม่เกิน 256 KiB' : 'Select a PNG or JPEG signature up to 256 KiB');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const fail = () => reject(new Error(th ? 'ไม่สามารถอ่านรูปลายเซ็นได้ กรุณาเลือกไฟล์อีกครั้ง' : 'Unable to read signature image. Choose the file again.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : fail();
    reader.onerror = fail;
    reader.onabort = fail;
    reader.readAsDataURL(file);
  });
}

export async function saveOwnSignature(profile: Profile, image: string | null, userId: string, signal?: AbortSignal): Promise<Profile> {
  if (authStore.getState().user?.id !== userId) throw new Error('Session changed');
  const result = await apiClient.put<SignatureResult>('/v1/me/signature', {image}, signal ? {signal} : undefined);
  const updated = {...profile, hasSignature: result.hasSignature};
  delete updated.signatureDataUri;
  if (result.hasSignature && result.signatureDataUri) updated.signatureDataUri = result.signatureDataUri;
  authStore.updateDocumentIdentity(userId, {companyPosition: profile.companyPosition, hasSignature: result.hasSignature});
  return updated;
}

export function OwnSignatureCard({profile, busy, onChoose, onRemove, locale = 'th', error = '', saved = false}: {
  profile: Profile;
  busy: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
  locale?: 'th' | 'en';
  error?: string;
  saved?: boolean;
}) {
  const th = locale === 'th', fileInput = useRef<HTMLInputElement>(null), id = useId();
  const hasSignature = profile.hasSignature ?? Boolean(profile.signatureDataUri);
  return <section aria-labelledby={`${id}-title`} aria-busy={busy} className="space-y-4">
    <header className="space-y-1">
      <h2 id={`${id}-title`} className="font-semibold">{th ? 'ข้อมูลสำหรับเอกสาร' : 'Document identity'}</h2>
      <p className="text-sm text-muted-foreground">{th ? 'ตำแหน่งและลายเซ็นของคุณสำหรับเอกสารในอนาคตที่ออกโดยระบบ' : 'Your company position and signature for future documents issued by the system'}</p>
    </header>
    <dl className="grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
      <dt className="text-muted-foreground">{th ? 'ตำแหน่งในบริษัท' : 'Company position'}</dt><dd>{profile.companyPosition || (th ? 'ยังไม่ได้กำหนดตำแหน่ง' : 'Position not assigned')}</dd>
    </dl>
    <p className="text-xs text-muted-foreground">{th ? 'ติดต่อผู้ดูแลระบบเพื่อแก้ไขตำแหน่งในบริษัท' : 'Contact an administrator to change your company position.'}</p>
    {profile.signatureDataUri ? <div className="flex min-h-28 items-center justify-center rounded-lg border bg-white p-4"><img src={profile.signatureDataUri} alt={th ? 'ลายเซ็นของฉัน' : 'My signature'} className="max-h-32 max-w-full object-contain"/></div> : <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">{th ? 'ยังไม่มีลายเซ็น (ไม่บังคับ)' : 'No signature saved (optional)'}</p>}
    <p id={`${id}-help`} className="text-xs text-muted-foreground">{th ? 'เลือกไฟล์ PNG หรือ JPEG ขนาดไม่เกิน 256 KiB ลายเซ็นเป็นข้อมูลที่ไม่บังคับ การเปลี่ยนหรือลบมีผลกับเอกสารในอนาคต' : 'Choose a PNG or JPEG up to 256 KiB. A signature is optional. Changes or removal apply to future documents.'}</p>
    <input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg" aria-label={th ? 'อัปโหลดลายเซ็น' : 'Upload signature'} aria-describedby={`${id}-help`} disabled={busy} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file && !busy) onChoose(file);
    }}/>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>{hasSignature ? (th ? 'เปลี่ยนลายเซ็น' : 'Replace signature') : (th ? 'อัปโหลดลายเซ็น' : 'Upload signature')}</Button>
      <Button type="button" variant="destructive" disabled={busy || !hasSignature} onClick={onRemove}>{th ? 'ลบลายเซ็น' : 'Remove signature'}</Button>
    </div>
    {busy && <p role="status" className="text-sm">{th ? 'กำลังบันทึกลายเซ็น…' : 'Saving signature…'}</p>}
    {saved && !busy && <p role="status" className="text-sm">{th ? 'บันทึกข้อมูลลายเซ็นแล้ว' : 'Signature updated'}</p>}
    {error && <FormErrorSummary>{error}</FormErrorSummary>}
  </section>;
}

function OwnSignatureAccount({userId}: {userId: string}) {
  const locale = useLocale(), th = locale === 'th';
  const [profile, setProfile] = useState<Profile | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [attempt, setAttempt] = useState(0);
  const active = useRef(false), saving = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setError('');
    apiClient.get<Profile>('/v1/me/profile', {signal: abort.signal}).then(value => {
      if (!active.current || abort.signal.aborted || authStore.getState().user?.id !== userId) return;
      setProfile(value);
      authStore.updateDocumentIdentity(userId, {companyPosition: value.companyPosition, hasSignature: value.hasSignature ?? Boolean(value.signatureDataUri)});
    }).catch(reason => {
      if (active.current && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : (th ? 'โหลดข้อมูลลายเซ็นไม่สำเร็จ' : 'Unable to load signature'));
    });
    return () => {active.current = false; abort.abort();};
  }, [userId, attempt, th]);

  const save = async (file: File | null) => {
    if (!profile || saving.current || authStore.getState().user?.id !== userId) return;
    saving.current = true;
    setBusy(true); setError(''); setSaved(false);
    try {
      const image = file ? await readSignatureFile(file, locale) : null;
      if (!active.current || controller.current?.signal.aborted) return;
      const updated = await saveOwnSignature(profile, image, userId, controller.current?.signal);
      if (active.current && authStore.getState().user?.id === userId) {setProfile(updated); setSaved(true);}
    } catch (reason) {
      if (active.current && !controller.current?.signal.aborted) setError(reason instanceof Error ? reason.message : (th ? 'บันทึกลายเซ็นไม่สำเร็จ' : 'Unable to save signature'));
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  };

  if (profile) return <OwnSignatureCard profile={profile} locale={locale} busy={busy} error={error} saved={saved} onChoose={file => void save(file)} onRemove={() => void save(null)}/>;
  if (error) return <div className="space-y-3"><FormErrorSummary>{error}</FormErrorSummary><Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)}>{th ? 'ลองอีกครั้ง' : 'Try again'}</Button></div>;
  return <p role="status" className="text-sm text-muted-foreground">{th ? 'กำลังโหลดข้อมูลลายเซ็น…' : 'Loading signature…'}</p>;
}

export function OwnSignature() {
  const {user} = useAuth();
  return user ? <OwnSignatureAccount key={user.id} userId={user.id}/> : null;
}
