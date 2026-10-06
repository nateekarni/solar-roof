'use client';
import {useEffect,useState} from 'react';
import {useTheme} from 'next-themes';
import {useLocale,useSetLocale} from '../../providers/locale-provider';
import {useAuth} from '../../stores/auth-store';
import {apiClient} from '../../lib/api-client';
import {Card,CardHeader,CardTitle,CardContent} from '../../components/ui/card';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '../../components/ui/select';
import {Label} from '../../components/ui/label';
export function GeneralPreferences(){
 const locale=useLocale(),setLocale=useSetLocale();
 const {theme,setTheme}=useTheme();
 const {updatePreferences}=useAuth();
 const [mounted,setMounted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>setMounted(true),[]);
 const text=(th:string,en:string)=>locale==='th'?th:en;
 async function changeTheme(value:string){
  setBusy(true);setError('');
  try{await apiClient.put('/v1/me/preferences',{preferredTheme:value});updatePreferences({preferredTheme:value as 'light'|'dark'|'system'});setTheme(value);}
  catch{setError(text('บันทึกธีมไม่สำเร็จ กรุณาลองใหม่','Could not save theme. Please try again.'));}
  finally{setBusy(false);}
 }
 return <main className="content"><div className="ops-content flex w-full flex-col gap-4"><h1 className="text-2xl font-bold">{text('การแสดงผล','Preferences')}</h1><Card><CardHeader><CardTitle>{text('ภาษาและธีม','Language and theme')}</CardTitle></CardHeader><CardContent className="flex flex-col gap-6"><div className="flex max-w-sm flex-col gap-2"><Label htmlFor="preferences-language">{text('ภาษา','Language')}</Label><Select value={locale} onValueChange={value=>void setLocale(value as 'th'|'en')}><SelectTrigger id="preferences-language" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="th">ภาษาไทย</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></div><div className="flex max-w-sm flex-col gap-2"><Label htmlFor="preferences-theme">{text('ธีม','Theme')}</Label><Select value={mounted?theme??'system':'system'} disabled={!mounted||busy} onValueChange={value=>void changeTheme(value)}><SelectTrigger id="preferences-theme" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="system">{text('ตามระบบ','System')}</SelectItem><SelectItem value="light">{text('สว่าง','Light')}</SelectItem><SelectItem value="dark">{text('มืด','Dark')}</SelectItem></SelectContent></Select></div>{error&&<p role="alert" className="text-destructive">{error}</p>}</CardContent></Card></div></main>;
}
