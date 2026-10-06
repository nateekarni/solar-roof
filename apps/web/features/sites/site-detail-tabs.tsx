"use client";
import type {ReactNode} from 'react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {useLocale} from '../../providers/locale-provider';
import {SiteSchoolUsers} from './site-school-users';
export function SiteDetailTabs({siteId,canManageUsers,children}:{siteId:string;canManageUsers:boolean;children:ReactNode}){
 const th=useLocale()==='th';
 return <Tabs defaultValue="information" className="w-full"><TabsList className="mb-3 w-full justify-start sm:w-auto"><TabsTrigger value="information">{th?'จัดการข้อมูล':'Manage information'}</TabsTrigger>{canManageUsers&&<TabsTrigger value="users">{th?'จัดการผู้ใช้งาน':'Manage users'}</TabsTrigger>}</TabsList><TabsContent value="information" className="flex flex-col gap-4">{children}</TabsContent>{canManageUsers&&<TabsContent value="users"><SiteSchoolUsers siteId={siteId}/></TabsContent>}</Tabs>;
}
