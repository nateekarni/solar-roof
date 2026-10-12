import {BadRequestException,Body,Controller,Get,HttpCode,Inject,Post,Req,Res,UnauthorizedException} from '@nestjs/common';
import type {Request,Response} from 'express';
import {TwoFactorService} from './two-factor.service.js';
type OwnRequest=Request&{user?:{id:string}};
function own(req:OwnRequest):string{if(!req.user?.id)throw new UnauthorizedException('Not authenticated');return req.user.id;}
function fields(body:unknown,allowed:string[]):Record<string,unknown>{
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!allowed.includes(key)))throw new BadRequestException('Invalid authenticator fields');
 const value=body as Record<string,unknown>;
 if(typeof value.currentPassword!=='string'||!value.currentPassword.length||value.currentPassword.length>128)throw new BadRequestException('Current password is required');
 return value;
}
function clear(res:Response){res.clearCookie('access_token',{path:'/'});res.clearCookie('refresh_token',{path:'/'});}
@Controller('v1/auth/two-factor')
export class TwoFactorController {
 constructor(@Inject(TwoFactorService) private readonly service:TwoFactorService){}
 @Get()
 async status(@Req() req:OwnRequest){return this.service.status(own(req));}
 @Post('enroll') @HttpCode(200)
 async enroll(@Req() req:OwnRequest,@Body() body:unknown){const userId=own(req),value=fields(body,['currentPassword','method']);if(value.method!==undefined&&!['totp','email'].includes(value.method as string))throw new BadRequestException('Invalid factor method');return this.service.enroll(userId,value.currentPassword as string,value.method as 'totp'|'email'|undefined);}
 @Post('email-code') @HttpCode(200)
 async emailCode(@Req() req:OwnRequest,@Body() body:unknown){const value=fields(body,['currentPassword','purpose']);if(value.purpose!=='disable')throw new BadRequestException('Invalid code purpose');return this.service.emailCode(own(req),value.currentPassword as string);}
 @Post('confirm') @HttpCode(200)
 async confirm(@Req() req:OwnRequest,@Body() body:unknown,@Res({passthrough:true}) res:Response){
  const userId=own(req),value=fields(body,['currentPassword','code']);
  if(typeof value.code!=='string'||!/^\d{6}$/.test(value.code))throw new BadRequestException('A six digit authenticator code is required');
  const result=await this.service.confirm(userId,value.currentPassword as string,value.code);clear(res);return result;
 }
 @Post('disable') @HttpCode(200)
 async disable(@Req() req:OwnRequest,@Body() body:unknown,@Res({passthrough:true}) res:Response){
  const userId=own(req),value=fields(body,['currentPassword','code','recoveryCode']);
  if((!!value.code===!!value.recoveryCode)||(value.code!==undefined&&(typeof value.code!=='string'||!/^\d{6}$/.test(value.code)))||(value.recoveryCode!==undefined&&(typeof value.recoveryCode!=='string'||! /^[a-fA-F0-9]{8}-?[a-fA-F0-9]{8}$/.test(value.recoveryCode))))throw new BadRequestException('Exactly one valid second factor is required');
  const result=await this.service.disable(userId,value.currentPassword as string,{secondFactorCode:value.code as string|undefined,recoveryCode:value.recoveryCode as string|undefined});clear(res);return result;
 }
}
