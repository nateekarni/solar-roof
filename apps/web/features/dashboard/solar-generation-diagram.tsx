'use client';
import {useScopedPowerFlow} from './use-scoped-power-flow';

import {generationTotal,type GenerationSite} from './generation-readings';
import {GenerationSiteList} from './generation-site-list';
import {SolarPowerDiagramView} from './solar-power-diagram-view';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
/** PV comes only from the explicit canonical solar logger reading. Load and grid remain unknown.
 * Generic billing-meter active power and energy deltas must never populate this scene. */
export function SolarGenerationDiagram({locale,siteId}:{locale:'th'|'en';siteId?:string|undefined}) {
 const {sites,error,now}=useScopedPowerFlow<GenerationSite>(siteId);
 const generation=generationTotal(sites,now);
 const th=locale==='th';

 return <Card className="panel mb-4"><CardHeader className="p-0 pb-4"><CardTitle className="text-sm">{th?'พลังงานโซลาร์และอาคาร':'Solar and building power'}</CardTitle></CardHeader><CardContent className="p-0">{error&&<p role="alert" className="mb-3 text-center text-sm text-destructive">{th?'ไม่สามารถโหลดข้อมูลพลังงาน':'Unable to load power data'}</p>}<SolarPowerDiagramView locale={locale} measurements={{generationKw:generation,buildingLoadKw:null,solarToBuildingKw:null,gridImportKw:null,gridExportKw:null}}/>{!siteId&&sites&&sites.length>0&&<GenerationSiteList sites={sites} now={now} locale={locale}/>}</CardContent></Card>;
}
