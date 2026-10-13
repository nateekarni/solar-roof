import {Body,Controller,Inject,Put,Req,UnauthorizedException,BadRequestException} from '@nestjs/common';
import type {Request} from 'express';
import {DatabaseService} from '../../database/database.service.js';
import {normalizeAvatar} from './avatar-image.js';
@Controller('v1/me')
export class AvatarController{
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 @Put('avatar')
 async save(@Req() req:Request&{user?:{id:string}},@Body() body:unknown){
  if(!req.user?.id)throw new UnauthorizedException('Not authenticated');
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='image'))throw new BadRequestException('Invalid avatar fields');
  const avatarData=await normalizeAvatar((body as {image?:unknown}).image);
  const result=await this.db.query('UPDATE users SET avatar_data=$1,updated_at=NOW() WHERE id=$2 RETURNING id',[avatarData,req.user.id]);
  if(!result.rows.length)throw new UnauthorizedException('User not found');
  return {avatarData};
 }
}
