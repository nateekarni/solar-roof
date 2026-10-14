import {json,type RequestHandler} from 'express';
/** 10 MiB binary evidence expands by 4/3 in the existing JSON data-URI protocol. */
export function requestJsonLimit(path:string,method?:string):number{
 if(/^\/v1\/billing-cycles\/[^/]+\/pay$/.test(path))return 14*1024*1024;
 if(path==='/v1/settings/company')return 3*1024*1024;
 // 256 KiB of signature bytes expands to ~342 KiB, plus the data URI and JSON envelope.
 if(path==='/v1/me/signature'&&method==='PUT')return 350*1024;
 return 100*1024;
}
const normal=json({limit:100*1024}),evidence=json({limit:14*1024*1024}),company=json({limit:3*1024*1024}),signature=json({limit:350*1024});
export const scopedJsonParser:RequestHandler=(req,res,next)=>{
 const limit=requestJsonLimit(req.path,req.method);
 (limit===14*1024*1024?evidence:limit===3*1024*1024?company:limit===350*1024?signature:normal)(req,res,next);
};
