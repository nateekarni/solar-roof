import {json,type RequestHandler} from 'express';
/** 10 MiB binary evidence expands by 4/3 in the existing JSON data-URI protocol. */
export function requestJsonLimit(path:string):number{
 if(/^\/v1\/billing-cycles\/[^/]+\/pay$/.test(path))return 14*1024*1024;
 if(path==='/v1/settings/company')return 3*1024*1024;
 return 100*1024;
}
const normal=json({limit:100*1024}),evidence=json({limit:14*1024*1024}),company=json({limit:3*1024*1024});
export const scopedJsonParser:RequestHandler=(req,res,next)=>{
 const limit=requestJsonLimit(req.path);
 (limit===14*1024*1024?evidence:limit===3*1024*1024?company:normal)(req,res,next);
};
