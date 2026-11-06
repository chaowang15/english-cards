/* English Cards · single-page front end. Card data is AES-GCM encrypted (scripts/build.mjs) and decrypted here. */
(function () {
  'use strict';
  var R = document.documentElement, APP = document.getElementById('app');
  var PASS = 'ec-pass', STARS = 'ecStarsV1', PROG = 'ecProgressV1', LOG = 'ecStudyLogV1', ACCENT = 'ec-accent';
  var BOX_DAYS = [0, 1, 2, 4, 8, 16, 32];
  var KIND_C = { word: '#3b82f6', phrase: '#22c55e', idiom: '#f59e0b', usage: '#ec4899', group: '#8b5cf6' };
  var PALETTE = ['#8b5cf6', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#84cc16', '#14b8a6', '#d946ef'];

  var I = {
      'nav.home': '首页', 'nav.browse': '浏览', 'nav.study': '学习', 'nav.search': '搜索', 'search.ph': '搜索单词、释义、例句', loading: '加载中…',
      'lock.title': '输入密码', 'lock.sub': '卡片数据已加密，每台设备只需输入一次。', 'lock.go': '解锁', 'lock.bad': '密码不对', 'lock.out': '退出（清除本机密码）',
      wod: '今日一词', 'wod.study': '开始学习', 'wod.detail': '查看详情',
      'k.total': '卡片总数', 'k.week': '本周新增', 'k.streak': '连续学习天数', 'k.due': '待复习',
      recent: '最近添加', all: '全部', 'due.title': '该复习了', 'due.n': '张卡片到期', 'due.none': '今天没有到期的卡片', 'due.go': '去复习',
      kinds: '类型', tags: '标签', months: '按月浏览', 'month.n': '本月新增', 'cal.hint': '点日期看当天新增的卡片',
      word: '单词', phrase: '短语', idiom: '习语', usage: '用法', group: '中→英',
      'v.title': '仅词条', 'v.one': '一句话', 'v.full': '完整', starred: '收藏', 'cards.n': '张', clear: '清除筛选', 'empty.list': '没有符合条件的卡片',
      'f.entries': '英文说法', 'f.usage': '用法', 'f.examples': '例句', 'f.synonyms': '近义词', 'f.antonyms': '反义词', 'f.collocations': '常见搭配', 'f.context': '我遇到它的地方',
      'f.note': '笔记', 'f.en': '英文释义', added: '添加于', back: '返回',
      's.all': '全部卡片', 's.due': '只看到期', 's.star': '只学收藏', shuffle: '打乱', 'flip.hint': '点击或按空格翻面', 'g0': '不认识', 'g1': '模糊', 'g2': '认识',
      'g0s': '今天再看', 'g1s': '明天再看', 'g2s': '间隔加长', keys: '← → 翻页 · 空格翻面 · 1 2 3 评分', 'done.title': '这一组学完了', 'done.sub': '本次评分',
      'done.again': '再来一遍', exportc: '导出 CSV', exporta: '导出 Anki', copied: '已导出', 'notfound': '没有找到这张卡片', 'empty.all': '还没有卡片。跟 ChatGPT 说一个词，它会帮你记下来。',
      accent: '发音', when: '时间', 'w.week': '本周', 'w.last': '上周',
      'sort.new': '最新', 'sort.old': '最早', 'sort.az': 'A–Z', 'fav.all': '全部', 'fav.only': '★ 收藏', 'fav.title': '收藏', 'fav.n': '张收藏',
      'fav.browse': '看收藏', 'fav.study': '学收藏', 'fav.none': '还没有收藏。点卡片右上角的 ☆ 收藏。', 'zh.head': '中文'
  };
  function t(k) { return I[k] || k; }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function colorOf(s) { return KIND_C[s] || PALETTE[hashStr(String(s)) % PALETTE.length]; }
  function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function localDay(iso) { var d = new Date(iso); return isNaN(d) ? '' : ymd(d); }
  function toast(msg) {
    var el = document.querySelector('.toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast' }));
    el.textContent = msg; el.classList.add('on');
    clearTimeout(el._h); el._h = setTimeout(function () { el.classList.remove('on'); }, 1800);
  }

  /* ---- scheme / view (same pattern as hackernews hn2.js) ---- */
  window.setScheme = function () {
    R.dataset.scheme = R.dataset.scheme === 'dark' ? 'light' : 'dark';
    store('ec-scheme', R.dataset.scheme);
  };
  function syncSet() {
    $$('[data-set]').forEach(function (b) { var kv = b.dataset.set.split(':'); b.classList.toggle('on', R.dataset[kv[0]] === kv[1]); });
    $$('[data-i]').forEach(function (n) { n.textContent = t(n.dataset.i); });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-set]');
    if (!b) return;
    var kv = b.dataset.set.split(':');
    R.dataset[kv[0]] = kv[1];
    store('ec-' + kv[0], kv[1]);
    syncSet();
  });

  /* ---- decryption ---- */
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function decrypt(env, password) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(env.salt), iterations: env.iter }, base,
        { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.ct));
    }).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  var ENV = null, DATA = null, CARDS = [], BY = {};
  function boot() {
    syncSet();
    fetch('data/cards.enc.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (env) {
      ENV = env;
      var p = localStorage.getItem(PASS);
      if (!p) return lockScreen('');
      return decrypt(env, p).then(ready, function () { lockScreen(t('lock.bad')); });
    }).catch(function (e) { APP.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  function lockScreen(err) {
    document.body.classList.add('locked');
    APP.innerHTML = '<div class="lock panel"><div class="eyebrow">English Cards</div><h1>' + t('lock.title') + '</h1><p>' + t('lock.sub') + '</p>' +
      '<form id="lockf"><input id="pw" type="password" autocomplete="current-password" autofocus><button class="btn">' + t('lock.go') + '</button></form>' +
      '<div class="err">' + esc(err) + '</div></div>';
    document.getElementById('lockf').onsubmit = function (ev) {
      ev.preventDefault();
      var p = document.getElementById('pw').value;
      decrypt(ENV, p).then(function (d) { store(PASS, p); ready(d); }, function () { lockScreen(t('lock.bad')); });
    };
  }
  function ready(d) {
    document.body.classList.remove('locked');
    DATA = d;
    CARDS = (d.cards || []).slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
    BY = {};
    CARDS.forEach(function (c) { c.day = localDay(c.created_at); BY[c.id] = c; });
    route();
  }

  /* ---- stars (local override of the Sheet's `starred`) and review progress ---- */
  function isStar(c) { var s = jget(STARS, {}); return c.id in s ? !!s[c.id] : !!c.starred; }
  function toggleStar(id) {
    var s = jget(STARS, {}), c = BY[id];
    s[id] = !isStar(c);
    store(STARS, JSON.stringify(s));
    return s[id];
  }
  function prog(id) { return jget(PROG, {})[id] || null; }
  function isDue(c) { var p = prog(c.id); return !p || p.due <= ymd(); }
  function grade(id, g) {
    var all = jget(PROG, {}), p = all[id] || { box: 0, n: 0 }, today = ymd();
    if (g === 0) p.box = 0;
    else if (g === 2) p.box = Math.min(p.box + 1, BOX_DAYS.length - 1);
    else p.box = Math.max(p.box, 1);
    p.due = addDays(today, g === 0 ? 0 : g === 1 ? 1 : BOX_DAYS[p.box]);
    p.last = today; p.n = (p.n || 0) + 1;
    all[id] = p;
    store(PROG, JSON.stringify(all));
    var log = jget(LOG, {});
    log[today] = (log[today] || 0) + 1;
    store(LOG, JSON.stringify(log));
  }
  function streak() {
    var log = jget(LOG, {}), d = ymd(), n = 0;
    if (!log[d]) d = addDays(d, -1);
    while (log[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.star');
    if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    var on = toggleStar(b.dataset.id);
    $$('.star[data-id="' + b.dataset.id + '"]').forEach(function (x) { x.classList.toggle('on', on); x.textContent = on ? '★' : '☆'; });
  });

  /* ---- pronunciation via the browser's speechSynthesis ---- */
  var SAY_ICON = '<svg class="ico" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  function accent() { return localStorage.getItem(ACCENT) || 'en-US'; }
  function say(text) {
    if (!window.speechSynthesis || !text) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text), lang = accent();
    var v = speechSynthesis.getVoices().filter(function (x) { return x.lang.replace('_', '-') === lang; });
    u.lang = lang; if (v.length) u.voice = v[0];
    u.rate = 0.92;
    speechSynthesis.speak(u);
  }
  function sayBtn(text) { return window.speechSynthesis ? '<button class="say" data-say="' + esc(text) + '" aria-label="speak" title="Speak">' + SAY_ICON + '</button>' : ''; }
  function accentSeg() {
    return '<span class="seg sm accent"><button data-accent="en-US" class="' + (accent() === 'en-US' ? 'on' : '') + '">US</button>' +
      '<button data-accent="en-GB" class="' + (accent() === 'en-GB' ? 'on' : '') + '">UK</button></span>';
  }
  document.addEventListener('click', function (ev) {
    var s = ev.target.closest && ev.target.closest('[data-say]');
    if (s) { ev.preventDefault(); ev.stopPropagation(); say(s.dataset.say); return; }
    var a = ev.target.closest && ev.target.closest('[data-accent]');
    if (a) {
      store(ACCENT, a.dataset.accent);
      $$('[data-accent]').forEach(function (x) { x.classList.toggle('on', x.dataset.accent === a.dataset.accent); });
    }
  });

  /* ---- shared markup ---- */
  function chip(label, href, color, n, sel) {
    return '<a class="tag' + (sel ? ' sel' : '') + '" href="' + href + '" style="--c:' + color + '">' + esc(label) + (n != null ? '<b>' + n + '</b>' : '') + '</a>';
  }
  function starBtn(c) { var on = isStar(c); return '<button class="star' + (on ? ' on' : '') + '" data-id="' + esc(c.id) + '" aria-label="star">' + (on ? '★' : '☆') + '</button>'; }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : String(v || '').split('\n').filter(Boolean); }
  var HIDDEN_TAGS = ['notion-import'];  /* bookkeeping tags kept in the Sheet but not shown */
  function tagsOf(c) { return list(c.tags).filter(function (x) { return HIDDEN_TAGS.indexOf(x) < 0; }); }
  function isZh(c) { return c.kind === 'group' || /[\u4e00-\u9fff]/.test(c.term || ''); }
  /* entries: one English expression per line, optionally "english — 中文说明" */
  function entries(c) {
    return list(c.entries).map(function (x) {
      var m = x.match(/^(.*?)\s+[—–-]{1,2}\s+(.*)$/);
      return m ? { en: m[1].trim(), zh: m[2].trim() } : { en: x.trim(), zh: '' };
    });
  }
  function entriesHTML(c, sayIt) {
    var e = entries(c);
    return e.length ? '<ul class="ents">' + e.map(function (x) {
      return '<li><b>' + esc(x.en) + '</b>' + (sayIt ? ' ' + sayBtn(x.en) : '') + (x.zh ? ' <span class="mute">' + esc(x.zh) + '</span>' : '') + '</li>';
    }).join('') + '</ul>' : '';
  }
  function enLine(c) { return entries(c).map(function (x) { return x.en; }).join(' · '); }
  function oneLine(c) { return isZh(c) ? enLine(c) : c.meaning_en || list(c.examples)[0] || c.usage || ''; }
  function searchText(c) {
    return [c.term, list(c.aliases).join(' '), c.meaning_zh, c.meaning_en, list(c.entries).join(' '), list(c.examples).join(' '), c.usage, list(c.tags).join(' '), c.note, c.context, c.source].join(' ').toLowerCase();
  }
  function fieldsHTML(c, opts) {
    opts = opts || {};
    var f = [];
    function add(k, body) { if (body) f.push('<div class="fld"><b>' + t(k) + '</b>' + body + '</div>'); }
    if (opts.en) add('f.en', c.meaning_en ? '<div>' + esc(c.meaning_en) + '</div>' : '');
    add('f.entries', entriesHTML(c, opts.say));
    add('f.examples', list(c.examples).length ? '<ul>' + list(c.examples).map(function (x) { return '<li>' + esc(x) + ' ' + (opts.say ? sayBtn(x) : '') + '</li>'; }).join('') + '</ul>' : '');
    add('f.usage', c.usage ? '<div>' + esc(c.usage) + '</div>' : '');
    add('f.collocations', list(c.collocations).length ? '<div class="chips">' + list(c.collocations).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div>' : '');
    add('f.synonyms', list(c.synonyms).length ? '<div class="chips">' + list(c.synonyms).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div>' : '');
    add('f.antonyms', list(c.antonyms).length ? '<div class="chips">' + list(c.antonyms).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div>' : '');
    var srcLabel = c.source || (c.source_url ? String(c.source_url).replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '');
    var src = !srcLabel ? '' : /^https?:\/\//.test(c.source_url || '')
      ? '<a class="more" href="' + esc(c.source_url) + '" target="_blank" rel="noopener">' + esc(srcLabel) + ' ↗</a>' : esc(srcLabel);
    add('f.context', (c.context ? '<div class="ctx">“' + esc(c.context) + '”</div>' : '') + (src ? '<div class="srcline">— ' + src + '</div>' : ''));
    add('f.note', c.note ? '<div>' + esc(c.note) + '</div>' : '');
    return '<div class="fields">' + f.join('') + '</div>';
  }
  function itemHTML(c) {
    return '<article class="ci">' + starBtn(c) +
      '<div class="h"><a class="t" href="#/card/' + encodeURIComponent(c.id) + '">' + esc(c.term) + '</a>' +
      (c.pos ? '<span class="pos">' + esc(c.pos) + '</span>' : '') + (c.ipa ? '<span class="ipa">' + esc(c.ipa) + '</span>' : '') +
      '<span class="z">' + esc(isZh(c) ? enLine(c) : c.meaning_zh) + '</span></div>' +
      '<p class="one">' + esc(isZh(c) ? c.meaning_zh || '' : oneLine(c)) + '</p>' +
      '<div class="full">' + fieldsHTML(c, { en: true }) +
      '<div class="meta"><span class="kindb">' + t(c.kind) + '</span><span>' + esc(c.day) + '</span></div></div></article>';
  }
  function viewSeg() {
    return '<div class="seg">' + ['title', 'one', 'full'].map(function (v) { return '<button data-set="view:' + v + '">' + t('v.' + v) + '</button>'; }).join('') + '</div>';
  }
  function counts(key) {
    var m = {};
    CARDS.forEach(function (c) { (key === 'tags' ? tagsOf(c) : [c[key]]).forEach(function (x) { if (x) m[x] = (m[x] || 0) + 1; }); });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || a.localeCompare(b); }).map(function (k) { return [k, m[k]]; });
  }
  function emptyAll() { return '<div class="empty">' + t('empty.all') + '</div>'; }

  /* ---- router ---- */
  function parse() {
    var h = location.hash.replace(/^#\/?/, ''), q = h.indexOf('?'), path = q < 0 ? h : h.slice(0, q);
    return { path: path, q: new URLSearchParams(q < 0 ? '' : h.slice(q + 1)) };
  }
  var cleanup = null;
  function route() {
    syncSet();
    if (!DATA) return;
    if (cleanup) { cleanup(); cleanup = null; }
    var r = parse(), top = r.path.split('/')[0] || 'home';
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.dataset.nav === top && !(top === 'browse' && r.q.get('focus'))); });
    if (top === 'browse') browse(r.q);
    else if (top === 'study') study(r.q);
    else if (top === 'card') detail(decodeURIComponent(r.path.slice(5)));
    else home();
    syncSet();
  }
  window.addEventListener('hashchange', function () { route(); window.scrollTo(0, 0); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    ev.preventDefault();
    var q = document.getElementById('q');
    if (q) q.focus(); else location.hash = '#/browse?focus=1';
  });

  /* ---- home: today's panel ---- */
  function home() {
    if (!CARDS.length) { APP.innerHTML = emptyAll(); return; }
    var today = ymd(), ids = CARDS.map(function (c) { return c.id; }).sort();
    var w = BY[ids[hashStr(today) % ids.length]];
    var due = CARDS.filter(isDue).length, weekAgo = addDays(today, -6);
    var week = CARDS.filter(function (c) { return c.day >= weekAgo; }).length;
    var ex = list(w.examples)[0] || w.context;
    var h = '<section class="hero"><div class="wod panel"><div>' +
      '<div class="eyebrow">' + t('wod') + ' · ' + today + '</div>' +
      '<h1 class="term">' + esc(w.term) + '</h1>' +
      (isZh(w) ? '<p class="mz">' + esc(enLine(w)) + '</p><p class="me">' + esc(w.meaning_zh || '') + '</p>' :
      '<div class="pron">' + (w.pos ? '<span class="pos">' + esc(w.pos) + '</span>' : '') + (w.ipa ? '<span>' + esc(w.ipa) + '</span>' : '') + sayBtn(w.term) + '</div>' +
      '<p class="mz">' + esc(w.meaning_zh) + '</p><p class="me">' + esc(w.meaning_en) + '</p>') +
      '<div class="acts"><a class="btn" href="#/study">' + t('wod.study') + ' →</a><a class="ghost" href="#/card/' + encodeURIComponent(w.id) + '">' + t('wod.detail') + '</a></div></div>' +
      '<div class="side">' + (ex ? '<blockquote>' + esc(ex) + ' ' + sayBtn(ex) + '</blockquote>' : '') +
      (list(w.collocations).length ? '<div class="chips">' + list(w.collocations).slice(0, 4).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
      '</div></div>' +
      '<div class="kpis"><div class="kpi panel"><b>' + CARDS.length + '</b><small>' + t('k.total') + '</small></div>' +
      '<div class="kpi panel"><b>' + week + '</b><small>' + t('k.week') + '</small></div>' +
      '<div class="kpi panel"><b>' + streak() + '</b><small>' + t('k.streak') + '</small></div>' +
      '<a class="kpi panel due" href="#/study?deck=due"><b>' + due + '</b><small>' + t('k.due') + '</small></a></div></section>';
    h += '<div class="homegrid"><section><div class="sech"><h2>' + t('recent') + '</h2>' + viewSeg() + '</div>' +
      '<div class="cl">' + CARDS.slice(0, 10).map(itemHTML).join('') + '</div>' +
      (CARDS.length > 10 ? '<a class="more" href="#/browse">' + t('all') + ' ' + CARDS.length + ' →</a>' : '') +
      '<div class="sech"><h2>' + t('months') + '</h2></div><div id="months"></div></section>';
    h += '<aside class="homeside"><div class="panel duecta"><div><div class="eyebrow">' + t('due.title') + '</div><b>' +
      (due ? due + ' ' + t('due.n') : t('due.none')) + '</b></div>' + (due ? '<a class="btn" href="#/study?deck=due">' + t('due.go') + '</a>' : '') + '</div>' +
      favPanel() + cloud('kinds', 'kind') + cloud('tags', 'tags') + '</aside></div>';
    APP.innerHTML = h;
    months();
  }
  function favPanel() {
    var n = CARDS.filter(isStar).length;
    return '<div class="panel duecta"><div><div class="eyebrow">' + t('fav.title') + '</div><b>' + n + ' ' + t('fav.n') + '</b></div>' +
      (n ? '<span style="display:flex;gap:8px"><a class="ghost" href="#/browse?star=1">' + t('fav.browse') + '</a><a class="ghost" href="#/study?deck=star">' + t('fav.study') + '</a></span>' : '') + '</div>';
  }
  function cloud(title, key) {
    var c = counts(key);
    if (!c.length) return '';
    var param = key === 'tags' ? 'tag' : 'kind';
    return '<div class="panel"><div class="eyebrow">' + t(title) + '</div><div class="cloud">' +
      c.map(function (x) { return chip(key === 'kind' ? t(x[0]) : x[0], '#/browse?' + param + '=' + encodeURIComponent(x[0]), colorOf(x[0]), x[1]); }).join('') + '</div></div>';
  }
  function months() {
    var by = {};
    CARDS.forEach(function (c) { if (c.day) by[c.day] = (by[c.day] || 0) + 1; });
    var ms = Object.keys(by).map(function (d) { return d.slice(0, 7); }).filter(function (m, i, a) { return a.indexOf(m) === i; }).sort().reverse();
    var box = document.getElementById('months');
    if (!ms.length) return;
    var cur = ms[0];
    function draw() {
      var y = +cur.slice(0, 4), m = +cur.slice(5, 7), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
      var max = 1, total = 0;
      for (var d = 1; d <= days; d++) { var k = cur + '-' + String(d).padStart(2, '0'); max = Math.max(max, by[k] || 0); total += by[k] || 0; }
      var wk = ['一', '二', '三', '四', '五', '六', '日'];
      var g = wk.map(function (x) { return '<span>' + x + '</span>'; }).join('');
      for (var p = 0; p < (first.getDay() + 6) % 7; p++) g += '<i class="hc off"></i>';
      for (d = 1; d <= days; d++) {
        var key = cur + '-' + String(d).padStart(2, '0'), n = by[key] || 0;
        g += n ? '<button class="hc" style="--a:' + (0.3 + 0.7 * n / max).toFixed(2) + '" data-day="' + key + '" title="' + key + ' · ' + n + '">' + d + '</button>'
          : '<i class="hc zero" style="--a:0">' + d + '</i>';
      }
      box.innerHTML = '<div class="mchips">' + ms.map(function (x) { return '<button class="mchip' + (x === cur ? ' on' : '') + '" data-m="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
        '<div class="panel heat" style="padding:18px;max-width:420px"><div class="hgrid">' + g + '</div><small>' + total + ' ' + t('month.n') + ' · ' + t('cal.hint') + '</small></div>';
      $$('.mchip', box).forEach(function (b) { b.onclick = function () { cur = b.dataset.m; draw(); }; });
      $$('button.hc', box).forEach(function (b) { b.onclick = function () { location.hash = '#/browse?day=' + b.dataset.day; }; });
    }
    draw();
  }

  /* ---- browse: list + filters + search + sort ---- */
  function weekStart(d) { var x = new Date(d + 'T12:00:00'); return addDays(d, -((x.getDay() + 6) % 7)); }
  function whenOf(c) {
    var today = ymd(), ws = weekStart(today);
    if (c.day >= ws) return 'week';
    if (c.day >= addDays(ws, -7)) return 'last';
    return c.day.slice(0, 7);
  }
  function monthLabel(m) { return m.slice(0, 4) + ' 年 ' + (+m.slice(5, 7)) + ' 月'; }
  var COLL = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  var ZHCOLL = new Intl.Collator('zh-Hans-u-co-pinyin');
  function azCmp(a, b) {
    var za = isZh(a), zb = isZh(b);
    if (za !== zb) return za ? 1 : -1;
    return za ? ZHCOLL.compare(a.term, b.term) : COLL.compare(a.term, b.term);
  }
  function letterOf(c) { return isZh(c) ? t('zh.head') : 'A–Z'; }

  function browse(q) {
    if (!CARDS.length) { APP.innerHTML = emptyAll(); return; }
    var st = { q: q.get('q') || '', tag: q.get('tag') || '', kind: q.get('kind') || '', star: q.get('star') === '1', day: q.get('day') || '',
      when: q.get('when') || '', sort: q.get('sort') || 'new' };
    function href(patch) {
      var s = Object.assign({}, st, patch), p = new URLSearchParams();
      ['q', 'tag', 'kind', 'day', 'when'].forEach(function (k) { if (s[k]) p.set(k, s[k]); });
      if (s.star) p.set('star', '1');
      if (s.sort !== 'new') p.set('sort', s.sort);
      var x = p.toString();
      return '#/browse' + (x ? '?' + x : '');
    }
    function group(label, chipsHTML) { return chipsHTML ? '<div class="fgroup"><span class="flabel">' + label + '</span><div class="filters">' + chipsHTML + '</div></div>' : ''; }
    var wc = {};
    CARDS.forEach(function (c) {
      var w = whenOf(c), m = c.day.slice(0, 7);
      if (w === 'week' || w === 'last') wc[w] = (wc[w] || 0) + 1;
      wc[m] = (wc[m] || 0) + 1;
    });
    var months = Object.keys(wc).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort().reverse();
    var whenChips = [['week', t('w.week')], ['last', t('w.last')]].filter(function (x) { return wc[x[0]]; })
      .concat(months.map(function (m) { return [m, monthLabel(m)]; }))
      .map(function (x) { return chip(x[1], href({ when: st.when === x[0] ? '' : x[0], day: '' }), '#64748b', wc[x[0]], st.when === x[0]); }).join('');
    var filters = group(t('when'), whenChips) +
      group(t('kinds'), counts('kind').map(function (x) { return chip(t(x[0]), href({ kind: st.kind === x[0] ? '' : x[0] }), colorOf(x[0]), x[1], st.kind === x[0]); }).join('')) +
      group(t('tags'), counts('tags').map(function (x) { return chip(x[0], href({ tag: st.tag === x[0] ? '' : x[0] }), colorOf(x[0]), x[1], st.tag === x[0]); }).join(''));
    var any = st.tag || st.kind || st.day || st.when;
    var nFav = CARDS.filter(isStar).length;
    APP.innerHTML = '<div class="rhead"><div class="rtop"><h1 class="rtitle">' + t('nav.browse') + (st.day ? ' · ' + esc(st.day) : '') + '</h1>' +
      '<div class="seg favseg"><a class="' + (st.star ? '' : 'on') + '" href="' + href({ star: false }) + '">' + t('fav.all') + ' <b>' + CARDS.length + '</b></a>' +
      '<a class="' + (st.star ? 'on' : '') + '" href="' + href({ star: true }) + '">' + t('fav.only') + ' <b>' + nFav + '</b></a></div></div>' +
      '<div class="count"><b id="count">0</b> ' + t('cards.n') + (any ? ' · <a class="more" href="' + href({ tag: '', kind: '', day: '', when: '' }) + '">' + t('clear') + '</a>' : '') +
      '<span class="exports"><button class="ghost" id="excsv">' + t('exportc') + '</button><button class="ghost" id="exanki">' + t('exporta') + '</button></span></div>' +
      filters + '</div>' +
      '<div class="toolbar"><div class="tbrow"><label class="qbox"><svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input id="q" type="search" placeholder="' + esc(t('search.ph')) + '" value="' + esc(st.q) + '" autocomplete="off"></label>' +
      '<div class="seg sortseg">' + ['new', 'old', 'az'].map(function (k) { return '<button data-sort="' + k + '" class="' + (st.sort === k ? 'on' : '') + '">' + t('sort.' + k) + '</button>'; }).join('') + '</div>' +
      viewSeg() + '</div></div>' +
      '<div class="cl" id="cl"></div>';
    var input = document.getElementById('q'), shown = [];
    function head(label) { return '<h3 class="gh">' + esc(label) + '</h3>'; }
    function draw() {
      st.q = input.value;
      var terms = st.q.toLowerCase().split(/\s+/).filter(Boolean);
      shown = CARDS.filter(function (c) {
        if (st.kind && c.kind !== st.kind) return false;
        if (st.tag && list(c.tags).indexOf(st.tag) < 0) return false;
        if (st.day && c.day !== st.day) return false;
        if (st.star && !isStar(c)) return false;
        if (st.when && (st.when.length === 7 ? c.day.slice(0, 7) : whenOf(c)) !== st.when) return false;
        if (!terms.length) return true;
        var s = searchText(c);
        return terms.every(function (x) { return s.indexOf(x) >= 0; });
      });
      if (st.sort === 'az') shown.sort(azCmp);
      else if (st.sort === 'old') shown.reverse();
      if (terms.length && st.sort !== 'az') shown.sort(function (a, b) { return (b.term.toLowerCase().indexOf(terms[0]) === 0) - (a.term.toLowerCase().indexOf(terms[0]) === 0); });
      var h = '', last = null;
      shown.forEach(function (c) {
        var g = st.sort === 'az' ? letterOf(c) : (function (w) { return w === 'week' ? t('w.week') : w === 'last' ? t('w.last') : monthLabel(w); })(whenOf(c));
        if (g !== last && !terms.length) { h += head(g); last = g; }
        h += itemHTML(c);
      });
      document.getElementById('cl').innerHTML = shown.length ? h : '<div class="empty">' + (st.star && !nFav ? t('fav.none') : t('empty.list')) + '</div>';
      document.getElementById('count').textContent = shown.length;
      history.replaceState(null, '', href({}));
    }
    var tm;
    input.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(draw, 100); });
    $$('[data-sort]').forEach(function (b) {
      b.onclick = function () { st.sort = b.dataset.sort; $$('[data-sort]').forEach(function (x) { x.classList.toggle('on', x === b); }); draw(); };
    });
    document.getElementById('excsv').onclick = function () { exportCSV(shown); };
    document.getElementById('exanki').onclick = function () { exportAnki(shown); };
    draw();
    if (q.get('focus')) input.focus();
  }

  /* ---- export ---- */
  var EXPORT_COLS = ['term', 'kind', 'pos', 'ipa', 'meaning_zh', 'meaning_en', 'entries', 'usage', 'examples', 'synonyms', 'antonyms', 'collocations', 'source', 'source_url', 'context', 'tags', 'note', 'created_at'];
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast(t('copied'));
  }
  function exportCSV(cards) {
    function cell(v) { v = Array.isArray(v) ? v.join('\n') : String(v == null ? '' : v); return '"' + v.replace(/"/g, '""') + '"'; }
    var rows = [EXPORT_COLS.join(',')].concat(cards.map(function (c) { return EXPORT_COLS.map(function (k) { return cell(c[k]); }).join(','); }));
    download('english-cards-' + ymd() + '.csv', '\ufeff' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function exportAnki(cards) {
    function clean(s) { return String(s || '').replace(/[\t\r\n]+/g, ' '); }
    var rows = ['#separator:tab', '#html:true', '#tags column:3'].concat(cards.map(function (c) {
      var back = '<b>' + esc(c.meaning_zh) + '</b><br>' + esc(c.meaning_en) +
        (entries(c).length ? '<br>' + entries(c).map(function (x) { return esc(x.en) + (x.zh ? ' — ' + esc(x.zh) : ''); }).join('<br>') : '') +
        (list(c.examples).length ? '<br><br>' + list(c.examples).map(esc).join('<br>') : '') + (c.context ? '<br><br><i>' + esc(c.context) + '</i>' : '');
      var front = esc(c.term) + (c.ipa ? ' <small>' + esc(c.ipa) + '</small>' : '');
      return [clean(front), clean(back), list(c.tags).map(function (x) { return x.replace(/\s+/g, '_'); }).join(' ')].join('\t');
    }));
    download('english-cards-anki-' + ymd() + '.txt', rows.join('\n'), 'text/plain;charset=utf-8');
  }

  /* ---- card detail ---- */
  function detail(id) {
    var c = BY[id];
    if (!c) { APP.innerHTML = '<div class="empty">' + t('notfound') + '</div>'; return; }
    APP.innerHTML = '<a class="backlink" href="javascript:history.back()">← ' + t('back') + '</a>' +
      '<article class="detail panel" style="position:relative"><div style="position:absolute;top:18px;right:18px">' + starBtn(c) + '</div>' +
      '<div class="eyebrow">' + t(c.kind) + '</div><h1 class="term">' + esc(c.term) + '</h1>' +
      '<div class="pron" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:var(--mut);font-family:var(--mono)">' +
      (c.pos ? '<span class="pos">' + esc(c.pos) + '</span>' : '') + (c.ipa ? '<span>' + esc(c.ipa) + '</span>' : '') + (isZh(c) ? '' : sayBtn(c.term)) + accentSeg() + '</div>' +
      (c.meaning_zh ? '<p class="mz">' + esc(c.meaning_zh) + '</p>' : '') + (c.meaning_en ? '<p class="mute" style="margin:0">' + esc(c.meaning_en) + '</p>' : '') +
      fieldsHTML(c, { say: true }) +
      '<div class="meta" style="margin-top:20px">' + (tagsOf(c).length ? '<span class="tags">' + tagsOf(c).map(function (x) { return chip(x, '#/browse?tag=' + encodeURIComponent(x), colorOf(x)); }).join('') + '</span>' : '') +
      '<span>' + t('added') + ' ' + esc(c.day) + '</span></div></article>';
  }

  /* ---- study: flashcards with Leitner grading ---- */
  function study(q) {
    if (!CARDS.length) { APP.innerHTML = emptyAll(); return; }
    var deckName = q.get('deck') || 'all', tag = q.get('tag') || '', shuffle = q.get('shuffle') === '1';
    var deck = CARDS.filter(function (c) {
      if (deckName === 'due' && !isDue(c)) return false;
      if (deckName === 'star' && !isStar(c)) return false;
      if (tag && list(c.tags).indexOf(tag) < 0) return false;
      return true;
    });
    if (shuffle) {
      for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
    } else if (deckName === 'due') {
      deck.sort(function (a, b) { var pa = prog(a.id), pb = prog(b.id); return String(pa ? pa.due : '').localeCompare(String(pb ? pb.due : '')); });
    }
    var idx = 0, flipped = false, tally = [0, 0, 0];
    function link(patch) {
      var s = Object.assign({ deck: deckName, tag: tag, shuffle: shuffle ? '1' : '' }, patch), p = new URLSearchParams();
      Object.keys(s).forEach(function (k) { if (s[k] && !(k === 'deck' && s[k] === 'all')) p.set(k, s[k]); });
      return '#/study' + (p.toString() ? '?' + p : '');
    }
    var opts = [['all', t('s.all')], ['star', t('s.star')], ['due', t('s.due')]].map(function (o) {
      return '<option value="' + o[0] + '"' + (deckName === o[0] && !tag ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + counts('tags').map(function (x) { return '<option value="tag:' + esc(x[0]) + '"' + (tag === x[0] ? ' selected' : '') + '># ' + esc(x[0]) + ' (' + x[1] + ')</option>'; }).join('');
    APP.innerHTML = '<div class="study"><div class="sbar"><select id="deck">' + opts + '</select>' +
      '<button class="ghost' + (shuffle ? ' on' : '') + '" id="shuf" style="' + (shuffle ? 'color:var(--acc);border-color:var(--acc)' : '') + '">⤨ ' + t('shuffle') + '</button>' +
      '<span style="margin-left:auto;display:flex;gap:8px;align-items:center"><span class="mute" style="font-size:13px">' + t('accent') + '</span>' + accentSeg() + '</span></div>' +
      '<div id="stage"></div></div>';
    document.getElementById('deck').onchange = function () {
      var v = this.value;
      location.hash = v.indexOf('tag:') === 0 ? link({ deck: 'all', tag: v.slice(4) }) : link({ deck: v, tag: '' });
    };
    document.getElementById('shuf').onclick = function () { location.hash = link({ shuffle: shuffle ? '' : '1' }); };
    var stage = document.getElementById('stage');

    function draw() {
      if (!deck.length) { stage.innerHTML = '<div class="empty">' + (deckName === 'due' ? t('due.none') : deckName === 'star' && !CARDS.some(isStar) ? t('fav.none') : t('empty.list')) + '</div>'; return; }
      if (idx >= deck.length) {
        stage.innerHTML = '<div class="done panel"><div class="eyebrow">' + t('done.sub') + '</div><h2>' + t('done.title') + '</h2>' +
          '<p class="mute">' + t('g0') + ' ' + tally[0] + ' · ' + t('g1') + ' ' + tally[1] + ' · ' + t('g2') + ' ' + tally[2] + '</p>' +
          '<div style="display:flex;gap:10px;justify-content:center;margin-top:18px"><button class="btn" id="again">' + t('done.again') + '</button><a class="ghost" href="#/">' + t('nav.home') + '</a></div></div>';
        document.getElementById('again').onclick = function () { idx = 0; tally = [0, 0, 0]; draw(); };
        return;
      }
      var c = deck[idx], prev = deck[idx - 1], next = deck[idx + 1], ex = list(c.examples)[0];
      flipped = false;
      stage.innerHTML = '<div class="prog"><i style="width:' + ((idx + 1) / deck.length * 100) + '%"></i></div>' +
        '<div class="pnum"><span>' + (idx + 1) + ' / ' + deck.length + '</span><span>' + t(c.kind) + '</span></div>' +
        '<div class="flash" id="flash"><div class="fin">' +
        '<div class="face front panel"><div style="position:absolute;top:12px;right:12px">' + starBtn(c) + '</div>' +
        '<h2 class="term">' + esc(c.term) + '</h2>' +
        (isZh(c) ? (c.meaning_zh ? '<div class="ctx" style="font-style:normal">' + esc(c.meaning_zh) + '</div>' : '') :
        '<div class="pron" style="display:flex;gap:10px;align-items:center;color:var(--mut);font-family:var(--mono)">' + (c.ipa ? '<span>' + esc(c.ipa) + '</span>' : '') + sayBtn(c.term) + '</div>') +
        (c.context ? '<div class="ctx">“' + esc(c.context) + '”</div>' : '') + '<div class="hint">' + t('flip.hint') + '</div></div>' +
        '<div class="face back panel"><div class="eyebrow">' + esc(c.pos || t(c.kind)) + '</div><h2 class="term">' + esc(c.term) + ' ' + (isZh(c) ? '' : sayBtn(c.term)) + '</h2>' +
        (isZh(c) ? '' : '<p class="mz">' + esc(c.meaning_zh) + '</p><p class="mute" style="margin:0">' + esc(c.meaning_en) + '</p>') +
        fieldsHTML(c, { say: true }) + '</div></div></div>' +
        '<div class="grade"><button class="g0" data-g="0">' + t('g0') + '<small>' + t('g0s') + '</small></button>' +
        '<button class="g1" data-g="1">' + t('g1') + '<small>' + t('g1s') + '</small></button>' +
        '<button class="g2" data-g="2">' + t('g2') + '<small>' + t('g2s') + '</small></button></div>' +
        '<div class="nav3"><button class="peek" id="prev"' + (prev ? '' : ' disabled') + '>← ' + esc(prev ? prev.term : '') + '</button>' +
        '<span class="keys">' + t('keys') + '</span>' +
        '<button class="peek r" id="next"' + (next ? '' : ' disabled') + '>' + esc(next ? next.term : '') + ' →</button></div>';
      var fl = document.getElementById('flash');
      fl.onclick = function (ev) { if (!ev.target.closest('button,a')) flip(); };
      var x0 = null;
      fl.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      fl.addEventListener('touchend', function (e) {
        if (x0 == null) return;
        var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 60) { move(dx < 0 ? 1 : -1); }
      });
      document.getElementById('prev').onclick = function () { move(-1); };
      document.getElementById('next').onclick = function () { move(1); };
      $$('[data-g]', stage).forEach(function (b) { b.onclick = function () { rate(+b.dataset.g); }; });
      syncSet();
    }
    function flip() { flipped = !flipped; document.getElementById('flash').classList.toggle('flip', flipped); }
    function move(d) { var n = idx + d; if (n < 0 || n >= deck.length) return; idx = n; draw(); }
    function rate(g) { grade(deck[idx].id, g); tally[g]++; idx++; draw(); }
    function key(ev) {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || idx >= deck.length) return;
      if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); flip(); }
      else if (ev.key === 'ArrowRight') move(1);
      else if (ev.key === 'ArrowLeft') move(-1);
      else if (ev.key === '1' || ev.key === '2' || ev.key === '3') rate(+ev.key - 1);
    }
    document.addEventListener('keydown', key);
    cleanup = function () { document.removeEventListener('keydown', key); };
    draw();
  }

  /* footer: sign out on this device */
  var foot = document.createElement('footer');
  foot.className = 'empty ecfoot';
  foot.style.padding = '30px 0 40px';
  foot.innerHTML = '<a class="more" href="#" id="signout" data-i="lock.out" style="font-size:13px"></a>';
  document.body.insertBefore(foot, document.querySelector('.tabbar'));
  document.getElementById('signout').onclick = function (ev) {
    ev.preventDefault();
    localStorage.removeItem(PASS);
    DATA = null;
    lockScreen('');
  };

  boot();
})();
