import {env} from 'cloudflare:workers';
import {challengeRequest} from '../../../lib/challenges.js';
export const dynamic='force-dynamic';
export function GET(request:Request){return challengeRequest(request,env.DB);}
export function POST(request:Request){return challengeRequest(request,env.DB);}
