/** Preserve the selected image itself so exported HTML works without the platform origin. */
export async function embeddedImageSource(source:string,baseUrl:string):Promise<string> {
 if(source.startsWith('data:'))return source;
 const response=await fetch(new URL(source,baseUrl));
 if(!response.ok)throw new Error('Unable to embed document logo');
 const blob=await response.blob();
 if(!blob.type.startsWith('image/'))throw new Error('Document logo response is not an image');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return `data:${blob.type};base64,${btoa(binary)}`;
}
