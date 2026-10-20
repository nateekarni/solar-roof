export { normalizePaymentMetadata } from './payments.js';
export { buildPromptPayPayload, normalizePromptPayId } from './promptpay.js';
export type { NormalizedPromptPayId } from './promptpay.js';
export type { CustomerPortalRange, CustomerBillingStatus, CustomerPortalBill, CustomerPortalHomeResponse, CustomerPaymentInstructions } from './customer-portal.js';
export type {
  GatewayControlKind, GatewayConfigApplyStatus, GatewayLifecycleState, GatewayConfigState,
  GatewayConnectionState, GatewayJsonValue, GatewayRegisterMapping, GatewayReportedDevice,
  GatewayDeviceConfig, GatewayEnabledDeviceConfig, GatewayDisabledDeviceConfig, GatewayDisabledRegisterMapping,
  GatewayRegisterPayload, GatewayConfigPayload, GatewayConfigUpdatePayload,
  GatewayConfigStatusPayload, GatewayStatusPayload, GatewayControlPayloads, DiscoveredGatewayDetail,
  ConfirmGatewayRequest, ConfirmGatewayResponse, GatewaySyncState, GatewayConfigProposal, ApproveGatewayProposalRequest,
  AdoptExistingGatewayRequest,GatewayBillingContinuityProof,CorrectInitialGatewayConfigRequest,
} from './gateway-control.js';
export {applyGatewayRegisterPresetMappings,gatewayConnectionIssue,gatewayRegisterIdentity,gatewayRegisterMappingCollectionIssue,gatewayRegisterMappingIssue,gatewayRegisterMappingValueIssue,GATEWAY_REGISTER_BYTE_ORDERS,GATEWAY_REGISTER_DATA_TYPES,GATEWAY_REGISTER_WORD_ORDERS} from './gateway-control.js';
export type {GatewayConnectionIssue,GatewayRegisterMappingCollectionIssue,GatewayRegisterMappingIssue,GatewayRegisterPresetApplyResult} from './gateway-control.js';
export type {FinancialInsights,DashboardSiteContext,MaintenanceInsights} from './dashboard-insights.js';
export type { CashPaymentResult, CashPaymentSubmission, PaymentMetadata, PaymentMethod, PaymentSubmission, PaymentTransferRow, TransferChannel } from './payments.js';
export type { OperationQuery, OperationPage, OperationRow, OperationFacets, BillingStatusView, BillingRow, CashPaymentEntry, BillingReplacementProposal, IssuancePreview, IssuancePreviewResponse, OperationAction, PersistedDocumentRow } from './operations.js';
export type { PendingIssuanceStatus, IssuanceLabel, IssuanceApprovalRequest, IssuanceApprovalResult, IssuanceApprovalBatch } from './operations.js';
export { operationFilters } from './operation-filters.js';
export type { OperationFilter } from './operation-filters.js';

export interface ApiEnvelope<T> {
  data: T;
  traceId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardSummaryParams {
  site_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface DashboardEnergy {
  observedKwh:number|null;
  quality:'complete'|'partial'|'unavailable';
  completeSites:number;
  partialSites:number;
  unavailableSites:number;
}
export interface DashboardSummaryStats {
  energy?:DashboardEnergy;
  totalSites: number;
  onlineSites: number;
  installedMwp: number;
  currentMw: number | null;
  periodKwh: number | null;
  periodAmount: number;
  billCount: number;
  paidBillCount: number;
}

/** IDs are internal UUID references; external fields are registered operational codes. */
export interface DashboardSummarySite {
  sourceFingerprint?:string|null;
  energy?:DashboardEnergy;
  externalSiteId?: string | null;
  externalGatewayId?: string | null;
  gatewayId?: string | null;
  gatewayName?: string | null;
  lastUpdated?: string | null;
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  capacityMwp: number;
  customerName: string;
  productionKwh: number | null;
}

export interface DashboardSummaryDataPoint {
  date: string;
  value: number|null;
  observedValue?:number|null;
  watermark?:string|null;
  quality?: string;
}

export interface DashboardSummaryAlert {
  id?: string;
  title: string;
  detail: string;
  severity: string;
  status: string;
  occurred_at: string;
  siteName?: string;
  destination?: string;
  kind?: string;
}

export interface DashboardSummaryCollection {
  statuses?:{key:string;amount:string;count:number}[];
  total: number;
  paid: number;
  pending: number;
  unbilled?: number;
  paidPercent: number;
}

export interface DashboardCompareItem {
  externalSiteId?: string | null;
  siteId: string;
  site: string;
  value: number | null;
}

export interface DashboardSummaryResponse {
  periodInvoices?:DashboardPeriodInvoices;
  cashReceivedDaily?:DashboardSummaryDataPoint[];
  capabilities?:{business:boolean;technical:boolean};
  financialInsights?:import('./dashboard-insights.js').FinancialInsights|null;
  selectedSite?:import('./dashboard-insights.js').DashboardSiteContext|null;
  maintenanceInsights?:import('./dashboard-insights.js').MaintenanceInsights|null;
  availableMapSites?: Pick<DashboardSummarySite,'id'|'externalSiteId'|'name'|'customerName'|'latitude'|'longitude'>[];
  alertActiveCount?: number;
  energyReadModel?: {enabled:boolean;status:'preparing'|'ready';watermark:string|null};
  range: {start: string; end: string};
  availableSites: {id: string; externalSiteId?: string | null; name: string}[];
  sites: DashboardSummarySite[];
  stats: DashboardSummaryStats;
  production: DashboardSummaryDataPoint[];
  revenue: DashboardSummaryDataPoint[];
  rankings: { name: string; productionKwh: number }[];
  alerts: DashboardSummaryAlert[];
  collection: DashboardSummaryCollection;
}
export interface DashboardComparison {
 range:{start:string;end:string};
 sites:{siteId:string;site:string;installedMwp:number;generatedKwh:number|null;production:DashboardSummaryDataPoint[];finance:Pick<import('./dashboard-insights.js').FinancialInsights,'cohortBilled'|'cohortCollected'|'cohortOutstanding'|'collectionStatuses'|'asOf'>|null;financialDaily:DashboardSummaryDataPoint[];context:import('./dashboard-insights.js').DashboardSiteContext|null}[];
}
export interface DashboardPeriodInvoices {
 items:{id:string;siteId:string;siteName:string;invoiceId?:string;invoiceNumber?:string;periodStart:string;dueDate:string|null;amount:string;approved:string;remaining:string;status:string}[];
 total:number;
 hasMore:boolean;
}
export interface DashboardDayResponse {
 date:string;
 sites:{siteId:string;name:string;energy:DashboardEnergy;watermark:string|null;points:{timestamp:string;value:number|null;quality:string}[]}[];
}

export type { FinancialAction, Capabilities } from './capabilities.js';
export type { FinancialScope, ReadinessResponsibility, FinancialReadinessItem, FinancialReadinessStatus, FinancialReadinessContext } from './financial-readiness.js';
export type { JobRecord, JobStatus } from './jobs.js';
export type {ArchiveManifest,HistoryRestoreRequest,HistoryRestoreAccepted} from './history.js';

export interface DiscoveredGatewayRow {
  id: string;
  externalGatewayId: string;
  reportedSiteId?: string | null;
  reportedDeviceId?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  profileId?: string | null;
  protocol?: string | null;
  status: 'unassigned' | 'assigned' | 'ignored';
  assignedSiteId?: string | null;
  assignedGatewayId?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  rawPayload: Record<string, unknown>;
}
