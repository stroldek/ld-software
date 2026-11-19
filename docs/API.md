# API reference — milestone 0.1.0

All endpoints except `GET /api/health` require `Authorization: Bearer <ADMIN_TOKEN>`. Requests with a JSON body must use `Content-Type: application/json`.

## System

- `GET /api/health` — public worker health, version, and binding-presence check.
- `GET /api/dashboard` — lead counters, segment count, recent audit events.

## Leads

- `GET /api/leads` — paginated list. Query parameters: `page`, `limit` (10–100), `q`, `status`, `quality`, `source`, `segment_id`, `from`, `to`, `sort`, `direction`.
- `POST /api/leads` — create or upsert by unique `telegram_id`. JSON fields: `telegram_id`, `username`, `first_name`, `last_name`, `phone`, `source`, `quality`, `status`, `notes`, `consent_status`.
- `GET /api/leads/:id` — lead details.
- `PATCH /api/leads/:id` — update editable fields.
- `DELETE /api/leads/:id` — permanently delete a lead.

Valid statuses: `new`, `in_progress`, `qualified`, `rejected`, `archived`. Valid qualities: `high`, `medium`, `low`, `unknown`. Consent states: `unknown`, `granted`, `withdrawn`.

## Segments

- `GET /api/segments` — segments with lead counts.
- `POST /api/segments` — create `{ "name": "...", "description": "..." }`.
- `PATCH /api/segments/:id` — rename and/or update description.
- `DELETE /api/segments/:id` — delete segment and memberships; leads remain.
- `POST /api/segments/:id/leads` — add up to 500 lead IDs: `{ "lead_ids": [1,2,3] }`.

Bulk removal from a segment, XLSX export and richer filters are planned for later milestones.
