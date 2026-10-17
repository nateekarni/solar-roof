"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  MoreHorizontal,
  Mail,
  Pencil,
  XCircle,
  UserX,
  UserCheck,
  ShieldAlert,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiClient } from "../../lib/api-client";
import { useLocale } from "../../providers/locale-provider";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { SearchInput } from "../../components/ui/search-input";
import { ChoiceSelect } from "../../components/ui/choice-select";
import { DataTable } from "../../components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { FieldError } from "../../components/ui/field";
import { renderStatusBadge } from "../../lib/status-badge";
import { ConfirmDialog } from "../../components/feedback/confirm-action";

export type CustomerUser = {
  id: string;
  email: string;
  displayName: string;
  phone?: string | null;
  status: string;
  canActivate?: boolean;
  createdAt?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function DiscardConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const th = useLocale() === "th";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(val) => { if (!val) onCancel(); }}
      title={th ? "ละทิ้งการเปลี่ยนแปลง?" : "Discard changes?"}
      description={th ? "ข้อมูลที่คุณกรอกไว้ยังไม่ได้บันทึก หากปิดหน้านี้ข้อมูลจะสูญหาย" : "You have unsaved information. If you close this modal, changes will be lost."}
      cancelLabel={th ? "แก้ไขต่อ" : "Continue editing"}
      confirmLabel={th ? "ละทิ้งข้อมูล" : "Discard"}
      variant="destructive"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function CustomerUserInviteDialog({
  open,
  onClose,
  onSaved,
  siteId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  siteId: string;
}) {
  const th = useLocale() === "th";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const isDirty = Boolean(name.trim() || email.trim() || phone.trim());

  const handleClose = () => {
    if (busy) return;
    if (isDirty) {
      setDiscardOpen(true);
    } else {
      onClose();
    }
  };

  const nameError = showErrors && !name.trim()
    ? (th ? "กรุณากรอกชื่อ-นามสกุล" : "Please provide full name")
    : null;
  const emailError = showErrors && !email.trim()
    ? (th ? "กรุณากรอกอีเมล" : "Please provide email address")
    : showErrors && !EMAIL_REGEX.test(email.trim())
      ? (th ? "รูปแบบอีเมลไม่ถูกต้อง" : "Invalid email address format")
      : null;

  const handleSubmit = async () => {
    setShowErrors(true);
    if (!name.trim()) {
      setError(th ? "กรุณากรอกชื่อ-นามสกุล" : "Please provide full name");
      return;
    }
    if (!email.trim()) {
      setError(th ? "กรุณากรอกอีเมล" : "Please provide email address");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(th ? "รูปแบบอีเมลไม่ถูกต้อง" : "Invalid email address format");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        displayName: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
      };
      await apiClient.post(`/v1/sites/${encodeURIComponent(siteId)}/customer-users`, payload);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              {th ? "เพิ่มผู้ใช้งานลูกค้า" : "Add customer user"}
            </DialogTitle>
            <DialogDescription>
              {th
                ? "ส่งคำเชิญไปยังอีเมลของผู้ใช้งานเพื่อเปิดใช้งานบัญชีสำหรับไซต์งานนี้"
                : "Send an email invitation for the user to activate their account for this site."}
            </DialogDescription>
          </DialogHeader>

          <form noValidate onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col gap-4">
            <div data-slot="dialog-body" className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                {/* Real-time Avatar Preview */}
                <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
                    <span className="text-xl">{name.trim().slice(0, 1) || "?"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-foreground">
                      {name.trim() || (th ? "ผู้ใช้งานใหม่" : "New user")}
                    </p>
                    <p className="mt-0.5 break-all text-sm text-muted-foreground">
                      {email.trim() || (th ? "user@example.com" : "No email provided")}
                    </p>
                    {phone.trim() && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{phone.trim()}</p>
                    )}
                  </div>
                </div>

                {/* Input Fields */}
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start sm:gap-4">
                    <Label htmlFor="customer-user-name" className="text-sm text-muted-foreground sm:pt-2.5" required>
                      {th ? "ชื่อ-นามสกุล" : "Full Name"}
                    </Label>
                    <div className="space-y-1">
                      <Input
                        id="customer-user-name"
                        value={name}
                        required
                        aria-invalid={Boolean(nameError)}
                        placeholder={th ? "เช่น สมชาย ใจดี" : "e.g. Somchai Jaidee"}
                        onChange={(e) => setName(e.target.value)}
                      />
                      {nameError ? <FieldError>{nameError}</FieldError> : null}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start sm:gap-4">
                    <Label htmlFor="customer-user-email" className="text-sm text-muted-foreground sm:pt-2.5" required>
                      {th ? "อีเมล" : "Email"}
                    </Label>
                    <div className="space-y-1">
                      <Input
                        id="customer-user-email"
                        type="email"
                        value={email}
                        required
                        aria-invalid={Boolean(emailError)}
                        placeholder="user@example.com"
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      {emailError ? <FieldError>{emailError}</FieldError> : null}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
                    <Label htmlFor="customer-user-phone" className="text-sm text-muted-foreground">
                      {th ? "เบอร์โทรศัพท์" : "Phone number"}
                    </Label>
                    <Input
                      id="customer-user-phone"
                      type="tel"
                      value={phone}
                      placeholder={th ? "เช่น 0812345678" : "e.g. 0812345678"}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                {/* Fixed Scope Notice */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
                  <p className="font-semibold">{th ? "ขอบเขตสิทธิ์การใช้งาน:" : "Access permission scope:"}</p>
                  <p className="mt-1">
                    {th
                      ? "ผู้ใช้งานนี้จะได้รับสิทธิ์เข้าถึงเฉพาะไซต์งานนี้ สำหรับดูภาพรวม ตรวจสอบเอกสาร และอัปโหลดหลักฐานการชำระเงิน"
                      : "This user is granted access strictly to this site for viewing metrics, checking documents, and uploading payment receipts."}
                  </p>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </fieldset>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
                {th ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={busy}>
                {busy ? (th ? "กำลังส่งคำเชิญ…" : "Sending…") : (th ? "ส่งคำเชิญ" : "Send invitation")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DiscardConfirmDialog
        open={discardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </>
  );
}

function CustomerUserEditDialog({
  user,
  open,
  onClose,
  onSaved,
  siteId,
}: {
  user: CustomerUser;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  siteId: string;
}) {
  const th = useLocale() === "th";
  const [name, setName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const isDirty =
    name.trim() !== user.displayName.trim() ||
    email.trim() !== user.email.trim() ||
    phone.trim() !== (user.phone ?? "").trim();

  const handleClose = () => {
    if (busy) return;
    if (isDirty) {
      setDiscardOpen(true);
    } else {
      onClose();
    }
  };

  const nameError = showErrors && !name.trim()
    ? (th ? "กรุณากรอกชื่อ-นามสกุล" : "Please provide full name")
    : null;
  const emailError = showErrors && !email.trim()
    ? (th ? "กรุณากรอกอีเมล" : "Please provide email address")
    : showErrors && !EMAIL_REGEX.test(email.trim())
      ? (th ? "รูปแบบอีเมลไม่ถูกต้อง" : "Invalid email address format")
      : null;

  const handleSubmit = async () => {
    setShowErrors(true);
    if (!name.trim()) {
      setError(th ? "กรุณากรอกชื่อ-นามสกุล" : "Please provide full name");
      return;
    }
    if (!email.trim()) {
      setError(th ? "กรุณากรอกอีเมล" : "Please provide email address");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(th ? "รูปแบบอีเมลไม่ถูกต้อง" : "Invalid email address format");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        displayName: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
      };
      await apiClient.put(
        `/v1/sites/${encodeURIComponent(siteId)}/customer-users/${user.id}`,
        payload
      );
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-primary" />
              {th ? "แก้ไขข้อมูลผู้ใช้งาน" : "Edit customer user"}
            </DialogTitle>
            <DialogDescription>
              {th
                ? "ปรับปรุงข้อมูลชื่อ-นามสกุล เบอร์โทรศัพท์ และอีเมลของผู้ใช้งาน"
                : "Update display name, contact phone number, and email address."}
            </DialogDescription>
          </DialogHeader>

          <form noValidate onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col gap-4">
            <div data-slot="dialog-body" className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                {/* Real-time Avatar Preview */}
                <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
                    <span className="text-xl">{name.trim().slice(0, 1) || "?"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-foreground">
                      {name.trim() || (th ? "ผู้ใช้งาน" : "User")}
                    </p>
                    <p className="mt-0.5 break-all text-sm text-muted-foreground">
                      {email.trim() || (th ? "ยังไม่ได้ระบุอีเมล" : "No email provided")}
                    </p>
                    {phone.trim() && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{phone.trim()}</p>
                    )}
                  </div>
                </div>

                {/* Input Fields */}
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start sm:gap-4">
                    <Label htmlFor="edit-customer-user-name" className="text-sm text-muted-foreground sm:pt-2.5" required>
                      {th ? "ชื่อ-นามสกุล" : "Full Name"}
                    </Label>
                    <div className="space-y-1">
                      <Input
                        id="edit-customer-user-name"
                        value={name}
                        required
                        aria-invalid={Boolean(nameError)}
                        placeholder={th ? "เช่น สมชาย ใจดี" : "e.g. Somchai Jaidee"}
                        onChange={(e) => setName(e.target.value)}
                      />
                      {nameError ? <FieldError>{nameError}</FieldError> : null}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start sm:gap-4">
                    <Label htmlFor="edit-customer-user-email" className="text-sm text-muted-foreground sm:pt-2.5" required>
                      {th ? "อีเมล" : "Email"}
                    </Label>
                    <div className="space-y-1">
                      <Input
                        id="edit-customer-user-email"
                        type="email"
                        value={email}
                        required
                        aria-invalid={Boolean(emailError)}
                        disabled={user.status === "invited"}
                        placeholder="user@example.com"
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      {emailError ? <FieldError>{emailError}</FieldError> : null}
                      {user.status === "invited" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {th
                            ? "ผู้ใช้ที่อยู่ในสถานะรอตอบรับไม่สามารถเปลี่ยนอีเมลได้ (หากต้องการเปลี่ยน ให้ยกเลิกคำเชิญแล้วส่งใหม่)"
                            : "Email cannot be changed while in invited state. Cancel and re-invite if needed."}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
                    <Label htmlFor="edit-customer-user-phone" className="text-sm text-muted-foreground">
                      {th ? "เบอร์โทรศัพท์" : "Phone number"}
                    </Label>
                    <Input
                      id="edit-customer-user-phone"
                      type="tel"
                      value={phone}
                      placeholder={th ? "เช่น 0812345678" : "e.g. 0812345678"}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </fieldset>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
                {th ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={busy}>
                {busy ? (th ? "กำลังบันทึก…" : "Saving…") : (th ? "บันทึกข้อมูล" : "Save changes")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DiscardConfirmDialog
        open={discardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </>
  );
}

function CancelInviteConfirmDialog({
  user,
  open,
  onClose,
  onConfirm,
}: {
  user: CustomerUser;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const th = useLocale() === "th";
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(val) => { if (!val && !busy) onClose(); }}
      title={<span className="flex items-center gap-2 text-destructive"><XCircle className="size-5" />{th ? "ยกเลิกคำเชิญ?" : "Cancel invitation?"}</span>}
      description={th ? `คุณต้องการยกเลิกคำเชิญของ ${user.displayName} (${user.email}) หรือไม่? ลิงก์คำเชิญเดิมจะไม่สามารถใช้งานได้อีกต่อไป` : `Are you sure you want to cancel the invitation for ${user.displayName} (${user.email})? The existing activation link will be invalidated.`}
      cancelLabel={th ? "กลับ" : "Back"}
      confirmLabel={busy ? (th ? "กำลังยกเลิก…" : "Cancelling…") : (th ? "ยืนยันยกเลิกคำเชิญ" : "Confirm cancel")}
      variant="destructive"
      busy={busy}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        try { await onConfirm(); onClose(); } finally { setBusy(false); }
      }}
    />
  );
}

function DeactivateConfirmDialog({
  user,
  open,
  onClose,
  onConfirm,
}: {
  user: CustomerUser;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const th = useLocale() === "th";
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(val) => { if (!val && !busy) onClose(); }}
      title={<span className="flex items-center gap-2 text-destructive"><UserX className="size-5" />{th ? "ระงับการใช้งานผู้ใช้?" : "Suspend user?"}</span>}
      description={th ? `ผู้ใช้ ${user.displayName} (${user.email}) จะไม่สามารถเข้าสู่ระบบและเข้าถึงไซต์งานนี้ได้ชั่วคราว` : `User ${user.displayName} (${user.email}) will temporarily not be able to log in or access this site.`}
      cancelLabel={th ? "ยกเลิก" : "Cancel"}
      confirmLabel={busy ? (th ? "กำลังระงับ…" : "Suspending…") : (th ? "ระงับการใช้งาน" : "Suspend user")}
      variant="destructive"
      busy={busy}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        try { await onConfirm(); onClose(); } finally { setBusy(false); }
      }}
    />
  );
}

function ReactivateConfirmDialog({
  user,
  open,
  onClose,
  onConfirm,
}: {
  user: CustomerUser;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const th = useLocale() === "th";
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(val) => { if (!val && !busy) onClose(); }}
      title={<span className="flex items-center gap-2 text-primary"><UserCheck className="size-5" />{th ? "เปิดใช้งานผู้ใช้อีกครั้ง?" : "Reactivate user?"}</span>}
      description={th ? `อนุญาตให้ ${user.displayName} (${user.email}) กลับเข้าสู่ระบบและใช้งานข้อมูลไซต์นี้ได้ตามปกติ` : `Allow ${user.displayName} (${user.email}) to log in and access this site normally.`}
      cancelLabel={th ? "ยกเลิก" : "Cancel"}
      confirmLabel={busy ? (th ? "กำลังเปิดใช้งาน…" : "Reactivating…") : (th ? "เปิดใช้งาน" : "Reactivate")}
      variant="default"
      busy={busy}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        try { await onConfirm(); onClose(); } finally { setBusy(false); }
      }}
    />
  );
}

function RevokeConfirmDialog({
  user,
  open,
  onClose,
  onConfirm,
}: {
  user: CustomerUser;
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const th = useLocale() === "th";
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(val) => { if (!val && !busy) onClose(); }}
      title={<span className="flex items-center gap-2 text-destructive"><ShieldAlert className="size-5" />{th ? "ถอนสิทธิ์ออกจากไซต์นี้?" : "Revoke site access?"}</span>}
      description={th ? `ถอนสิทธิ์การเข้าถึงไซต์งานนี้ของ ${user.displayName} (${user.email}) และออกจากระบบทันที โดยระบบยังคงบันทึกประวัติเอกสารและการทำธุรกรรมไว้` : `Revoke site access for ${user.displayName} (${user.email}). All active sessions will be terminated while document and audit history is retained.`}
      cancelLabel={th ? "ยกเลิก" : "Cancel"}
      confirmLabel={busy ? (th ? "กำลังถอนสิทธิ์…" : "Revoking…") : (th ? "ยืนยันถอนสิทธิ์" : "Confirm revoke")}
      variant="destructive"
      busy={busy}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        try { await onConfirm(); onClose(); } finally { setBusy(false); }
      }}
    />
  );
}

export function SiteCustomerUsers({ siteId }: { siteId: string }) {
  const th = useLocale() === "th";
  const base = `/v1/sites/${encodeURIComponent(siteId)}/customer-users`;

  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [inviting, setInviting] = useState(false);
  const [editingUser, setEditingUser] = useState<CustomerUser | null>(null);
  const [cancellingInvite, setCancellingInvite] = useState<CustomerUser | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<CustomerUser | null>(null);
  const [reactivatingUser, setReactivatingUser] = useState<CustomerUser | null>(null);
  const [revokingUser, setRevokingUser] = useState<CustomerUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiClient.get<{ users: CustomerUser[] }>(base);
      setUsers(result.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load users");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResend = async (user: CustomerUser) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const invitation = await apiClient.get<{ invitationId: string }>(
        `/v1/users/invitations?email=${encodeURIComponent(user.email)}`
      );
      const result = await apiClient.post<{ status: string }>(
        `/v1/users/invitations/${invitation.invitationId}/resend`,
        {}
      );
      setMessage(
        result.status === "sent"
          ? th
            ? `ส่งคำเชิญใหม่ไปยัง ${user.email} แล้ว`
            : `Invitation email resent to ${user.email}`
          : th
            ? "คำเชิญถูกส่งแล้ว แต่ยังส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบ SMTP"
            : "Invitation created; email not delivered, check SMTP configuration"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend invitation");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelInvite = async (user: CustomerUser) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiClient.post(`${base}/${user.id}/cancel-invite`, {});
      setMessage(
        th ? `ยกเลิกคำเชิญของ ${user.email} เรียบร้อยแล้ว` : `Invitation for ${user.email} cancelled`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to cancel invitation");
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (user: CustomerUser) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiClient.put(`${base}/${user.id}`, { status: "disabled" });
      setMessage(
        th ? `ระงับการใช้งาน ${user.displayName} เรียบร้อยแล้ว` : `Suspended ${user.displayName}`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to suspend user");
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async (user: CustomerUser) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiClient.put(`${base}/${user.id}`, { status: "active" });
      setMessage(
        th ? `เปิดใช้งาน ${user.displayName} อีกครั้งแล้ว` : `Reactivated ${user.displayName}`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reactivate user");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (user: CustomerUser) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiClient.delete(`${base}/${user.id}`);
      setMessage(
        th
          ? `ถอนสิทธิ์ ${user.displayName} ออกจากไซต์งานแล้ว`
          : `Revoked site access for ${user.displayName}`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to revoke user access");
    } finally {
      setBusy(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !query ||
        u.displayName.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        (u.phone ?? "").toLowerCase().includes(query);

      const matchStatus = statusFilter === "all" || u.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [users, search, statusFilter]);

  const columns: ColumnDef<CustomerUser>[] = useMemo(
    () => [
      {
        accessorKey: "displayName",
        header: th ? "ชื่อผู้ใช้" : "User",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {row.original.displayName.trim().slice(0, 1) || "?"}
            </div>
            <div className="min-w-0">
              <span className="font-medium text-foreground">{row.original.displayName}</span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: th ? "อีเมล" : "Email",
        cell: ({ row }) => (
          <span className="break-all text-sm text-muted-foreground">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "phone",
        header: th ? "เบอร์โทรศัพท์" : "Phone number",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.phone || "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: th ? "สถานะ" : "Status",
        cell: ({ row }) => renderStatusBadge(row.original.status, th ? "th" : "en"),
      },
      {
        id: "actions",
        header: th ? "การจัดการ" : "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={(th ? "การจัดการผู้ใช้: " : "Actions for ") + user.displayName}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {user.status === "invited" && (
                  <>
                    <DropdownMenuItem onSelect={() => setEditingUser(user)}>
                      <Pencil className="mr-2 size-4" />
                      {th ? "แก้ไขข้อมูล" : "Edit details"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void handleResend(user)}>
                      <Mail className="mr-2 size-4" />
                      {th ? "ส่งคำเชิญซ้ำ" : "Resend invitation"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setCancellingInvite(user)}
                    >
                      <XCircle className="mr-2 size-4" />
                      {th ? "ยกเลิกการเชิญ" : "Cancel invitation"}
                    </DropdownMenuItem>
                  </>
                )}

                {user.status === "active" && (
                  <>
                    <DropdownMenuItem onSelect={() => setEditingUser(user)}>
                      <Pencil className="mr-2 size-4" />
                      {th ? "แก้ไขข้อมูล" : "Edit details"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeactivatingUser(user)}
                    >
                      <UserX className="mr-2 size-4" />
                      {th ? "ระงับการใช้งาน" : "Suspend user"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setRevokingUser(user)}
                    >
                      <ShieldAlert className="mr-2 size-4" />
                      {th ? "ถอนสิทธิ์ออกจากไซต์นี้" : "Revoke site access"}
                    </DropdownMenuItem>
                  </>
                )}

                {user.status === "disabled" && (
                  <>
                    <DropdownMenuItem onSelect={() => setReactivatingUser(user)}>
                      <UserCheck className="mr-2 size-4" />
                      {th ? "เปิดใช้งานอีกครั้ง" : "Reactivate user"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setRevokingUser(user)}
                    >
                      <ShieldAlert className="mr-2 size-4" />
                      {th ? "ถอนสิทธิ์ออกจากไซต์นี้" : "Revoke site access"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [th, busy]
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Users className="size-5 text-primary" />
          <span>{th ? "ผู้ใช้งานของไซต์งาน" : "Site Users"}</span>
        </h2>
        <Button
          type="button"
          className="shrink-0"
          onClick={() => setInviting(true)}
          disabled={busy}
        >
          <UserPlus className="mr-2 size-4" />
          {th ? "เพิ่มผู้ใช้" : "Add user"}
        </Button>
      </div>

      <div className="space-y-4">
        {error && (
          <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            {message}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput
            className="w-full sm:max-w-xs"
            aria-label={th ? "ค้นหาผู้ใช้งาน" : "Search users"}
            placeholder={th ? "ค้นหาชื่อ อีเมล หรือเบอร์โทร…" : "Search name, email, or phone…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <ChoiceSelect
            className="w-full sm:w-[180px]"
            aria-label={th ? "สถานะผู้ใช้งาน" : "User status"}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{th ? "ทุกสถานะ" : "All statuses"}</option>
            <option value="active">{th ? "ใช้งานอยู่" : "Active"}</option>
            <option value="invited">{th ? "รอการตอบรับ" : "Invited"}</option>
            <option value="disabled">{th ? "ถูกระงับ" : "Disabled"}</option>
          </ChoiceSelect>
        </div>

        {loading ? (
          <div role="status" className="py-8 text-center text-sm text-muted-foreground">
            {th ? "กำลังโหลดข้อมูลผู้ใช้…" : "Loading users…"}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredUsers}
            getRowId={(row) => row.id}
            hideSearch
          />
        )}
      </div>

      {/* Modals & Dialogs */}
      {inviting && (
        <CustomerUserInviteDialog
          open={inviting}
          siteId={siteId}
          onClose={() => setInviting(false)}
          onSaved={load}
        />
      )}

      {editingUser && (
        <CustomerUserEditDialog
          open={Boolean(editingUser)}
          user={editingUser}
          siteId={siteId}
          onClose={() => setEditingUser(null)}
          onSaved={load}
        />
      )}

      {cancellingInvite && (
        <CancelInviteConfirmDialog
          open={Boolean(cancellingInvite)}
          user={cancellingInvite}
          onClose={() => setCancellingInvite(null)}
          onConfirm={() => handleCancelInvite(cancellingInvite)}
        />
      )}

      {deactivatingUser && (
        <DeactivateConfirmDialog
          open={Boolean(deactivatingUser)}
          user={deactivatingUser}
          onClose={() => setDeactivatingUser(null)}
          onConfirm={() => handleDeactivate(deactivatingUser)}
        />
      )}

      {reactivatingUser && (
        <ReactivateConfirmDialog
          open={Boolean(reactivatingUser)}
          user={reactivatingUser}
          onClose={() => setReactivatingUser(null)}
          onConfirm={() => handleReactivate(reactivatingUser)}
        />
      )}

      {revokingUser && (
        <RevokeConfirmDialog
          open={Boolean(revokingUser)}
          user={revokingUser}
          onClose={() => setRevokingUser(null)}
          onConfirm={() => handleRevoke(revokingUser)}
        />
      )}
    </div>
  );
}
