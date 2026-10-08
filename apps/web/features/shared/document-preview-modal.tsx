"use client";
import * as React from 'react';
import {SavedOriginalDocumentPreview} from './saved-original-document-preview';
import {HandoverPreviewModal} from './handover-preview-modal';
export type DocumentType = "contract" | "invoice" | "receipt" | "settlement" | "handover";
export interface RateScheduleItem { startDate: string; endDate?: string; rate: number; }
export interface DocumentPreviewData {
  type: DocumentType; id?: string; documentId?: string; siteId?: string; billingCycleId?: string;
  title?: string; documentNumber?: string; schoolName?: string; siteName?: string; period?: string;
  issueDate?: string; dueDate?: string; consumedKwh?: number | string; rate?: number | string;
  amount?: number | string; status?: string; signers?: string; version?: string; capacityMwp?: number | string;
  taxId?: string; taxBranch?: string; taxAddress?: string; taxEmail?: string; taxPhone?: string;
  rates?: RateScheduleItem[]; termYears?: number; paymentMethod?: string; paidAt?: string; slipRef?: string;
  solarProducedKwh?: number; gridReplacedPercent?: number; co2SavedKg?: number; treesEquivalent?: number;
  gridSavingsThb?: number; peakPowerKw?: number; codDate?: string; gatewaySerial?: string;
  meterSerial?: string; inverterModel?: string; inverterSerial?: string; panelModel?: string;
}

export function DocumentPreviewModal(props:{open:boolean;onOpenChange:(open:boolean)=>void;data:DocumentPreviewData|null}) {
 if(!props.data)return null;
 if(props.data.type==='handover')return <HandoverPreviewModal open={props.open} onOpenChange={props.onOpenChange} data={props.data}/>;
 return <SavedOriginalDocumentPreview key={`${props.data.type}:${props.data.id}:${props.data.documentId}`} open={props.open} onOpenChange={props.onOpenChange} source={props.data}/>;
}
