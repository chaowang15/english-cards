/**
 * English Cards · Google Apps Script Web App bound to the cards Sheet.
 *
 * Every request is a POST with a JSON body: {"key": "...", "action": "...", ...}
 * (GET with ?key=...&action=get|search also works, for curl and quick checks).
 * Apps Script cannot read request headers, so the key travels in the body / query.
 *
 * Script Properties:
 *   API_KEY        required, shared secret for all actions
 *   GITHUB_TOKEN   optional, fine-grained token with "Contents: read & write" on the site repo
 *   GITHUB_REPO    optional, e.g. "chaowang15/english-cards"; with the token, writes trigger a rebuild
 */

var SHEET = 'cards';
var COLUMNS = [
  'id', 'term', 'aliases', 'kind', 'pos', 'ipa', 'meaning_zh', 'meaning_en', 'entries', 'usage',
  'examples', 'synonyms', 'antonyms', 'collocations', 'source', 'source_url', 'context',
  'tags', 'note', 'status', 'starred', 'created_at', 'updated_at'
];
var LIST_FIELDS = ['aliases', 'entries', 'examples', 'synonyms', 'antonyms', 'collocations', 'tags'];
var KINDS = ['word', 'phrase', 'idiom', 'usage', 'group'];  // group: Chinese headword, English entries
var STATUSES = ['new', 'learning', 'known'];

function doGet(e) { return handle_(e.parameter || {}); }

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return out_({ ok: false, error: 'invalid JSON' }); }
  Object.keys(e.parameter || {}).forEach(function (k) { if (body[k] === undefined) body[k] = e.parameter[k]; });
  return handle_(body);
}

function handle_(req) {
  var key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!key || req.key !== key) return out_({ ok: false, error: 'unauthorized' });
  try {
    switch (req.action) {
      case 'get': return out_(getCards_(req));
      case 'search': return out_(search_(req));
      case 'add': return out_(locked_(function () { return add_(req.card || {}); }));
      case 'update': return out_(locked_(function () { return update_(req); }));
      case 'delete': return out_(locked_(function () { return remove_(req); }));
      default: return out_({ ok: false, error: 'unknown action: ' + req.action });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- sheet access ---------- */

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUMNS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function header_(sh) {
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var missing = COLUMNS.filter(function (c) { return h.indexOf(c) < 0; });
  if (missing.length) {
    sh.getRange(1, h.length + 1, 1, missing.length).setValues([missing]);
    h = h.concat(missing);
  }
  return h;
}

function readAll_() {
  var sh = sheet_(), h = header_(sh), n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  return sh.getRange(2, 1, n, h.length).getValues().map(function (row, i) {
    var o = { _row: i + 2 };
    h.forEach(function (c, j) { o[c] = row[j] instanceof Date ? row[j].toISOString() : row[j]; });
    return o;
  }).filter(function (o) { return String(o.term || '').trim(); });
}

function writeRow_(sh, h, row, card) {
  var vals = h.map(function (c) { return card[c] === undefined || card[c] === null ? '' : card[c]; });
  sh.getRange(row, 1, 1, h.length).setValues([vals]);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Writes: run under the lock, then ask GitHub to rebuild. */
function locked_(fn) {
  var res = withLock_(fn);
  if (res.ok) dispatch_();
  return res;
}

/* ---------- field helpers ---------- */

function norm_(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function list_(v) {
  if (Array.isArray(v)) return v.map(function (x) { return String(x).trim(); }).filter(String);
  return String(v || '').split('\n').map(function (x) { return x.trim(); }).filter(String);
}

function union_(a, b) {
  var seen = {}, outList = [];
  list_(a).concat(list_(b)).forEach(function (x) {
    var k = norm_(x);
    if (!seen[k]) { seen[k] = 1; outList.push(x); }
  });
  return outList;
}

/** Sheet value for a field: lists become newline-separated cells. */
function cell_(field, v) {
  if (LIST_FIELDS.indexOf(field) >= 0) return list_(v).join('\n');
  if (field === 'starred') return v === true || v === 'true' || v === 1 || v === '1' || v === 'TRUE';
  return v === undefined || v === null ? '' : String(v).trim();
}

function toPublic_(o) {
  var c = {};
  COLUMNS.forEach(function (k) {
    var v = o[k];
    if (LIST_FIELDS.indexOf(k) >= 0) c[k] = list_(v);
    else if (k === 'starred') c[k] = v === true || v === 'TRUE' || v === 'true';
    else c[k] = v === undefined || v === null ? '' : String(v);
  });
  return c;
}

function matches_(o, term) {
  var t = norm_(term);
  return norm_(o.term) === t || list_(o.aliases).some(function (a) { return norm_(a) === t; });
}

function findCard_(cards, req) {
  if (req.id) return cards.filter(function (o) { return String(o.id) === String(req.id); })[0];
  if (req.term) return cards.filter(function (o) { return matches_(o, req.term); })[0];
  return null;
}

function newId_(term) {
  var slug = norm_(term).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'card';
  return slug + '-' + Utilities.getUuid().slice(0, 6);
}

/* ---------- actions ---------- */

/** Add a card; if the term (or an alias) already exists, merge into it instead of inserting. */
function add_(card) {
  if (!String(card.term || '').trim()) return { ok: false, error: 'card.term is required' };
  var sh = sheet_(), h = header_(sh), cards = readAll_(), now = new Date().toISOString();
  var old = cards.filter(function (o) {
    return matches_(o, card.term) || list_(card.aliases).some(function (a) { return matches_(o, a); });
  })[0];
  if (old) {
    var patch = {};
    Object.keys(card).forEach(function (k) { if (k !== 'term') patch[k] = card[k]; });
    if (norm_(card.term) !== norm_(old.term)) patch.aliases = union_(card.aliases, [card.term]);
    var merged = mergeInto_(old, patch, false);
    merged.updated_at = now;
    writeRow_(sh, h, old._row, merged);
    return { ok: true, merged: true, card: toPublic_(merged) };
  }
  var c = {};
  COLUMNS.forEach(function (k) { c[k] = cell_(k, card[k]); });
  c.id = newId_(card.term);
  c.kind = KINDS.indexOf(c.kind) >= 0 ? c.kind : /[\u4e00-\u9fff]/.test(c.term) ? 'group' : /\s/.test(c.term) ? 'phrase' : 'word';
  c.status = STATUSES.indexOf(c.status) >= 0 ? c.status : 'new';
  c.created_at = card.created_at && !isNaN(new Date(card.created_at)) ? new Date(card.created_at).toISOString() : now;  // imports keep their date
  c.updated_at = now;
  writeRow_(sh, h, sh.getLastRow() + 1, c);
  return { ok: true, merged: false, card: toPublic_(c) };
}

/**
 * Merge `patch` into an existing card.
 * List fields are unioned unless replace=true; empty patch values never erase existing text.
 */
function mergeInto_(old, patch, replace) {
  var c = {};
  COLUMNS.forEach(function (k) { c[k] = old[k]; });
  Object.keys(patch).forEach(function (k) {
    if (COLUMNS.indexOf(k) < 0 || k === 'id' || k === 'created_at' || k === 'updated_at') return;
    var v = patch[k];
    if (LIST_FIELDS.indexOf(k) >= 0) {
      c[k] = (replace ? list_(v) : union_(old[k], v)).join('\n');
    } else if (k === 'starred') {
      c[k] = cell_(k, v);
    } else if (String(v == null ? '' : v).trim() !== '' || replace) {
      c[k] = cell_(k, v);
    }
  });
  return c;
}

/**
 * update: {id | term, fields: {...}, replace?: bool}
 * Default merges (e.g. fields.examples = ["one more"] appends one example).
 */
function update_(req) {
  var cards = readAll_(), old = findCard_(cards, req);
  if (!old) return { ok: false, error: 'card not found' };
  var sh = sheet_(), h = header_(sh);
  var c = mergeInto_(old, req.fields || {}, !!req.replace);
  c.updated_at = new Date().toISOString();
  writeRow_(sh, h, old._row, c);
  return { ok: true, card: toPublic_(c) };
}

function remove_(req) {
  var cards = readAll_(), old = findCard_(cards, req);
  if (!old) return { ok: false, error: 'card not found' };
  sheet_().deleteRow(old._row);
  return { ok: true, deleted: String(old.id) };
}

/**
 * get: {complete?: '1'}. With complete=1 (the site's 同步 button) cards missing core content are
 * filled by the model first; builds call get without it, so they never use the model.
 */
function getCards_(req) {
  var res = { ok: true };
  if (String(req.complete) === '1') {
    var c = completeMissing_();
    res.completed = c.done;
    res.pending = c.pending;
    if (c.error) res.completeError = c.error;
  }
  res.cards = withLock_(fillMissing_).map(toPublic_);
  return res;
}

/** Words typed into the id column (A) instead of term (B) are moved over. */
function fixMisplaced_() {
  var sh = sheet_(), h = header_(sh), n = sh.getLastRow() - 1;
  if (n <= 0) return;
  var iId = h.indexOf('id'), iTerm = h.indexOf('term');
  var rng = sh.getRange(2, 1, n, h.length), rows = rng.getValues(), changed = false;
  rows.forEach(function (r) {
    var id = String(r[iId] || '').trim();
    if (String(r[iTerm] || '').trim() || !id || looksLikeId_(id)) return;
    r[iTerm] = id;
    r[iId] = '';
    changed = true;
  });
  if (changed) rng.setValues(rows);
}

function looksLikeId_(s) {
  return /^(notion-|legacy-|card-)/.test(s) || /-[0-9a-f]{6,8}$/.test(s) || /-\d{8}$/.test(s);
}

/** Rows typed or pasted by hand may lack id / kind / status / created_at: fill and save them. */
function fillMissing_() {
  fixMisplaced_();
  var cards = readAll_(), sh = null, h = null, now = new Date().toISOString();
  cards.forEach(function (o) {
    if (String(o.id).trim() && String(o.created_at).trim() && KINDS.indexOf(o.kind) >= 0 && STATUSES.indexOf(o.status) >= 0) return;
    if (!sh) { sh = sheet_(); h = header_(sh); }
    if (!String(o.id).trim()) o.id = newId_(o.term);
    if (!String(o.created_at).trim()) o.created_at = now;
    if (!String(o.updated_at).trim()) o.updated_at = now;
    if (KINDS.indexOf(o.kind) < 0) o.kind = /[\u4e00-\u9fff]/.test(o.term) ? 'group' : /\s/.test(String(o.term).trim()) ? 'phrase' : 'word';
    if (STATUSES.indexOf(o.status) < 0) o.status = 'new';
    writeRow_(sh, h, o._row, o);
  });
  return cards;
}

/* ---------- auto-complete hand-added words (only when core content is missing) ---------- */

var COMPLETE_LIMIT = 8;  // per 同步 click; keeps one call well inside the Apps Script time limit

function isGroupTerm_(o) { return o.kind === 'group' || /[\u4e00-\u9fff]/.test(String(o.term || '')); }

/** Core content = term + Chinese meaning + examples (Chinese-first cards: English entries instead of examples). */
function isIncomplete_(o) {
  if (!String(o.term || '').trim()) return false;
  if (!String(o.meaning_zh || '').trim()) return true;
  return isGroupTerm_(o) ? !list_(o.entries).length : !list_(o.examples).length;
}

function completeMissing_() {
  var key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  withLock_(fillMissing_);
  var todo = readAll_().filter(isIncomplete_);
  if (!todo.length) return { done: [], pending: 0 };
  if (!key) return { done: [], pending: todo.length, error: 'OPENAI_API_KEY is not set' };
  var batch = todo.slice(0, COMPLETE_LIMIT), filled;
  try {
    filled = callModel_(key, batch);
  } catch (err) {
    return { done: [], pending: todo.length, error: String(err && err.message || err) };
  }
  var done = withLock_(function () {
    var sh = sheet_(), h = header_(sh), now = new Date().toISOString(), out = [];
    var fresh = {};
    readAll_().forEach(function (o) { fresh[String(o.id)] = o; });
    batch.forEach(function (b, i) {
      var o = fresh[String(b.id)], f = filled[i];
      if (!o || !f || !isIncomplete_(o)) return;
      Object.keys(f).forEach(function (k) {
        if (COLUMNS.indexOf(k) < 0 || k === 'term') return;
        var empty = LIST_FIELDS.indexOf(k) >= 0 ? !list_(o[k]).length : !String(o[k] || '').trim();
        if (k === 'kind' && KINDS.indexOf(f.kind) >= 0 && (o.kind === 'word' || o.kind === 'phrase' || empty)) empty = true;
        if (empty) o[k] = cell_(k, f[k]);
      });
      o.tags = union_(o.tags, ['ai-filled']).join('\n');
      o.updated_at = now;
      writeRow_(sh, h, o._row, o);
      out.push(String(o.term));
    });
    return out;
  });
  if (done.length) dispatch_();
  return { done: done, pending: Math.max(0, todo.length - done.length) };
}

var CARD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['kind', 'pos', 'ipa', 'meaning_zh', 'meaning_en', 'entries', 'usage', 'examples', 'synonyms', 'collocations', 'tags'],
  properties: {
    kind: { type: 'string', enum: ['word', 'phrase', 'idiom', 'usage', 'group'] },
    pos: { type: 'string' }, ipa: { type: 'string' },
    meaning_zh: { type: 'string' }, meaning_en: { type: 'string' },
    entries: { type: 'array', items: { type: 'string' } }, usage: { type: 'string' },
    examples: { type: 'array', items: { type: 'string' } },
    synonyms: { type: 'array', items: { type: 'string' } }, collocations: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } }
  }
};

var COMPLETE_PROMPT = [
  'You fill in vocabulary cards for a Chinese-speaking English learner. For each input card, return one completed card, in the same order.',
  'Rules:',
  '- kind: word / phrase / idiom / usage for an English term; group when the term is Chinese (a Chinese headword collecting several English expressions).',
  '- meaning_zh: one short Chinese definition (several senses separated by "；"), no English inside.',
  '- meaning_en: one concise English definition. For group cards use "".',
  '- examples: 2 natural, everyday English example sentences that use the term; English only, no translations. For group cards 0-2 examples.',
  '- entries: only for group cards — 3-8 English expressions, each "english — 简短中文说明". Otherwise [].',
  '- pos: e.g. "n.", "v.", "adj.", "phr. v.", "idiom"; "" for group. ipa: American IPA for single English words, else "".',
  '- usage: one short Chinese note on usage, register or common mistakes, or "".',
  '- synonyms, collocations: up to 4 each, English; may be [].',
  '- tags: 1-3 lowercase English labels for register or topic (e.g. spoken, written, business, work, research, tech, cooking, emotion, daily, life).',
  '- Keep any information the input already has; do not invent sources or personal notes.'
].join('\n');

/** One Responses API call for the whole batch; returns an array aligned with `cards`. */
function callModel_(key, cards) {
  var p = PropertiesService.getScriptProperties();
  var model = p.getProperty('OPENAI_MODEL') || 'gpt-5-mini';
  var input = cards.map(function (o) {
    return { term: String(o.term), meaning_zh: String(o.meaning_zh || ''), meaning_en: String(o.meaning_en || ''),
      examples: list_(o.examples), entries: list_(o.entries), context: String(o.context || '') };
  });
  var body = {
    model: model,
    input: COMPLETE_PROMPT + '\n\nInput cards (JSON):\n' + JSON.stringify(input),
    text: { format: { type: 'json_schema', name: 'cards', strict: true, schema: {
      type: 'object', additionalProperties: false, required: ['cards'],
      properties: { cards: { type: 'array', items: CARD_SCHEMA } } } } }
  };
  var res = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify(body)
  });
  var code = res.getResponseCode(), j = JSON.parse(res.getContentText() || '{}');
  if (code !== 200) throw new Error('OpenAI ' + code + ': ' + (j.error && j.error.message || '').slice(0, 160));
  var text = '';
  (j.output || []).forEach(function (o) {
    (o.content || []).forEach(function (c) { if (c.type === 'output_text') text += c.text; });
  });
  var cardsOut = JSON.parse(text).cards || [];
  if (cardsOut.length !== cards.length) throw new Error('model returned ' + cardsOut.length + ' cards for ' + cards.length);
  return cardsOut;
}

/** search: {q, limit?} — substring match over term, aliases, meanings, examples, tags. */
function search_(req) {
  var q = norm_(req.q), limit = Number(req.limit) || 20;
  if (!q) return { ok: false, error: 'q is required' };
  var hits = readAll_().map(function (o) {
    var score = norm_(o.term) === q ? 3 : matches_(o, q) ? 2 :
      [o.term, o.aliases, o.meaning_zh, o.meaning_en, o.entries, o.examples, o.tags, o.note].map(norm_).join(' ').indexOf(q) >= 0 ? 1 : 0;
    return { o: o, score: score };
  }).filter(function (x) { return x.score > 0; });
  hits.sort(function (a, b) { return b.score - a.score || String(b.o.updated_at).localeCompare(String(a.o.updated_at)); });
  return { ok: true, total: hits.length, cards: hits.slice(0, limit).map(function (x) { return toPublic_(x.o); }) };
}

/* ---------- optional: ask GitHub to rebuild the site ---------- */

function dispatch_() {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('GITHUB_TOKEN'), repo = p.getProperty('GITHUB_REPO');
  if (!token || !repo) return;
  try {
    UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ event_type: 'cards-updated' })
    });
  } catch (err) { /* the hourly schedule still picks the change up */ }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor: creates the sheet header and a random API key. */
function setup() {
  sheet_();
  header_(sheet_());
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('API_KEY')) p.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('API_KEY = ' + p.getProperty('API_KEY'));
}
