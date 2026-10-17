"use client";
import {useState} from 'react';
import {useAuth} from '../../../../stores/auth-store';
import {useLocale} from '../../../../providers/locale-provider';
import {Card} from '../../../../components/ui/card';
import {Button} from '../../../../components/ui/button';
import {Avatar, AvatarFallback, AvatarImage} from '../../../../components/ui/avatar';
import {CustomerProfileModal} from '../../../../features/settings/customer-profile-modal';
import {OwnPreferences} from '../../../../features/settings/own-preferences';
import {OwnPassword} from '../../../../features/settings/own-password';
import {OwnAuthenticator} from '../../../../features/settings/own-authenticator';
import {OwnSignature} from '../../../../features/settings/own-signature';

export default function AccountSettingsPage(){
 const {user}=useAuth(),th=useLocale()==='th';const [editing,setEditing]=useState(false);
 const initials=user?.displayName?user.displayName.slice(0,2).toUpperCase():'AD';

 return <main className="content"><div className="ops-content w-full space-y-5"><header className="space-y-1"><h1 className="text-2xl font-semibold">{th?'บัญชีของฉัน':'My Account'}</h1><p className="text-sm text-muted-foreground">{th?'ข้อมูลส่วนตัว การแสดงผล และความปลอดภัย':'Personal information, preferences and security'}</p></header>
 <Card className="gap-5 px-5 py-5"><header className="flex items-start justify-between gap-3"><div className="space-y-1"><h2 className="font-semibold">{th?'โปรไฟล์ของคุณ':'Your profile'}</h2><p className="text-sm text-muted-foreground">{th?'รูปและข้อมูลที่ใช้แสดงตัวตนของคุณในระบบ':'Your picture and identity displayed throughout the system'}</p></div><Button variant="outline" onClick={()=>setEditing(true)}>{th?'แก้ไขโปรไฟล์':'Edit profile'}</Button></header>
 <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
  <button type="button" onClick={()=>setEditing(true)} className="relative group cursor-pointer rounded-full" aria-label={th?'เปลี่ยนรูปโปรไฟล์':'Change profile image'}>
   <Avatar className="size-16 border-2 border-background shadow-xs shrink-0">
    {user?.avatarData&&<AvatarImage src={user.avatarData} alt={user.displayName||''}/>}
    <AvatarFallback className="bg-primary text-primary-foreground font-bold text-lg">{initials}</AvatarFallback>
   </Avatar>
  </button>
  <dl className="min-w-0 divide-y text-sm flex-1 w-full">
   {[[th?'ชื่อที่แสดง':'Display name',user?.displayName],[th?'อีเมล':'Email',user?.email],[th?'ตำแหน่ง':'Position',user?.companyPosition||(th?'ยังไม่ได้กำหนดตำแหน่ง':'Not assigned')]].map(([label,value])=><div key={label} className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[140px_1fr]"><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value||(th?'ไม่มีข้อมูล':'Not available')}</dd></div>)}
   <p className="pt-3 text-xs text-muted-foreground">{th?'ติดต่อผู้ดูแลระบบเพื่อเปลี่ยนอีเมลบัญชี':'Contact an administrator to change your account email.'}</p>
  </dl>
 </div>
 </Card>
 <Card className="gap-4 px-5 py-5"><OwnSignature/></Card>
 <Card className="gap-3 px-5 py-5"><header className="space-y-1"><h2 className="font-semibold">{th?'การแสดงผลและความปลอดภัย':'Preferences and security'}</h2><p className="text-sm text-muted-foreground">{th?'เลือกภาษา ธีม และวิธียืนยันตัวตนของบัญชี':'Choose your language, theme and account verification method'}</p></header><div className="text-sm"><OwnPreferences/><OwnPassword/><OwnAuthenticator/></div></Card>
 <Card className="gap-4 px-5 py-5"><header className="space-y-1"><h2 className="font-semibold">{th?'บัญชีที่เชื่อมต่อ':'Connected accounts'}</h2><p className="text-sm text-muted-foreground">{th?'บัญชีภายนอกสำหรับเข้าสู่ระบบ':'External accounts used to sign in'}</p></header><p className="text-sm text-muted-foreground">{th?'ยังไม่มีบัญชีที่เชื่อมต่อ':'No connected accounts'}</p></Card>
 <CustomerProfileModal open={editing} onOpenChange={setEditing} showPosition={true}/>
 </div></main>;
}
