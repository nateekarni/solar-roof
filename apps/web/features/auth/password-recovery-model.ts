import {validateOrganizationPassword} from '../settings/organization-settings-model';
import {loginFactorBody} from './login-factor';
export function passwordResetBody(token:string,password:string,confirm:string,requiresFactor:boolean,recovery:boolean,factor:string,locale:'th'|'en'){
 const invalid=validateOrganizationPassword(password,confirm,locale);if(invalid)throw new Error(invalid);
 return {token,newPassword:password,...(requiresFactor?loginFactorBody(recovery,factor):{})};
}
