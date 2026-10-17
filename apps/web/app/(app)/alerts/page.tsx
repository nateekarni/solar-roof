import { OperationPage } from '../../../features/shared/operation-page';
import {
  AlertRulesEditor,
  AlertRuleSettingsButton,
  AlertRuleEmptyState,
} from '../../../features/alerts/alert-rules-editor';
import { AlertsWorkspace } from '../../../features/alerts/alerts-workspace';
import type { OperationSearchParams } from '../../../features/shared/operation-request-query';

export const dynamic = 'force-dynamic';

export default function Page({
  searchParams,
}: {
  searchParams: Promise<OperationSearchParams>;
}) {
  return (
    <AlertsWorkspace
      incidentsContent={
        <AlertRulesEditor>
          <OperationPage
            resource="alerts"
            action=""
            headerActions={<AlertRuleSettingsButton />}
            beforeTable={<AlertRuleEmptyState />}
            searchParams={searchParams}
          />
        </AlertRulesEditor>
      }
    />
  );
}
