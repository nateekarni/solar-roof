"use client";
import {useState} from 'react';
import {useTheme} from 'next-themes';
import {Sun,Moon,Monitor,ChevronDown} from 'lucide-react';
import {useLocale} from '../../providers/locale-provider';
import {useAuth,authStore} from '../../stores/auth-store';
import {apiClient} from '../../lib/api-client';
import {Button} from '../../components/ui/button';
import {ThaiFlag,BritishFlag} from '../../components/navigation/profile-preferences';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuRadioGroup,DropdownMenuRadioItem} from '../../components/ui/dropdown-menu';
export function OwnPreferences(){
 const {user}=useAuth(),locale=useLocale(),{theme,setTheme}=useTheme(),th=locale==='th';
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const currentTheme=user?.preferredTheme??theme??'system';
 const themes=[{value:'light',label:th?'สว่าง':'Light',Icon:Sun},{value:'dark',label:th?'มืด':'Dark',Icon:Moon},{value:'system',label:th?'ตามระบบ':'System',Icon:Monitor}];
 const selectedTheme=themes.find(item=>item.value===currentTheme)??themes[2]!;
 async function save(kind:'language'|'theme',value:string){setBusy(true);setError('');try{
  const prefs=kind==='language'?{preferredLanguage:value as 'th'|'en'}:{preferredTheme:value as 'light'|'dark'|'system'};
  await apiClient.put('/v1/me/preferences',prefs);authStore.updatePreferences(prefs);if(kind==='theme')setTheme(value);
 }catch(e){setError(e instanceof Error?e.message:(th?'บันทึกไม่สำเร็จ':'Unable to save'));}finally{setBusy(false);}}
 return <div className="divide-y">
  <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-4"><span>{th?'ภาษา':'Language'}</span><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy} aria-label={th?'เลือกภาษา':'Choose language'}>{th?<ThaiFlag/>:<BritishFlag/>}{th?'ไทย':'English'}<ChevronDown className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={locale} onValueChange={value=>void save('language',value)}><DropdownMenuRadioItem value="th"><ThaiFlag/>ไทย</DropdownMenuRadioItem><DropdownMenuRadioItem value="en"><BritishFlag/>English</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
  <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-4"><span>{th?'ธีม':'Theme'}</span><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy} aria-label={th?'เลือกธีม':'Choose theme'}><selectedTheme.Icon className="size-4"/>{selectedTheme.label}<ChevronDown className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={currentTheme} onValueChange={value=>void save('theme',value)}>{themes.map(({value,label,Icon})=><DropdownMenuRadioItem key={value} value={value}><Icon className="size-4"/>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
  {error&&<p role="alert" className="py-3 text-sm text-destructive">{error}</p>}
 </div>;
}
