"use client";
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useLocale } from '../../providers/locale-provider';
import { SiteCustomerUsers } from './site-customer-users';

export function SiteDetailTabs({
  siteId,
  canManageUsers,
  children,
}: {
  siteId: string;
  canManageUsers: boolean;
  children: ReactNode;
}) {
  const th = useLocale() === 'th';
  if (!canManageUsers) {
    return <div className="flex flex-col gap-4">{children}</div>;
  }
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="mb-3 w-full justify-start sm:w-auto">
        <TabsTrigger value="overview">{th ? 'ข้อมูลไซต์งาน' : 'Site overview'}</TabsTrigger>
        <TabsTrigger value="users">{th ? 'จัดการผู้ใช้งาน' : 'Manage users'}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="flex flex-col gap-4">
        {children}
      </TabsContent>
      <TabsContent value="users">
        <SiteCustomerUsers siteId={siteId} />
      </TabsContent>
    </Tabs>
  );
}
