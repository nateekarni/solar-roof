import sharp from 'sharp';
import {BadRequestException} from '@nestjs/common';
export async function normalizeAvatar(input:unknown):Promise<string>{
 try{
  if(typeof input!=='string'||input.length>88_000)throw new Error();
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if(!match)throw new Error();
  const bytes=Buffer.from(match[2]!,'base64');
  if(!bytes.length||bytes.length>64*1024||bytes.toString('base64')!==match[2])throw new Error();
  const image=sharp(bytes,{limitInputPixels:256*256,failOn:'warning'});
  const meta=await image.metadata();
  if(meta.format!==match[1]||meta.width!==256||meta.height!==256||(meta.pages??1)!==1)throw new Error();
  const normalized=await image.flatten({background:'#ffffff'}).jpeg({quality:85}).toBuffer();
  return `data:image/jpeg;base64,${normalized.toString('base64')}`;
 }catch{throw new BadRequestException('Avatar must be a valid cropped 256 × 256 PNG or JPEG under 64 KiB');}
}
