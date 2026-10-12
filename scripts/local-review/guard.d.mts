export function assertLocalSeedTarget(connectionString:string,env?:Record<string,string|undefined>):void;
export function assertLocalDockerDaemon(env?:Record<string,string|undefined>):void;
export function assertLocalDockerTarget(scope:'review'|'financial',env?:Record<string,string|undefined>):void;
export function assertReviewTarget(connectionString:string,databaseName:string):void;
export function fixtureDisplayName(value:string):string;
export function roleDisplayName(role:string):string;
