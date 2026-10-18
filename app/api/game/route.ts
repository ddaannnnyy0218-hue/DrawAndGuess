import {env} from 'cloudflare:workers';
import {gameRequest} from '../../../lib/game.js';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return gameRequest(request, env.DB);}
export async function POST(request: Request) {return gameRequest(request, env.DB);}
