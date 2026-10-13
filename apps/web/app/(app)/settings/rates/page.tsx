import {RateSettingsWorkspace} from '../../../../features/settings/rate-settings-workspace';
import {requirePageAccess} from '../../../../lib/session-user';
export default async function Page(){await requirePageAccess('/settings/rates');return <RateSettingsWorkspace/>;}
