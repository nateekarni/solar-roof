export async function billingDetailRequest<T>(id:string,get:(path:string)=>Promise<{row:T}>):Promise<T> {
 return (await get(`/v1/operations/billing/records/${encodeURIComponent(id)}`)).row;
}