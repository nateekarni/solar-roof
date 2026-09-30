"use client";
import Link from 'next/link';
import { useAuth } from '../../../../stores/auth-store';
import { useLocale } from '../../../../providers/locale-provider';
import { Card } from '../../../../components/ui/card';
import { EmailVerification } from '../../../../features/settings/email-verification';
export default function AccountSettingsPage() {
 const {user}=useAuth();const th=useLocale()==='th';
 return <main className="content"><div className="ops-content max-w-3xl space-y-4"><Link href="/settings" className="text-sm text-primary">{th?'กลับไปการตั้งค่า':'Back to settings'}</Link>
 <h1 className="text-xl font-bold">{th?'ข้อมูลบัญชี':'Account details'}</h1>
 <Card className="panel p-4"><dl className="space-y-4 text-sm">{[[th?'ชื่อที่แสดง':'Display name',user?.displayName],[th?'อีเมล':'Email',user?.email],[th?'บทบาท':'Role',user?.role]].map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value || (th?'ไม่มีข้อมูล':'Not available')}</dd></div>)}</dl>
 <p className="mt-5 text-xs text-muted-foreground">{th?'ข้อมูลจากบัญชีผู้ใช้งาน ติดต่อผู้ดูแลระบบเพื่อแก้ไขข้อมูลบัญชี':'These are your saved account details. Contact an administrator to update your account.'}</p></Card><EmailVerification/></div></main>;
}
