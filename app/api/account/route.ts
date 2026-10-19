import {env} from 'cloudflare:workers';
import {accountRequest} from '../../../lib/accounts.js';
export const dynamic='force-dynamic';
export function GET(request:Request){return accountRequest(request,env.DB);}
export function POST(request:Request){return accountRequest(request,env.DB);}
