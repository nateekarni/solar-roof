import type {ReactNode} from 'react';
export function ResponsiveDocumentRows({role,resource,mobile,desktop}:{role:string;resource:string;mobile:ReactNode;desktop:ReactNode}) {
 const businessFinancial=['owner','school_user'].includes(role)&&['billing','contracts','documents','receipts'].includes(resource);
 if(!businessFinancial)return desktop;
 return <><div className="min-w-0 md:hidden">{mobile}</div><div className="hidden md:block min-w-0">{desktop}</div></>;
}
