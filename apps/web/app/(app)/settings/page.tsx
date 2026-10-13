'use client';
import Link from 'next/link';
import {ChevronRight,LogOut} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {useSessionUser} from '../../../providers/session-user-provider';
import {useLocale} from '../../../providers/locale-provider';
import {useAuth} from '../../../stores/auth-store';
import {settingsSections} from '../../../components/navigation/settings-sections';
import {Button} from '../../../components/ui/button';
import {CustomerSettingsView} from '../../../features/settings/customer-settings-view';
export default function SettingsPage(){
 const user=useSessionUser(),th=useLocale()==='th',router=useRouter(),{clear}=useAuth();
 async function logout(){try{await fetch('/v1/auth/logout',{method:'POST',credentials:'include'});}finally{clear();router.push('/login');}}
 if(user.role==='customer_user')return <main className="content"><CustomerSettingsView/></main>;
 return <main className="content"><div className="ops-content space-y-6"><header><h1 className="text-2xl font-semibold">{th?'การตั้งค่า':'Settings'}</h1><p className="text-sm text-muted-foreground">{user.displayName} · {user.email}</p></header>{settingsSections(user.role,user.authorization).map(section=><section key={section.key} aria-labelledby={`section-${section.key}`} className="space-y-2"><h2 id={`section-${section.key}`} className="font-semibold">{section.label[th?0:1]}</h2><div className="rounded-xl border bg-card divide-y">{section.items.map(item=><Link key={item.href} href={item.href} className="flex items-center justify-between gap-3 p-4 min-h-11 hover:bg-muted/50"><span>{item.label[th?0:1]}</span><ChevronRight className="size-4 shrink-0" aria-hidden="true"/></Link>)}</div></section>)}<Button variant="outline" onClick={()=>void logout()}><LogOut aria-hidden="true"/>{th?'ออกจากระบบ':'Sign out'}</Button></div></main>;
}
