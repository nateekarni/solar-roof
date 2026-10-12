import {GatewayWorkspace} from '../../../features/sites/gateway-workspace';
import {requirePageAccess} from '../../../lib/session-user';
export default async function Page(){await requirePageAccess('/gateways');return <GatewayWorkspace/>;}
