import { ConflictException, Controller, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DocumentService } from './document.service.js';
@Controller('v1/documents')
export class DocumentsController {
 constructor(@Inject(DocumentService) private readonly documents:DocumentService){}
 @Post()
 async uploadDocument(){throw new ConflictException('Documents are issued by automatic billing or verified full payment.');}
 @Get(':id/pdf')
 async download(@Param('id') id:string,@Req() req:any,@Res() response:Response){
  const artifact=await this.documents.download(id,req.user);
  response.setHeader('Content-Type','application/pdf');
  response.setHeader('Content-Disposition',`attachment; filename="${artifact.filename}"`);
  response.setHeader('Cache-Control','private, no-store');
  response.setHeader('ETag',`"${artifact.sha256}"`);
  response.send(artifact.bytes);
 }
}
