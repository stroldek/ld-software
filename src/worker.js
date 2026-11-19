import { json, error, readJson, cleanString } from './http.js';
import { buildLeadFilters, recordAudit } from './db.js';

const statuses = ['new', 'in_progress', 'qualified', 'rejected', 'archived'];
const qualities = ['high', 'medium', 'low', 'unknown'];
const sorts = ['created_at', 'updated_at', 'username', 'telegram_id', 'status', 'quality'];

function authorized(request, env) {
  const expected = env.ADMIN_TOKEN || '';
  const header = request.headers.get('authorization') || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!expected || supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return mismatch === 0;
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/health' && request.method === 'GET') {
    return json({ ok: true, app: 'ZAMOVO', version: '0.1.0', database: Boolean(env.DB), adminConfigured: Boolean(env.ADMIN_TOKEN) });
  }
  if (!authorized(request, env)) return error(env.ADMIN_TOKEN ? 'Unauthorized' : 'ADMIN_TOKEN is not configured', env.ADMIN_TOKEN ? 401 : 503);
  if (!env.DB) return error('D1 binding DB is not configured', 503);

  if (path === '/api/dashboard' && request.method === 'GET') {
    const [leads, segments, recent] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) new_count, SUM(CASE WHEN quality='high' THEN 1 ELSE 0 END) high_quality FROM leads").first(),
      env.DB.prepare('SELECT COUNT(*) total FROM segments').first(),
      env.DB.prepare('SELECT id, action, entity_type, entity_id, created_at FROM audit_log ORDER BY id DESC LIMIT 8').all()
    ]);
    return json({ leads, segments: segments.total, recent: recent.results });
  }

  if (path === '/api/leads' && request.method === 'GET') {
    const f = buildLeadFilters(url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.max(10, Math.min(100, Number(url.searchParams.get('limit')) || 25));
    const requestedSort = url.searchParams.get('sort');
    const sort = sorts.includes(requestedSort) ? requestedSort : 'created_at';
    const direction = url.searchParams.get('direction') === 'asc' ? 'ASC' : 'DESC';
    const count = await env.DB.prepare('SELECT COUNT(*) total FROM leads ' + f.where).bind(...f.values).first();
    const rows = await env.DB.prepare('SELECT leads.*, (SELECT GROUP_CONCAT(s.name, ", ") FROM lead_segments ls JOIN segments s ON s.id=ls.segment_id WHERE ls.lead_id=leads.id) segments FROM leads ' + f.where + ' ORDER BY ' + sort + ' ' + direction + ' LIMIT ? OFFSET ?').bind(...f.values, limit, (page - 1) * limit).all();
    return json({ items: rows.results, page, limit, total: count.total, pages: Math.ceil(count.total / limit) });
  }

  if (path === '/api/leads' && request.method === 'POST') {
    const body = await readJson(request);
    const telegramId = cleanString(body?.telegram_id, 40);
    if (!telegramId || !Array.from(telegramId).every(char => char >= '0' && char <= '9')) return error('telegram_id must contain digits only');
    const quality = qualities.includes(body.quality) ? body.quality : 'unknown';
    const status = statuses.includes(body.status) ? body.status : 'new';
    const item = await env.DB.prepare("INSERT INTO leads (telegram_id, username, first_name, last_name, phone, source, quality, status, notes, consent_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET username=COALESCE(excluded.username, leads.username), first_name=COALESCE(excluded.first_name, leads.first_name), last_name=COALESCE(excluded.last_name, leads.last_name), phone=COALESCE(excluded.phone, leads.phone), source=COALESCE(excluded.source, leads.source), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING *").bind(
      telegramId, cleanString(body.username, 64), cleanString(body.first_name, 120), cleanString(body.last_name, 120),
      cleanString(body.phone, 40), cleanString(body.source, 200), quality, status, cleanString(body.notes, 2000),
      body.consent_status === 'granted' ? 'granted' : 'unknown'
    ).first();
    await recordAudit(env.DB, 'lead.upsert', 'lead', item.id, { telegram_id: telegramId });
    return json({ item }, 201);
  }

  const leadPrefix = '/api/leads/';
  if (path.startsWith(leadPrefix)) {
    const id = Number(path.slice(leadPrefix.length));
    if (!Number.isSafeInteger(id) || id < 1) return error('Not found', 404);
    if (request.method === 'GET') {
      const item = await env.DB.prepare('SELECT * FROM leads WHERE id=?').bind(id).first();
      return item ? json({ item }) : error('Lead not found', 404);
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM leads WHERE id=?').bind(id).run();
      await recordAudit(env.DB, 'lead.delete', 'lead', id);
      return json({ ok: true });
    }
    if (request.method === 'PATCH') {
      const body = await readJson(request);
      const old = await env.DB.prepare('SELECT * FROM leads WHERE id=?').bind(id).first();
      if (!old) return error('Lead not found', 404);
      const value = {
        username: cleanString(body.username, 64) ?? old.username,
        first_name: cleanString(body.first_name, 120) ?? old.first_name,
        last_name: cleanString(body.last_name, 120) ?? old.last_name,
        phone: cleanString(body.phone, 40) ?? old.phone,
        source: cleanString(body.source, 200) ?? old.source,
        notes: cleanString(body.notes, 2000) ?? old.notes,
        quality: qualities.includes(body.quality) ? body.quality : old.quality,
        status: statuses.includes(body.status) ? body.status : old.status,
        consent_status: ['unknown', 'granted', 'withdrawn'].includes(body.consent_status) ? body.consent_status : old.consent_status
      };
      const item = await env.DB.prepare("UPDATE leads SET username=?, first_name=?, last_name=?, phone=?, source=?, notes=?, quality=?, status=?, consent_status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? RETURNING *").bind(
        value.username, value.first_name, value.last_name, value.phone, value.source, value.notes,
        value.quality, value.status, value.consent_status, id
      ).first();
      await recordAudit(env.DB, 'lead.update', 'lead', id);
      return json({ item });
    }
  }

  if (path === '/api/segments' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT s.*, COUNT(ls.lead_id) lead_count FROM segments s LEFT JOIN lead_segments ls ON ls.segment_id=s.id GROUP BY s.id ORDER BY s.name COLLATE NOCASE').all();
    return json({ items: result.results });
  }
  if (path === '/api/segments' && request.method === 'POST') {
    const body = await readJson(request);
    const name = cleanString(body?.name, 100);
    if (!name) return error('Segment name is required');
    try {
      const item = await env.DB.prepare('INSERT INTO segments(name, description) VALUES(?, ?) RETURNING *').bind(name, cleanString(body.description, 500)).first();
      await recordAudit(env.DB, 'segment.create', 'segment', item.id);
      return json({ item }, 201);
    } catch {
      return error('Segment name already exists', 409);
    }
  }

  const segmentPrefix = '/api/segments/';
  if (path.startsWith(segmentPrefix)) {
    const rest = path.slice(segmentPrefix.length);
    const parts = rest.split('/');
    const id = Number(parts[0]);
    if (!Number.isSafeInteger(id) || id < 1) return error('Not found', 404);
    if (parts.length === 1 && request.method === 'PATCH') {
      const body = await readJson(request);
      const name = cleanString(body?.name, 100);
      if (!name) return error('Segment name is required');
      try {
        const item = await env.DB.prepare("UPDATE segments SET name=?, description=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? RETURNING *").bind(name, cleanString(body.description, 500), id).first();
        return item ? json({ item }) : error('Segment not found', 404);
      } catch {
        return error('Segment name already exists', 409);
      }
    }
    if (parts.length === 1 && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM segments WHERE id=?').bind(id).run();
      await recordAudit(env.DB, 'segment.delete', 'segment', id);
      return json({ ok: true });
    }
    if (parts.length === 2 && parts[1] === 'leads' && request.method === 'POST') {
      const body = await readJson(request);
      const ids = Array.isArray(body?.lead_ids) ? [...new Set(body.lead_ids.map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 500) : [];
      if (!ids.length) return error('lead_ids must contain positive IDs');
      const segment = await env.DB.prepare('SELECT id FROM segments WHERE id=?').bind(id).first();
      if (!segment) return error('Segment not found', 404);
      await env.DB.batch(ids.map(leadId => env.DB.prepare('INSERT OR IGNORE INTO lead_segments(lead_id, segment_id) SELECT id, ? FROM leads WHERE id=?').bind(id, leadId)));
      return json({ ok: true, processed: ids.length });
    }
  }
  return error('Not found', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env); }
      catch (err) {
        console.error('API error', err);
        return error('Internal server error', 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
