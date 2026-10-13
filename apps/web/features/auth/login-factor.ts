export function loginFactorBody(recovery:boolean,value:string):{secondFactorCode?:string;recoveryCode?:string}{
 const code=value.trim();if(recovery?!code:!/^\d{6}$/.test(code))throw new Error('Invalid verification code');
 return recovery?{recoveryCode:code}:{secondFactorCode:code};
}
