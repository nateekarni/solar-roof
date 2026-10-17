"use client";

import { useEffect, useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import Link from 'next/link';
import { FormErrorSummary } from '../../components/feedback/form-feedback';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Camera, CheckCircle2, Building2, User, ArrowRight } from 'lucide-react';

interface InvitationDetails {
  email: string;
  displayName: string;
  role: string;
  companyName: string;
  logoUrl: string | null;
}

const roleMap: Record<string, { th: string; en: string }> = {
  owner: { th: 'ผู้ดูแลระบบสูงสุด (Owner)', en: 'Owner' },
  admin: { th: 'ผู้ดูแลระบบ (Admin)', en: 'Administrator' },
  operator: { th: 'เจ้าหน้าที่ปฏิบัติการ (Operator)', en: 'Operator' },
  accountant: { th: 'เจ้าหน้าที่บัญชี (Accountant)', en: 'Accountant' },
  customer_user: { th: 'ผู้ใช้งานลูกค้า (Customer User)', en: 'Customer User' },
};

export function ActivateAccount({ initialToken, initialReady = false }: { initialToken?: string; initialReady?: boolean } = {}) {
  const [token, setToken] = useState(initialToken ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [ready, setReady] = useState(initialReady);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captured = useRef(false);

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const url = new URL(window.location.href);
    const rawToken = initialToken ?? url.searchParams.get('token') ?? '';
    setToken(rawToken);
    History.prototype.replaceState.call(window.history, window.history.state, '', '/activate');

    if (rawToken) {
      fetch(`/v1/auth/invitation-details?token=${encodeURIComponent(rawToken)}`)
        .then(async (res) => {
          if (!res.ok) {
            setError(
              res.status === 400 || res.status === 404 || res.status === 401
                ? 'คำเชิญหมดอายุหรือถูกใช้งานแล้ว กรุณาติดต่อผู้ดูแลเพื่อส่งคำเชิญใหม่ / Invitation is invalid or expired.'
                : 'เกิดข้อผิดพลาดในการโหลดข้อมูลคำเชิญ / Failed to load invitation details.'
            );
            return null;
          }
          return res.json();
        })
        .then((data: InvitationDetails | null) => {
          if (data) {
            setDetails(data);
            if (data.displayName) {
              setDisplayName(data.displayName);
            }
          }
        })
        .catch(() => {
          setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ / Unable to connect to server.');
        })
        .finally(() => {
          setReady(true);
        });
    } else {
      setReady(true);
    }
  }, []);

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (PNG, JPG, WebP) / Please select a valid image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('ขนาดรูปภาพต้องไม่เกิน 2MB / Image size must not exceed 2MB.');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setAvatarData(dataUrl);
      setAvatarPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveAvatar() {
    setAvatarData(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (password.length < 12) {
      setError('รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร / Password must be at least 12 characters.');
      return;
    }

    if (password !== confirm) {
      setError('รหัสผ่านไม่ตรงกัน / Passwords do not match');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/v1/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({
          token,
          password,
          displayName: displayName.trim() || undefined,
          avatarData: avatarData || undefined,
        }),
      });

      if (!response.ok) {
        setError(
          response.status === 429
            ? 'กรุณาลองอีกครั้งใน 1 นาที / Try again in one minute'
            : response.status === 400
            ? 'รหัสผ่านต้องมี 12–128 ตัวอักษร หรือข้อมูลไม่ถูกต้อง / Use 12–128 characters'
            : 'คำเชิญหมดอายุหรือใช้แล้ว กรุณาติดต่อผู้ดูแลเพื่อส่งใหม่ / Invitation unavailable. Ask your administrator to resend.'
        );
        return;
      }

      setComplete(true);
      setToken('');
      setPassword('');
      setConfirm('');
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่ / Unable to connect. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const roleInfo = details?.role ? roleMap[details.role] : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-border/80 bg-card p-8 shadow-sm">
        {/* Corporate Branded Header */}
        <div className="mb-6 text-center">
          {details?.logoUrl ? (
            <div className="mb-3 flex justify-center">
              <img
                src={details.logoUrl}
                alt={details.companyName || 'Logo'}
                className="max-h-14 max-w-[200px] object-contain"
              />
            </div>
          ) : (
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
          )}
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {details?.companyName || 'Solar Roof System'}
          </h2>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {complete
              ? 'เปิดใช้งานบัญชีสำเร็จ / Activation Complete'
              : 'เปิดใช้งานบัญชีผู้ใช้ / Activate Account'}
          </h1>
        </div>

        {complete ? (
          /* Welcome Summary Card */
          <div className="space-y-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center dark:border-emerald-950 dark:bg-emerald-950/20">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">
                ยินดีต้อนรับสู่ระบบ / Welcome!
              </h3>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400" role="status">
                บัญชีของคุณได้รับการตั้งค่าและเปิดใช้งานเรียบร้อยแล้ว
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-4">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="User Avatar"
                    className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/20"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-8 w-8" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">
                    {displayName || details?.displayName || 'ผู้ใช้งานใหม่'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{details?.email}</p>
                  {roleInfo && (
                    <span className="mt-1 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {roleInfo.th}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Link href="/login" className="block">
              <Button type="button" className="w-full h-11 gap-2 text-base font-medium">
                เข้าสู่ระบบเพื่อเริ่มใช้งาน / Sign in
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        ) : ready && !token ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground" role="alert">
              กรุณาเปิดลิงก์จากอีเมลคำเชิญเพื่อเปิดใช้งานบัญชี <br />
              <span className="text-xs">Please open the link provided in your invitation email.</span>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {details && (
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <div>
                  <strong className="text-foreground">อีเมล / Email:</strong> {details.email}
                </div>
                {roleInfo && (
                  <div>
                    <strong className="text-foreground">บทบาท / Role:</strong> {roleInfo.th}
                  </div>
                )}
              </div>
            )}

            {/* Zero-Storage In-Memory Avatar Picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                รูปโปรไฟล์ / Profile Avatar{' '}
                <span className="text-xs font-normal text-muted-foreground">(ไม่บังคับ / Optional, สูงสุด 2MB)</span>
              </Label>
              <div className="flex items-center gap-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted/30">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="activate-avatar"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs bg-white hover:bg-muted"
                  >
                    {avatarPreview ? 'เปลี่ยนรูป / Change' : 'อัปโหลดรูป / Upload'}
                  </Button>
                  {avatarPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveAvatar}
                      className="text-xs text-destructive hover:bg-destructive/10"
                    >
                      ลบรูป / Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Editable Name */}
            <div className="space-y-2">
              <Label htmlFor="activate-name">ชื่อ-นามสกุล / Display Name</Label>
              <Input
                id="activate-name"
                type="text"
                autoComplete="name"
                placeholder="กรอกชื่อ-นามสกุล"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Password Fields */}
            <div className="space-y-2">
              <Label htmlFor="activate-password">รหัสผ่านใหม่ / New Password</Label>
              <Input
                id="activate-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                placeholder="อย่างน้อย 12 ตัวอักษร"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ความยาว 12–128 ตัวอักษร / Between 12 and 128 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activate-confirm">ยืนยันรหัสผ่านใหม่ / Confirm New Password</Label>
              <Input
                id="activate-confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                placeholder="กรอกรหัสผ่านอีกครั้ง"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && <FormErrorSummary>{error}</FormErrorSummary>}

            <Button
              type="submit"
              disabled={!ready || !token || busy}
              className="w-full h-11 text-base font-medium"
            >
              {busy ? 'กำลังบันทึกข้อมูล… / Activating…' : 'เปิดใช้งานบัญชีผู้ใช้ / Activate Account'}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
