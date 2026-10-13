import { OrganizationDocuments } from '../../../features/organization/organization-documents';
import { getSessionUser } from '../../../lib/session-user';
import { OperationPage } from '../../../features/shared/operation-page';
import type { OperationSearchParams } from '../../../features/shared/operation-request-query';
export const dynamic = 'force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<OperationSearchParams>}) { const user=await getSessionUser(); if(user.role === "customer_user") return <OrganizationDocuments kind="invoice"/>; return <OperationPage resource='billing' eyebrow='BILLING & INVOICES' title='ใบวางบิล' description='ตรวจสอบและจัดการใบวางบิล รอบการเรียกเก็บเงิน ตรวจหลักฐานสลิป และติดตามสถานะการชำระเงิน' action='สร้างใบวางบิลเพิ่มเติม' searchParams={searchParams} />; }
