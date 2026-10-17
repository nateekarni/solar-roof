import type {FinancialReadinessItem, FinancialReadinessStatus} from '@solar/api-contracts';

type Locale = 'th'|'en';
export interface ReadinessStep {
  key: string;
  title: string;
  description: string;
  destination: string|null;
  items: Array<Omit<FinancialReadinessItem,'destination'> & {label:string; destination:string|null}>;
  totalSites?: number;
  readySites?: number;
  pendingSitesCount?: number;
}

const labels: Record<string, readonly [string,string]> = {
  'company.logo':['โลโก้บริษัท','Company logo'],
  'company.name':['ชื่อบริษัท','Company name'],
  'company.tax_id':['เลขประจำตัวผู้เสียภาษี','Tax ID'],
  'company.branch':['สาขา','Branch'],
  'company.address':['ที่อยู่บริษัท','Company address'],
  'company.phone':['โทรศัพท์บริษัท','Company phone'],
  'company.email':['อีเมลบริษัท','Company email'],
  'company.default_bank':['บัญชีธนาคารหลัก','Default bank account'],
  'approval.confirmation':['การยืนยันโดยเจ้าของ','Owner confirmation'],
  'environment.financial_writes':['เปิดใช้งานธุรกรรมการเงิน','Financial writes activation'],
  'environment.smtp':['การส่งเอกสารทางอีเมล','Email delivery'],
  'environment.scheduler':['การวางบิลอัตโนมัติ','Automatic billing'],
  'site.customer':['ข้อมูลลูกค้าสำหรับเอกสาร','Customer document information'],
  'site.service':['วันเริ่มบริการและกำหนดชำระ','Service start and payment terms'],
  'site.tax':['การยืนยันภาษี','Confirmed tax settings'],
  'site.recipient':['ผู้รับเอกสารที่ยืนยันแล้ว','Verified document recipients'],
  'site.rate':['อัตราค่าไฟ','Tariffs'],
  'site.meter':['มิเตอร์สำหรับวางบิล','Billing meter'],
  'site.binding':['การเชื่อมข้อมูลมิเตอร์','Meter data binding'],
  'site.boundary_readings':['ค่ามิเตอร์ ณ ขอบเขตรอบบิล','Billing boundary readings'],
};
const anchors:Record<string,string> = {
  'company.logo':'company-logoUrl','company.name':'company-companyName','company.tax_id':'company-taxId',
  'company.branch':'company-branch','company.address':'company-address','company.phone':'company-phone',
  'company.email':'company-email','company.default_bank':'company-bank-accounts',
};

/** Missing steps follow their setup destinations; identifiers stay in navigation, never copy. */
export function groupMissingReadiness(status:FinancialReadinessStatus,locale:Locale):ReadinessStep[] {
  const th=locale==='th';
  const groups=new Map<string,ReadinessStep>();

  const allSiteIds = new Set(status.items.filter(i => i.siteId).map(i => i.siteId!));
  const pendingSiteIds = new Set(status.items.filter(i => i.siteId && !i.ready).map(i => i.siteId!));
  const totalSites = allSiteIds.size;
  const pendingSitesCount = pendingSiteIds.size;
  const readySites = Math.max(0, totalSites - pendingSitesCount);

  for(const item of status.items) {
    if(item.ready)continue;
    const key=item.id==='approval.confirmation'?'owner-confirmation':item.siteId?'sites':item.id.startsWith('company.')?'company':item.responsibility==='environment'?'environment':item.responsibility==='technical'?'technical':'owner';
    const destination=key==='company'?'/settings/company':item.siteId?`/records/sites/${encodeURIComponent(item.siteId)}`:null;
    let step=groups.get(key);
    if(!step) {
      const copy=key==='company'?[th?'ข้อมูลบริษัทและบัญชีธนาคาร':'Company and bank information',th?'เติมข้อมูลที่ยังขาดสำหรับเอกสารและการรับชำระ':'Complete missing company details for documents and payments.']
        :key==='owner-confirmation'?[th?'การยืนยันโดยเจ้าของ':'Owner confirmation',th?'ตรวจสอบและยืนยันข้อมูลบริษัทที่บันทึกแล้ว':'Review and confirm the saved company information.']
        :key==='sites'?[
            th?'ความพร้อมของไซต์งาน':'Site readiness',
            totalSites > 1
              ? (th ? `พร้อมแล้ว ${readySites} จาก ${totalSites} ไซต์งาน (ยังขาดข้อมูลอีก ${pendingSitesCount} ไซต์งาน)` : `${readySites} of ${totalSites} sites ready (${pendingSitesCount} pending requirements)`)
              : (th ? 'ตรวจสอบข้อมูลธุรกิจและมิเตอร์ของไซต์งาน' : 'Review the site’s business and meter requirements.')
          ]
        :key==='environment'?[th?'ระบบการเงินและการส่งเอกสาร':'Finance and delivery services',th?'ให้ผู้ดูแลระบบที่ติดตั้งตรวจสอบการเปิดใช้งาน':'Ask the deployment administrator to check activation.']
        :key==='technical'?[th?'การตรวจสอบโดยทีมเทคนิค':'Technical checks',th?'ให้ทีมเทคนิคตรวจสอบข้อมูลที่ยังขาด':'Ask the technical team to review the missing requirements.']
        :[th?'ข้อมูลที่เจ้าของต้องตรวจสอบ':'Owner review',th?'ให้เจ้าของตรวจสอบข้อมูลที่ยังขาด':'Ask the Owner to review the missing requirements.'];
      step={key,title:copy[0]!,description:copy[1]!,destination,items:[],totalSites,readySites,pendingSitesCount};
      groups.set(key,step);
    }
    const itemDestination=item.responsibility==='owner'&&item.siteId
      ?`/records/sites/${encodeURIComponent(item.siteId)}`
      :item.responsibility==='owner'&&destination&&item.id!=='approval.confirmation'
      ?`${destination}${key==='company'&&anchors[item.id]?`#${anchors[item.id]}`:''}`:null;
    step.items.push({...item,label:labels[item.id]?.[th?0:1]??(th?'รายการที่ต้องตรวจสอบ':'Readiness requirement'),destination:itemDestination});
  }
  const order=(key:string)=>key==='company'?0:key==='owner-confirmation'?1:key==='sites'||key.startsWith('site:')?2:key==='environment'?3:key==='technical'?4:5;
  return [...groups.values()].sort((a,b)=>order(a.key)-order(b.key)||a.key.localeCompare(b.key));
}

