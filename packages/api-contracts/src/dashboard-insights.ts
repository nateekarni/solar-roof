export interface FinancialInsights {
 cohortOldestOverdueDays?:number;
 collectionStatuses?:{key:string;amount:string;count:number}[];
 cohortAging?:{key:string;amount:string;count:number}[];
 asOf:string;cashReceived:string;cohortBilled:string;cohortCollected:string;cohortOutstanding:string;outstanding:string;overdue:string;awaitingPayment:string;settledCount:number;pendingReviewCount:number;
 aging:{key:string;amount:string;count:number}[];
 workQueue:{id:string;siteId:string;siteName:string;invoiceId?:string;invoiceNumber?:string;dueDate:string|null;daysOverdue:number;remaining:string;pendingReview:number}[];
}
export interface DashboardSiteContext {
 id:string;name:string;code:string|null;customerName:string;capacityMwp:string;status:string;region:string|null;gateway:null|{id:string;name:string;code:string|null;protocol:string;topic:string;lastSeenAt:string|null;interval:number;brokerName:string|null;configurationState?:string};
 devices:{id:string;name:string;model:string|null;code:string|null;profileVersion:string|null;interval:number;lastReceivedAt:string|null;lastMeasuredAt:string|null;billingSource:boolean}[];
 business?:{serviceStartDate:string;paymentTermDays:number;taxRate:string;remindersEnabled:boolean;reminderStartDays:number|null;reminderIntervalDays:number|null;rate:string|null;rateFrom:string|null};
}
export interface MaintenanceInsights {
 gateways:number;staleGateways:number;devices:number;staleDevices:number;pendingConfigurations:number;rejectedMessages:number;comparisonWarnings:number;
 attention:{gatewayId:string;gatewayName:string;siteName:string;lastSeenAt:string|null;pendingConfiguration:boolean;staleDevices:number}[];
}
