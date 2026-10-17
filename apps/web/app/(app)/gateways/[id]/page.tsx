import { GatewayDetailPageView } from '../../../../features/sites/gateway-detail-page-view';
import { requirePageAccess } from '../../../../lib/session-user';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePageAccess('/gateways');
  return <GatewayDetailPageView gatewayId={id} />;
}
