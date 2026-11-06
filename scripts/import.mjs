#!/usr/bin/env node
// Push cards from a JSON file into the Sheet through the Apps Script `add` action
// (existing terms are merged, not duplicated).
//
//   CARDS_API_URL=... CARDS_API_KEY=... node scripts/import.mjs data/sample-cards.json
import fs from 'node:fs/promises';

const url = process.env.CARDS_API_URL, key = process.env.CARDS_API_KEY;
const file = process.argv[2];
if (!url || !key || !file) {
  console.error('usage: CARDS_API_URL=... CARDS_API_KEY=... node scripts/import.mjs <cards.json>');
  process.exit(1);
}

const SKIP = ['id', 'updated_at'];
const { cards } = JSON.parse(await fs.readFile(file, 'utf8'));
let ok = 0;
for (const c of cards) {
  const card = Object.fromEntries(Object.entries(c).filter(([k]) => !SKIP.includes(k)));
  const res = await fetch(url, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ key, action: 'add', card })
  });
  const body = await res.json().catch(() => ({ ok: false, error: 'HTTP ' + res.status }));
  console.log(body.ok ? (body.merged ? 'merged ' : 'added  ') + c.term : 'FAILED ' + c.term + ': ' + body.error);
  if (body.ok) ok++;
}
console.log(`${ok}/${cards.length} ok`);
