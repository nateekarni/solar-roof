"use client";
import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FieldLabel } from "../../components/ui/field";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { FormErrorSummary } from "../../components/feedback/form-feedback";
import { useAuth, authStore } from "../../stores/auth-store";
import { useLocale } from "../../providers/locale-provider";
import { apiClient } from "../../lib/api-client";
import { cropRectangle, validateAvatarFile } from "./avatar-crop";
import { Camera, CheckCircle2 } from "lucide-react";

export interface CustomerProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inline?: boolean;
  showPosition?: boolean;
}

export function CustomerProfileModal({ open, onOpenChange, inline = false, showPosition = false }: CustomerProfileModalProps) {
  const { user } = useAuth();
  const locale = useLocale();
  const th = locale === "th";
  const text = (thText: string, enText: string) => (th ? thText : enText);

  const [name, setName] = useState(user?.displayName ?? "");
  const [position, setPosition] = useState(user?.companyPosition ?? "");
  const [cropSource, setCropSource] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [avatarSuccess, setAvatarSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    if (open) {
      setName(user?.displayName ?? "");
      setPosition(user?.companyPosition ?? "");
      setError("");
      setAvatarSuccess(false);
      setCropSource(null);
    }
  }, [open, user?.displayName, user?.companyPosition]);

  useEffect(() => {
    if (!cropSource || !canvasRef.current) return;
    try {
      const crop = cropRectangle(cropSource.naturalWidth, cropSource.naturalHeight, zoom, pan.x, pan.y);
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, 256, 256);
        ctx.drawImage(cropSource, crop.x, crop.y, crop.width, crop.height, 0, 0, 256, 256);
      }
    } catch {}
  }, [cropSource, zoom, pan]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setAvatarSuccess(false);

    if (!validateAvatarFile(file)) {
      setError(text("กรุณาเลือกไฟล์ภาพ PNG หรือ JPEG ขนาดไม่เกิน 5 MB", "Select a PNG or JPEG file up to 5 MB"));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (image.naturalWidth * image.naturalHeight > 40_000_000) {
        setError(text("ขนาดภาพใหญ่เกินไป กรุณาใช้ภาพที่มีความละเอียดต่ำลง", "Image dimensions are too large"));
        return;
      }
      setCropSource(image);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError(text("ไม่สามารถอ่านไฟล์ภาพได้", "Unable to read image file"));
    };
    image.src = url;
  };

  const handleSaveAvatar = async () => {
    if (!canvasRef.current || !user) return;
    setAvatarBusy(true);
    setError("");
    try {
      const image = canvasRef.current.toDataURL("image/jpeg", 0.85);
      const result = await apiClient.put<{ avatarData: string }>("/v1/me/avatar", { image });
      const current = authStore.getState();
      if (current.user?.id === user.id) {
        authStore.setAuth(
          { ...current.user, avatarData: result.avatarData },
          current.accessToken ?? undefined,
        );
      }
      setCropSource(null);
      setAvatarSuccess(true);
      setTimeout(() => setAvatarSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : text("บันทึกรูปโปรไฟล์ไม่สำเร็จ", "Unable to save avatar"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(text("กรุณาระบุชื่อที่แสดง", "Display name is required"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload: { displayName: string; companyPosition?: string | null } = {
        displayName: trimmed,
      };
      if (showPosition) {
        payload.companyPosition = position.trim() || null;
      }
      const result = await apiClient.put<{ displayName: string; companyPosition?: string | null }>("/v1/me/profile", payload);
      const current = authStore.getState();
      if (current.user?.id === user.id) {
        const nextPosition: string | null = showPosition
          ? (result.companyPosition ?? null)
          : (current.user.companyPosition ?? null);
        authStore.setAuth(
          { ...current.user, displayName: result.displayName, companyPosition: nextPosition },
          current.accessToken ?? undefined,
        );
        if (showPosition) {
          authStore.updateDocumentIdentity(user.id, {
            companyPosition: nextPosition,
            hasSignature: current.user.hasSignature ?? false,
          });
        }
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : text("บันทึกโปรไฟล์ไม่สำเร็จ", "Unable to save profile"));
    } finally {
      setBusy(false);
    }
  };

  const initials = user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : "CU";

  const cropSection = (
    <div className="space-y-4 py-2">
      <canvas
        ref={canvasRef}
        width={256}
        height={256}
        className="mx-auto aspect-square w-56 touch-none cursor-move rounded-full border-2 border-border shadow-md"
        aria-label={text("ตัวอย่างรูปที่ครอบตัด", "Cropped preview")}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        }}
        onPointerMove={(event) => {
          if (!dragRef.current || !cropSource) return;
          const start = dragRef.current;
          const crop = cropRectangle(cropSource.naturalWidth, cropSource.naturalHeight, zoom, pan.x, pan.y);
          const size = event.currentTarget.getBoundingClientRect().width;
          const ratio = crop.width / size;
          setPan({
            x: Math.max(-1, Math.min(1, start.panX - (event.clientX - start.x) * ratio * 2 / Math.max(1, cropSource.naturalWidth - crop.width))),
            y: Math.max(-1, Math.min(1, start.panY - (event.clientY - start.y) * ratio * 2 / Math.max(1, cropSource.naturalHeight - crop.height))),
          });
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
      />

      <div className="space-y-1.5 px-2">
        <label htmlFor="crop-zoom-slider" className="text-xs font-medium text-muted-foreground">
          {text("ซูมรูปภาพ", "Zoom")}
        </label>
        <input
          id="crop-zoom-slider"
          type="range"
          min="1"
          max="4"
          step="0.01"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
        />
      </div>

      {error && <FormErrorSummary>{error}</FormErrorSummary>}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={avatarBusy}
          onClick={() => setCropSource(null)}
        >
          {text("ยกเลิก", "Cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={avatarBusy}
          onClick={handleSaveAvatar}
        >
          {avatarBusy ? text("กำลังบันทึก…", "Saving…") : text("ใช้รูปนี้", "Apply Photo")}
        </Button>
      </div>
    </div>
  );

  const profileForm = (
    <form onSubmit={handleSaveProfile} className="space-y-4 py-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        aria-label={text("เลือกรูปโปรไฟล์", "Select profile image")}
        onChange={handleFileChange}
      />

      {/* Avatar & Photo Picker */}
      <div className="flex flex-col items-center gap-3 pb-2">
        <div className="relative group">
          <Avatar className="size-24 border-2 border-border shadow-sm">
            {user?.avatarData && <AvatarImage src={user.avatarData} alt={user.displayName || ""} />}
            <AvatarFallback className="bg-primary text-primary-foreground font-bold text-2xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            aria-label={text("เปลี่ยนรูปโปรไฟล์", "Change profile image")}
          >
            <Camera className="size-5" />
            <span className="text-[10px] mt-0.5">{text("เปลี่ยนรูป", "Change")}</span>
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs h-8 gap-1.5"
        >
          <Camera className="size-3.5" />
          <span>{text("เลือกรูปภาพใหม่", "Upload new photo")}</span>
        </Button>
        {avatarSuccess && (
          <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="size-3.5" />
            <span>{text("เปลี่ยนรูปโปรไฟล์เรียบร้อยแล้ว", "Profile photo updated")}</span>
          </p>
        )}
      </div>

      {/* Display Name Input */}
      <Field className="space-y-1.5">
        <FieldLabel htmlFor="customer-profile-display-name" className="text-xs font-medium">
          {text("ชื่อที่แสดง", "Display Name")}
        </FieldLabel>
        <Input
          id="customer-profile-display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder={text("ระบุชื่อผู้ใช้งาน", "Enter your display name")}
          disabled={busy}
          className="h-10 text-sm"
        />
      </Field>

      {/* Position Input (When enabled) */}
      {showPosition && (
        <Field className="space-y-1.5">
          <FieldLabel htmlFor="customer-profile-position" className="text-xs font-medium">
            {text("ตำแหน่ง", "Position")}
          </FieldLabel>
          <Input
            id="customer-profile-position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            maxLength={120}
            placeholder={text("ระบุตำแหน่งในบริษัท เช่น กรรมการผู้จัดการ", "Enter company position, e.g. Managing Director")}
            disabled={busy}
            className="h-10 text-sm"
          />
        </Field>
      )}

      {/* Email (Read-only) */}
      <Field className="space-y-1.5">
        <FieldLabel htmlFor="customer-profile-email" className="text-xs font-medium">
          {text("อีเมลเข้าสู่ระบบ", "Login Email")}
        </FieldLabel>
        <Input
          id="customer-profile-email"
          value={user?.email || ""}
          disabled
          readOnly
          className="h-10 text-sm bg-muted/60 text-muted-foreground"
        />
        <p className="text-[11px] text-muted-foreground">
          {text("หากต้องการเปลี่ยนอีเมลบัญชี กรุณาติดต่อผู้ดูแลระบบ", "Contact system administrator to change your login email.")}
        </p>
      </Field>

      {error && <FormErrorSummary>{error}</FormErrorSummary>}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          {text("ยกเลิก", "Cancel")}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy || !name.trim()}
        >
          {busy ? text("กำลังบันทึก…", "Saving…") : text("บันทึกการเปลี่ยนแปลง", "Save Changes")}
        </Button>
      </div>
    </form>
  );

  if (inline) {
    if (!open) return null;
    return (
      <div className="rounded-xl border bg-card p-5 max-w-md">
        <div className="space-y-1 mb-4">
          <h2 className="text-base font-semibold">
            {cropSource
              ? text("จัดตำแหน่งและครอบตัดรูปภาพ", "Crop & Position Photo")
              : text("แก้ไขโปรไฟล์", "Edit Profile")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {cropSource
              ? text("ลากรูปเพื่อจัดตำแหน่ง ปรับซูม แล้วกดยืนยัน", "Drag to position, adjust zoom, then confirm.")
              : text("แก้ไขรูปโปรไฟล์และชื่อที่แสดงของคุณ", "Edit your profile picture and display name")}
          </p>
        </div>
        {cropSource ? cropSection : profileForm}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!busy && !avatarBusy) {
        if (!next) setCropSource(null);
        onOpenChange(next);
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {cropSource
              ? text("จัดตำแหน่งและครอบตัดรูปภาพ", "Crop & Position Photo")
              : text("แก้ไขโปรไฟล์", "Edit Profile")}
          </DialogTitle>
          <DialogDescription>
            {cropSource
              ? text("ลากรูปเพื่อจัดตำแหน่ง ปรับซูม แล้วกดยืนยัน", "Drag to position, adjust zoom, then confirm.")
              : text("แก้ไขรูปโปรไฟล์และชื่อที่แสดงของคุณ", "Edit your profile picture and display name")}
          </DialogDescription>
        </DialogHeader>

        {cropSource ? cropSection : profileForm}
      </DialogContent>
    </Dialog>
  );
}
