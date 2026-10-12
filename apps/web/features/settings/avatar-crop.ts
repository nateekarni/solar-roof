export function validateAvatarFile(file:{type:string;size:number}){
 return ['image/png','image/jpeg'].includes(file.type)&&file.size>0&&file.size<=5*1024*1024;
}
/** Normalized pan is bounded, keeping every source pixel within the image. */
export function cropRectangle(width:number,height:number,zoom:number,panX:number,panY:number){
 if(![width,height,zoom,panX,panY].every(Number.isFinite)||width<=0||height<=0)throw new Error('Invalid crop');
 const size=Math.min(width,height)/Math.max(1,Math.min(4,zoom));
 return {x:(width-size)*(Math.max(-1,Math.min(1,panX))+1)/2,y:(height-size)*(Math.max(-1,Math.min(1,panY))+1)/2,width:size,height:size};
}
