"use client";
import Link from 'next/link';
import {useState} from 'react';
import {useAuth} from '../../../../stores/auth-store';
import {useLocale} from '../../../../providers/locale-provider';
import {Card} from '../../../../components/ui/card';
import {Button} from '../../../../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../../../components/ui/dialog';
import {OwnAvatar} from '../../../../features/settings/own-avatar';
import {OwnProfileForm} from '../../../../features/settings/own-profile-form';
import {OwnPreferences} from '../../../../features/settings/own-preferences';
import {OwnPassword} from '../../../../features/settings/own-password';
import {OwnAuthenticator} from '../../../../features/settings/own-authenticator';
import {OwnSignature} from '../../../../features/settings/own-signature';
import {accountRoleLabel} from '../../../../features/settings/account-presentation';
export default function AccountSettingsPage(){
 const {user}=useAuth(),th=useLocale()==='th';const [editing,setEditing]=useState(false);
 return <main className="content"><div className="ops-content w-full space-y-5"><Link href="/settings" className="text-sm text-primary">{th?'กลับไปการตั้งค่า':'Back to settings'}</Link><header className="space-y-2"><h1 className="text-2xl font-semibold">{th?'บัญชีของฉัน':'My Account'}</h1><p className="text-sm text-muted-foreground">{th?'ข้อมูลส่วนตัว การแสดงผล และความปลอดภัย':'Personal information, preferences and security'}</p></header>
 <Card className="gap-5 px-5 py-5"><header className="flex items-start justify-between gap-3"><div className="space-y-1"><h2 className="font-semibold">{th?'โปรไฟล์ของคุณ':'Your profile'}</h2><p className="text-sm text-muted-foreground">{th?'รูปและข้อมูลที่ใช้แสดงตัวตนของคุณในระบบ':'Your picture and identity displayed throughout the system'}</p></div><Button variant="outline" onClick={()=>setEditing(true)}>{th?'แก้ไขโปรไฟล์':'Edit profile'}</Button></header><div className="grid items-start gap-6 sm:grid-cols-[auto_1fr]"><OwnAvatar/><dl className="min-w-0 divide-y text-sm">{[[th?'ชื่อที่แสดง':'Display name',user?.displayName],[th?'อีเมล':'Email',user?.email],[th?'ตำแหน่ง':'Position',user?.companyPosition||(th?'ยังไม่ได้กำหนดตำแหน่ง':'Not assigned')]].map(([label,value])=><div key={label} className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[140px_1fr]"><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value||(th?'ไม่มีข้อมูล':'Not available')}</dd></div>)}<p className="pt-3 text-xs text-muted-foreground">{th?'ติดต่อผู้ดูแลระบบเพื่อเปลี่ยนอีเมลบัญชี':'Contact an administrator to change your account email.'}</p></dl></div></Card>
 <Card className="gap-4 px-5 py-5"><OwnSignature/></Card>
 <Card className="gap-3 px-5 py-5"><header className="space-y-1"><h2 className="font-semibold">{th?'การแสดงผลและความปลอดภัย':'Preferences and security'}</h2><p className="text-sm text-muted-foreground">{th?'เลือกภาษา ธีม และวิธียืนยันตัวตนของบัญชี':'Choose your language, theme and account verification method'}</p></header><div className="text-sm"><OwnPreferences/><OwnPassword/><OwnAuthenticator/></div></Card>
 <Card className="gap-4 px-5 py-5"><header className="space-y-1"><h2 className="font-semibold">{th?'บัญชีที่เชื่อมต่อ':'Connected accounts'}</h2><p className="text-sm text-muted-foreground">{th?'บัญชีภายนอกสำหรับเข้าสู่ระบบ':'External accounts used to sign in'}</p></header><p className="text-sm text-muted-foreground">{th?'ยังไม่มีบัญชีที่เชื่อมต่อ':'No connected accounts'}</p></Card>
 <Dialog open={editing} onOpenChange={setEditing}><DialogContent><DialogHeader><DialogTitle>{th?'แก้ไขโปรไฟล์':'Edit profile'}</DialogTitle><DialogDescription>{th?'แก้ไขชื่อและตำแหน่งของคุณ รูปโปรไฟล์เปลี่ยนได้จากรูปในการ์ด':'Edit your display name and position. Change your picture from the profile card.'}</DialogDescription></DialogHeader><OwnProfileForm/></DialogContent></Dialog>
 </div></main>;
}
