import {rateLimit} from 'express-rate-limit';
import type {Express} from 'express';
/** Each middleware owns a distinct in-memory store. Login/refresh intentionally
 * share their existing budget; factor reads never spend the mutation budget. */
export function registerAuthRateLimits(app:Express){
 const options={windowMs:60000,limit:10,standardHeaders:true,legacyHeaders:false,validate:{xForwardedForHeader:false},message:{statusCode:429,message:'Too many authentication requests, please try again in 1 minute'}};
 const authLimiter=rateLimit(options);
 app.use('/v1/auth/login',authLimiter);
 app.use('/v1/auth/refresh',authLimiter);
 app.use('/v1/auth/password-reset',rateLimit({...options,skip:req=>req.method!=='POST'}));
 app.use('/v1/auth/two-factor',rateLimit({...options,skip:req=>req.method!=='POST'}));
}
