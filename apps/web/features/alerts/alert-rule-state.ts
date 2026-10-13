export function alertRuleState(loaded:boolean,rules:{enabled:boolean}[]){return !loaded?'loading':!rules.length?'unconfigured':rules.some(rule=>rule.enabled)?'active':'disabled';}
