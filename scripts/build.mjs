#!/usr/bin/env node
// Build the static site into _site/: copy site/, then write the encrypted card data.
//
//   node scripts/build.mjs --input data/sample-cards.json   # local preview with sample data
//   node scripts/build.mjs                                  # fetch from the Apps Script API
//
// Env: CARDS_PASSWORD (required), CARDS_API_URL + CARDS_API_KEY (when fetching).
// Plain card data never goes into the repo or the site; only data/cards.enc.json is published.
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(ROOT, process.env.OUT_DIR || '_site');
const ITER = 250000;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

async function loadCards() {
  const input = arg('--input');
  if (input) return JSON.parse(await fs.readFile(path.resolve(input), 'utf8')).cards;
  const url = process.env.CARDS_API_URL, key = process.env.CARDS_API_KEY;
  if (!url || !key) throw new Error('set CARDS_API_URL and CARDS_API_KEY, or pass --input');
  const res = await fetch(url, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' },  // text/plain avoids a CORS-style preflight on Apps Script
    body: JSON.stringify({ key, action: 'get' })
  });
  const body = await res.json();
  if (!body.ok) throw new Error('API error: ' + body.error);
  return body.cards;
}

const b64 = (u8) => Buffer.from(u8).toString('base64');

async function encrypt(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

async function main() {
  const password = process.env.CARDS_PASSWORD;
  if (!password) throw new Error('set CARDS_PASSWORD');
  const cards = (await loadCards()).filter((c) => String(c.term || '').trim());
  const built = new Date().toISOString();
  // The page's 同步 button reads the Sheet directly; the endpoint travels inside the encrypted payload only.
  const api = process.env.CARDS_API_URL && process.env.CARDS_API_KEY ? { url: process.env.CARDS_API_URL, key: process.env.CARDS_API_KEY } : null;

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.cp(path.join(ROOT, 'site'), OUT, { recursive: true });
  const v = String(Date.now());
  const index = path.join(OUT, 'index.html');
  await fs.writeFile(index, (await fs.readFile(index, 'utf8')).replaceAll('__V__', v));
  await fs.copyFile(index, path.join(OUT, '404.html'));
  await fs.mkdir(path.join(OUT, 'data'), { recursive: true });
  await fs.writeFile(path.join(OUT, 'data', 'cards.enc.json'), JSON.stringify(await encrypt({ built, cards, api }, password)));
  await fs.writeFile(path.join(OUT, '.nojekyll'), '');
  console.log(`built ${cards.length} cards -> ${path.relative(ROOT, OUT)}/ (${built})`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
