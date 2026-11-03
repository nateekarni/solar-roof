export interface GatewaySetupProgress {
  gatewayCreated:boolean;
  nextDeviceIndex:number;
}

export interface GatewaySetupCreation {
  siteId:string;
  gateway:unknown;
  devices:readonly unknown[];
}

export async function runGatewaySetupCreation(
  setup:GatewaySetupCreation,
  post:(path:string,body:unknown)=>Promise<unknown>,
  onProgress:(progress:GatewaySetupProgress)=>void,
  initial:GatewaySetupProgress={gatewayCreated:false,nextDeviceIndex:0},
):Promise<GatewaySetupProgress>{
  let progress={...initial};
  const sitePath=`/v1/sites/${encodeURIComponent(setup.siteId)}`;
  if(!progress.gatewayCreated){
    await post(`${sitePath}/gateway`,setup.gateway);
    progress={...progress,gatewayCreated:true};
    onProgress(progress);
  }
  while(progress.nextDeviceIndex<setup.devices.length){
    await post(`${sitePath}/devices`,setup.devices[progress.nextDeviceIndex]);
    progress={...progress,nextDeviceIndex:progress.nextDeviceIndex+1};
    onProgress(progress);
  }
  return progress;
}
