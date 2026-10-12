import { OperationPage } from '../../../features/shared/operation-page';
import { AlertRulesEditor,AlertRuleSettingsButton,AlertRuleEmptyState } from '../../../features/alerts/alert-rules-editor';
export const dynamic = 'force-dynamic';
export default function Page() { return <AlertRulesEditor><OperationPage resource='alerts' action='' headerActions={<AlertRuleSettingsButton/>} beforeTable={<AlertRuleEmptyState/>}/></AlertRulesEditor>; }
