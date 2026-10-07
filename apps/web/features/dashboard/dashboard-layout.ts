import {canVisitPage} from '@solar/domain';
export function dashboardLayout(role:string){return {school:role==='school_user',gateway:role!=='owner'&&role!=='school_user',meteredPower:role!=='owner'&&role!=='school_user',alertsLink:canVisitPage(role,'/alerts')};}
