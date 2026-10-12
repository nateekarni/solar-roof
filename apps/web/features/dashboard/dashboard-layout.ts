import {canVisitPage} from '@solar/domain';
export function dashboardLayout(role:string){return {customer:role==='customer_user',gateway:role!=='owner'&&role!=='customer_user',meteredPower:role!=='owner'&&role!=='customer_user',alertsLink:canVisitPage(role,'/alerts')};}
