import {env} from 'cloudflare:workers';
import {rankedRequest} from '../../../lib/ranked.js';
function handle(request:Request){const bindings=env as unknown as {DB:unknown;ASSETS:Fetcher};return rankedRequest(request,bindings.DB,Date.now(),{assets:(path:string)=>bindings.ASSETS.fetch(new Request('https://assets.local'+path))});}
export const GET=handle;
export const POST=handle;
