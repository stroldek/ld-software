export async function recordAudit(db, action, entityType = null, entityId = null, details = {}) {
  await db.prepare('INSERT INTO audit_log (action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?)')
    .bind(action, entityType, entityId === null ? null : String(entityId), JSON.stringify(details)).run();
}

export function buildLeadFilters(url) {
  const clauses = [];
  const values = [];
  const params = url.searchParams;
  const query = params.get('q')?.trim();
  if (query) {
    clauses.push('(telegram_id LIKE ? OR username LIKE ? OR first_name LIKE ? OR last_name LIKE ?)');
    const term = '%' + query.slice(0, 100) + '%';
    values.push(term, term, term, term);
  }
  for (const key of ['status', 'quality', 'source']) {
    const value = params.get(key);
    if (value) { clauses.push(key + ' = ?'); values.push(value.slice(0, 200)); }
  }
  const from = params.get('from');
  const to = params.get('to');
  if (from) { clauses.push('created_at >= ?'); values.push(from); }
  if (to) { clauses.push('created_at <= ?'); values.push(to); }
  const segmentId = Number(params.get('segment_id'));
  if (Number.isSafeInteger(segmentId) && segmentId > 0) {
    clauses.push('EXISTS (SELECT 1 FROM lead_segments ls WHERE ls.lead_id=leads.id AND ls.segment_id=?)');
    values.push(segmentId);
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', values };
}
