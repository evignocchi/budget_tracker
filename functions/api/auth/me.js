import { json, errorResponse } from '../_lib/http.js';
import { getSession, publicUser } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);
  return json({ user: publicUser(session) });
}
