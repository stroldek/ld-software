export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } });
}
export function error(message, status = 400) { return json({ error: message }, status); }
export async function readJson(request) { try { return await request.json(); } catch { return null; } }
export function cleanString(value, max = 500) { if (value === null || value === undefined) return null; const text = String(value).trim(); return text ? text.slice(0,max) : null; }
