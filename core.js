'use strict';
/* =====================================================================
   core.js - utilities, local database, API, offline queue, sync, router
   ===================================================================== */
const CFG = window.RMS_CONFIG || {};
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const round2 = n => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const iso = () => new Date().toISOString();
const parseJ = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
const normPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NF = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const rs = n => '₹' + NF.format(Math.abs(round2(n)));
const RANK = { staff: 1, manager: 2, owner: 3 };

function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function fmtDate(s) { if (!s) return ''; const a = String(s).slice(0, 10).split('-'); return a[2] + ' ' + MON[+a[1] - 1] + ' ' + a[0]; }
function fmtTime(isoStr) {
  const d = new Date(isoStr); if (isNaN(d)) return '';
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return pad(h) + ':' + pad(d.getMinutes()) + ' ' + ap;
}
function ago(isoStr) {
  const m = Math.floor((Date.now() - new Date(isoStr)) / 60000);
  if (isNaN(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return m + ' minutes ago';
  const h = Math.floor(m / 60); if (h < 24) return h + ' hours ago';
  const d = Math.floor(h / 24); if (d < 30) return d + ' days ago';
  const mo = Math.floor(d / 30); if (mo < 12) return mo + ' months ago';
  return Math.floor(d / 365) + ' years ago';
}

/* ---------- IndexedDB key-value store ---------- */
const DB = (function () {
  let dbp;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('rms-ledger', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  return {
    async get(k) { const db = await open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async set(k, v) { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
    async del(k) { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  };
})();

/* ---------- Theme (device preference) ---------- */
function themePref() { try { return localStorage.getItem('rms_theme') || 'system'; } catch (e) { return 'system'; } }
function applyTheme() {
  const p = themePref();
  const t = p === 'system' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p;
  document.documentElement.setAttribute('data-theme', t);
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', { light: '#0b4fa8', dark: '#16263b', blue: '#0a3a8c' }[t] || '#0b4fa8');
}
function setThemePref(v) { try { localStorage.setItem('rms_theme', v); } catch (e) { /* ignore */ } applyTheme(); }
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* ignore */ }
const APP_NAME = "Jiguda's Khatabook Pro";
const modeLabel = m => (m === 'Online' ? 'UPI' : m || '');

/* ---------- State ---------- */
const S = {
  user: null, token: null,
  data: { parties: [], entries: [], cash: [], expenses: [], bills: [], settings: {} },
  since: '', queue: [], failed: [], reminded: {},
  route: { name: 'parties' }, depth: 0,
  tab: 'customer', q: '',
  syncing: false, lastSync: '', idx: null, epoch: '',
  cb: null, ex: null, rep: null, out: { min: 0, sel: new Set(), fav: false }, cl: { months: 12, zeroOnly: true, sel: new Set() },
  binTab: 'parties', billQ: ''
};
const ACT = {};
const can = min => !!S.user && RANK[S.user.Role] >= RANK[min];
const setting = k => (S.data.settings && S.data.settings[k]) || '';

let persistT;
function persist() {
  clearTimeout(persistT);
  persistT = setTimeout(() => { DB.set('data', { data: S.data, since: S.since, epoch: S.epoch, user: S.user && S.user.UserID }).catch(() => {}); }, 300);
}
function persistQueue() { return DB.set('queue', { queue: S.queue, failed: S.failed }).catch(() => {}); }

/* ---------- HTML helpers (rich text) ---------- */
const OK_TAGS = new Set(['B', 'I', 'U', 'S', 'STRIKE', 'STRONG', 'EM', 'SPAN', 'FONT', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'IMG', 'H1', 'H2', 'H3', 'MARK', 'SUB', 'SUP', 'BLOCKQUOTE']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'SVG', 'MATH', 'TEXTAREA', 'SELECT', 'BUTTON', 'INPUT', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE']);
const OK_STYLE = ['color', 'background-color', 'background', 'font-weight', 'font-style', 'text-decoration', 'font-size', 'text-align'];

function cleanHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
  (function walk(node) {
    Array.from(node.childNodes).forEach(ch => {
      if (ch.nodeType === 3) return;
      if (ch.nodeType !== 1) { ch.remove(); return; }
      const tag = ch.tagName.toUpperCase();
      if (DROP_TAGS.has(tag)) { ch.remove(); return; }
      if (!OK_TAGS.has(tag)) {
        walk(ch);
        while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
        ch.remove();
        return;
      }
      let removed = false;
      Array.from(ch.attributes).forEach(a => {
        const n = a.name.toLowerCase();
        if (n === 'style') {
          const keep = [];
          a.value.split(';').forEach(d => {
            const i = d.indexOf(':'); if (i < 0) return;
            const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
            if (OK_STYLE.includes(k) && !/url\(|expression|javascript|@import/i.test(v)) keep.push(k + ':' + v);
          });
          if (keep.length) ch.setAttribute('style', keep.join(';')); else ch.removeAttribute('style');
        } else if (n === 'color' && tag === 'FONT') {
          /* keep */
        } else if (n === 'src' && tag === 'IMG') {
          if (!/^(https:\/\/|data:image\/)/i.test(a.value)) { ch.remove(); removed = true; }
        } else ch.removeAttribute(a.name);
      });
      if (!removed) walk(ch);
    });
  })(doc.body);
  return doc.body.innerHTML;
}
function htmlToText(html) {
  const h = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
  const d = new DOMParser().parseFromString(h, 'text/html');
  return (d.body.textContent || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
}
const atts = e => Array.isArray(e.Attachments) ? e.Attachments : parseJ(e.Attachments, []);

/* ---------- Billing maths (shared with bill form) ---------- */
function billTotals(items) {
  let taxable = 0, tax = 0;
  items.forEach(it => { const line = num(it.qty) * num(it.rate); taxable += line; tax += line * num(it.gst) / 100; });
  taxable = round2(taxable); tax = round2(tax);
  return { taxable, tax, total: round2(taxable + tax) };
}
const nl2br = t => esc(t).replace(/\r?\n/g, '<br>');
function billNoteHtml(billNo, items, note) {
  let h = '<b>Bill ' + esc(billNo) + '</b>';
  items.forEach(it => { h += '<br>' + nl2br(it.desc) + (it.qty !== 1 || it.gst ? '<br><i>Qty ' + it.qty + ' &times; ' + it.rate + (it.gst ? ' (+' + it.gst + '% GST)' : '') + '</i>' : ''); });
  if (note) h += '<br><i>' + nl2br(note) + '</i>';
  return h;
}
function localItems(d) {
  return (d.Items || []).map(it => ({ desc: String(it.desc || ''), qty: num(it.qty), rate: num(it.rate), gst: d.IsGst ? num(it.gst) : 0 })).filter(it => it.desc.trim() && it.qty > 0);
}
function cashDir(party, kind) {
  if (party.Type === 'customer' && kind === 'GOT') return 'IN';
  if (party.Type === 'supplier' && kind === 'GAVE') return 'OUT';
  return null;
}

/* ---------- Index (balances, search text) ---------- */
function reindex() {
  const bal = new Map(), lastTs = new Map(), lastDate = new Map(), byParty = new Map(), hay = new Map(), pmap = new Map();
  S.data.parties.forEach(p => {
    pmap.set(p.PartyID, p);
    if (p.Deleted === 'Y') return;
    bal.set(p.PartyID, num(p.OpeningBalance));
    lastTs.set(p.PartyID, p.CreatedAt || '');
    lastDate.set(p.PartyID, String(p.CreatedAt || '').slice(0, 10));
    byParty.set(p.PartyID, []);
  });
  S.data.entries.forEach(e => {
    if (e.Deleted === 'Y' || !bal.has(e.PartyID)) return;
    const pid = e.PartyID;
    bal.set(pid, bal.get(pid) + (e.Kind === 'GAVE' ? 1 : -1) * num(e.Amount));
    const ts = e.UpdatedAt || e.CreatedAt || '';
    if (ts > lastTs.get(pid)) lastTs.set(pid, ts);
    if (e.Date > lastDate.get(pid)) lastDate.set(pid, e.Date);
    byParty.get(pid).push(e);
    hay.set(e.EntryID, ((e.NoteText || '') + ' ' + e.Amount + ' ' + e.Date).toLowerCase());
  });
  byParty.forEach(list => list.sort((a, b) => (a.Date + (a.CreatedAt || '')).localeCompare(b.Date + (b.CreatedAt || ''))));
  S.idx = { bal, lastTs, lastDate, byParty, hay, pmap };
}
const balOf = pid => (S.idx && S.idx.bal.get(pid)) || 0;

/* ---------- API ---------- */
async function api(action, payload) {
  if (!CFG.API_URL || /PASTE_YOUR/.test(CFG.API_URL)) throw new Error('API_URL is not set in config.js');
  let res;
  try {
    res = await fetch(CFG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action, token: S.token }, payload || {}))
    });
  } catch (e) {
    const er = new Error('Cannot reach the server. Check your internet. If it keeps happening, the Apps Script web app access must be set to "Anyone".');
    er.net = true; throw er;
  }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Bad response from server'); }
  if (!j.ok) {
    const er = new Error(j.error || 'Request failed'); er.code = j.code;
    if (j.code === 'AUTH') forceLogout();
    throw er;
  }
  return j.data;
}
const isNetErr = e => !!e.net || (!e.code && /Failed to fetch|NetworkError|Load failed|network/i.test(e.message || ''));

/* ---------- Local (optimistic) application of queued operations ---------- */
const KEYMAP = { party: ['parties', 'PartyID'], entry: ['entries', 'EntryID'], cash: ['cash', 'CashID'], exp: ['expenses', 'ExpenseID'], bill: ['bills', 'BillID'] };
const EDITABLE = {
  party: ['Name', 'Phone', 'Notes', 'OpeningBalance'],
  entry: ['Date', 'Kind', 'Amount', 'NoteHTML', 'NoteText', 'Mode', 'Attachments', 'Summary'],
  cash: ['Date', 'Kind', 'Amount', 'Note', 'Category'],
  exp: ['Date', 'Category', 'Amount', 'Note', 'Mode']
};

function localRow(k, d) {
  switch (k) {
    case 'party': return { PartyID: d.PartyID, Type: d.Type === 'supplier' ? 'supplier' : 'customer', Name: String(d.Name || '').trim(), Phone: normPhone(d.Phone), Fav: '', Code: '', OpeningBalance: round2(d.OpeningBalance), Notes: d.Notes || '' };
    case 'entry': return {
      EntryID: d.EntryID, PartyID: d.PartyID, Date: d.Date, Kind: d.Kind === 'GOT' ? 'GOT' : 'GAVE', Amount: round2(d.Amount),
      NoteHTML: d.NoteHTML || '', NoteText: htmlToText(d.NoteHTML || ''), Mode: d.Mode || '', Summary: String(d.Summary || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      Attachments: JSON.stringify(Array.isArray(d.Attachments) ? d.Attachments : parseJ(d.Attachments, [])), Branch: ''
    };
    case 'cash': return { CashID: d.CashID, Date: d.Date, Kind: d.Kind === 'OUT' ? 'OUT' : 'IN', Amount: round2(d.Amount), Note: d.Note || '', Category: d.Category || '', Branch: '', LinkedEntryID: '' };
    case 'exp': return { ExpenseID: d.ExpenseID, Date: d.Date, Category: d.Category || 'Other', Amount: round2(d.Amount), Note: d.Note || '', Mode: modeLabel(d.Mode) === 'UPI' ? 'UPI' : 'Cash', Branch: '' };
  }
  return {};
}

function setDeleted(k, id, flag, tag) {
  const [key, idk] = KEYMAP[k];
  const r = S.data[key].find(x => x[idk] === id);
  if (!r) return;
  const now = iso();
  if (flag) { r.Deleted = 'Y'; r.DeletedAt = now; r.DeletedBy = S.user.Name + (tag ? '|' + tag : ''); }
  else { r.Deleted = ''; r.DeletedAt = ''; r.DeletedBy = ''; }
  r.UpdatedAt = now; r._pending = true;
  if (k === 'party') {
    S.data.entries.filter(e => e.PartyID === id && (flag ? e.Deleted !== 'Y' : String(e.DeletedBy || '').endsWith('|party'))).forEach(e => setDeleted('entry', e.EntryID, flag, 'party'));
  }
  if (k === 'entry') S.data.cash.filter(c => c.LinkedEntryID === id).forEach(c => { c.Deleted = flag ? 'Y' : ''; c.UpdatedAt = now; });
  if (k === 'bill') S.data.entries.filter(e => e.EntryID === id + '-G' || e.EntryID === id + '-P').forEach(e => setDeleted('entry', e.EntryID, flag, 'bill'));
}

function localCash(entry, want) {
  const party = S.idx.pmap.get(entry.PartyID); if (!party) return;
  const cid = 'c_' + entry.EntryID, dir = cashDir(party, entry.Kind), now = iso();
  const ex = S.data.cash.find(c => c.CashID === cid);
  if (want && dir) {
    const row = { CashID: cid, Date: entry.Date, Kind: dir, Amount: entry.Amount, Note: (party.Name + ' ' + (entry.NoteText || '')).slice(0, 200), Category: 'Ledger', Branch: entry.Branch, LinkedEntryID: entry.EntryID, Deleted: '', UpdatedAt: now, CreatedAt: now, CreatedBy: S.user.Name, _pending: true };
    if (ex) Object.assign(ex, row); else S.data.cash.push(row);
  } else if (ex) { ex.Deleted = 'Y'; ex.UpdatedAt = now; }
}

function addBillLocal(d, now) {
  const items = localItems(d);
  const t = billTotals(items);
  const paid = Math.min(round2(d.Paid), t.total);
  S.data.bills.push({
    BillID: d.BillID, BillNo: 'Pending', PartyID: d.PartyID, Date: d.Date, Items: JSON.stringify(items), Taxable: t.taxable, Tax: t.tax, Total: t.total, Paid: paid,
    IsGst: d.IsGst ? 'Y' : '', PartyGstin: d.PartyGstin || '', Note: d.Note || '', Branch: '', CreatedBy: S.user.Name, CreatedAt: now, UpdatedAt: now, PdfUrl: '', Deleted: '', _pending: true
  });
  const base = { PartyID: d.PartyID, Date: d.Date, Branch: '', CreatedBy: S.user.Name, CreatedAt: now, UpdatedAt: now, Deleted: '', Attachments: '[]', _pending: true };
  const gh = billNoteHtml('(pending)', items, d.Note);
  S.data.entries.push(Object.assign({}, base, { EntryID: d.BillID + '-G', Kind: 'GAVE', Amount: t.total, NoteHTML: gh, NoteText: htmlToText(gh), Mode: '' }));
  if (paid > 0) {
    const ph = 'Payment against bill <b>(pending)</b>';
    const pe = Object.assign({}, base, { EntryID: d.BillID + '-P', Kind: 'GOT', Amount: paid, NoteHTML: ph, NoteText: htmlToText(ph), Mode: d.Mode || '' });
    S.data.entries.push(pe);
    if (d.cashbook && d.Mode === 'Cash') { reindex(); localCash(pe, true); }
  }
}

function editBillLocal(d, now) {
  const b = S.data.bills.find(x => x.BillID === d.BillID); if (!b) return;
  const items = localItems(d);
  const t = billTotals(items);
  const paid = Math.min(round2(d.Paid), t.total);
  Object.assign(b, { Date: d.Date, Items: JSON.stringify(items), Taxable: t.taxable, Tax: t.tax, Total: t.total, Paid: paid, IsGst: d.IsGst ? 'Y' : '', PartyGstin: d.PartyGstin || '', Note: d.Note || '', PdfUrl: '', UpdatedAt: now, _pending: true });
  const gh = billNoteHtml(b.BillNo, items, d.Note);
  const g = S.data.entries.find(e => e.EntryID === d.BillID + '-G');
  if (g) Object.assign(g, { Date: d.Date, Amount: t.total, NoteHTML: gh, NoteText: htmlToText(gh), UpdatedAt: now, _pending: true });
  const pid = d.BillID + '-P';
  let pe = S.data.entries.find(e => e.EntryID === pid);
  if (paid > 0) {
    const ph = 'Payment against bill <b>' + esc(b.BillNo) + '</b>';
    const patch = { Date: d.Date, Amount: paid, NoteHTML: ph, NoteText: htmlToText(ph), Mode: d.Mode || '', Deleted: '', DeletedAt: '', DeletedBy: '', UpdatedAt: now, _pending: true };
    if (pe) Object.assign(pe, patch);
    else { pe = Object.assign({ EntryID: pid, PartyID: b.PartyID, Kind: 'GOT', CreatedAt: now, CreatedBy: S.user.Name, Attachments: '[]', Branch: '' }, patch); S.data.entries.push(pe); }
    reindex(); localCash(pe, !!d.cashbook && d.Mode === 'Cash');
  } else if (pe && pe.Deleted !== 'Y') setDeleted('entry', pid, true, 'edit');
}

function applyLocal(op) {
  const [k, verb] = op.type.split('.');
  const d = op.data, now = iso();
  if (k === 'party' && verb === 'batchDelete') { (d.ids || []).forEach(id => setDeleted('party', id, true)); return; }
  if (k === 'bill' && verb === 'edit') { editBillLocal(d, now); return; }
  const [key, idk] = KEYMAP[k];
  const arr = S.data[key];
  const find = id => arr.find(r => r[idk] === id);
  if (verb === 'add') {
    if (k === 'bill') { addBillLocal(d, now); return; }
    const row = Object.assign({ Deleted: '', CreatedAt: now, UpdatedAt: now, CreatedBy: S.user.Name, _pending: true }, localRow(k, d));
    arr.push(row);
    if (k === 'entry' && d.cashbook && row.Mode === 'Cash') { reindex(); localCash(row, true); }
  } else if (verb === 'edit') {
    const r = find(d[idk]); if (!r) return;
    const merged = Object.assign({}, r, d);
    const nr = localRow(k, merged);
    EDITABLE[k].forEach(f => { r[f] = nr[f]; });
    r.UpdatedAt = now; r._pending = true;
    if (k === 'entry') { reindex(); localCash(r, !!d.cashbook && r.Mode === 'Cash'); }
  } else if (verb === 'fav') {
    const r = find(d.PartyID); if (r) { r.Fav = d.Fav ? 'Y' : ''; r.UpdatedAt = now; r._pending = true; }
  } else if (verb === 'delete') setDeleted(k, d[idk], true);
  else if (verb === 'restore') setDeleted(k, d[idk], false);
}

function revertLocal(op) {
  const [k, verb] = op.type.split('.');
  if (verb !== 'add') return;
  const [key, idk] = KEYMAP[k];
  const id = op.data[idk];
  S.data[key] = S.data[key].filter(r => !(r[idk] === id && r._pending));
  if (k === 'bill') S.data.entries = S.data.entries.filter(e => !(e._pending && (e.EntryID === id + '-G' || e.EntryID === id + '-P')));
  if (k === 'entry' || k === 'bill') S.data.cash = S.data.cash.filter(c => !(c._pending && String(c.CashID).startsWith('c_' + id)));
}

function enqueue(type, data) {
  const op = { id: uid('op'), type: type, data: data, ts: Date.now() };
  S.queue.push(op);
  applyLocal(op);
  reindex(); persist(); persistQueue(); render(); setPill(); syncSoon();
  return op;
}

/* ---------- Sync ---------- */
let syncT;
function syncSoon() { clearTimeout(syncT); syncT = setTimeout(() => syncNow(), 500); }

async function syncNow(manual) {
  if (S.syncing || !S.token) return;
  if (!navigator.onLine) { if (manual) toast('You are offline'); setPill(); return; }
  S.syncing = true; setPill();
  let failedBefore = S.failed.length;
  try {
    while (S.queue.length) {
      const batch = S.queue.slice(0, 5);
      const res = await api('sync', { ops: batch.map(o => ({ id: o.id, type: o.type, data: o.data })) });
      const byId = new Map(res.results.map(r => [r.id, r]));
      batch.forEach(op => {
        const r = byId.get(op.id);
        if (!(r && r.ok)) { S.failed.push({ op: op, error: (r && r.error) || 'Unknown error' }); revertLocal(op); }
      });
      S.queue.splice(0, batch.length);
      await persistQueue();
    }
    if (S.failed.length > failedBefore) S.since = '';
    await pull();
    S.lastSync = iso();
  } catch (e) {
    if (manual || !isNetErr(e)) toast(e.message);
  } finally {
    S.syncing = false; reindex(); setPill(); render(true);
  }
}

async function pull() {
  let r = await api('pull', { since: S.since });
  if (S.since && S.epoch && r.epoch && r.epoch !== S.epoch) { S.since = ''; r = await api('pull', { since: '' }); }
  if (r.epoch) S.epoch = r.epoch;
  const D = S.data;
  const full = !S.since;
  const sets = [['parties', 'PartyID'], ['entries', 'EntryID'], ['cash', 'CashID'], ['expenses', 'ExpenseID'], ['bills', 'BillID']];
  sets.forEach(([k, idk]) => {
    const incoming = r[k] || [];
    if (full) D[k] = D[k].filter(x => x._pending);
    const m = new Map(D[k].map((x, i) => [x[idk], i]));
    incoming.forEach(row => {
      if (m.has(row[idk])) D[k][m.get(row[idk])] = row;
      else { m.set(row[idk], D[k].length); D[k].push(row); }
    });
  });
  D.settings = r.settings || D.settings;
  S.since = r.now;
  reindex(); persist();
}

/* ---------- Router ---------- */
function go(name, params) {
  S.route = Object.assign({ name: name }, params || {});
  S.depth++;
  history.pushState({ route: S.route, depth: S.depth }, '');
  closeAllModals(); render(); window.scrollTo(0, 0);
}
function back() { if (S.depth > 0) history.back(); else { S.route = { name: 'parties' }; render(); } }
window.addEventListener('popstate', e => {
  closeAllModals();
  S.route = (e.state && e.state.route) || { name: 'parties' };
  S.depth = (e.state && e.state.depth) || 0;
  render();
});

function setBar(title, opts) {
  opts = opts || {};
  $('#title').textContent = title;
  $('#backBtn').hidden = !opts.back;
  $('#barActions').innerHTML = opts.actions || '';
}

const NAV = [
  { r: 'parties', l: 'Parties', i: '\uD83D\uDC65', min: 'staff' },
  { r: 'bills', l: 'Bills', i: '\uD83E\uDDFE', min: 'staff' },
  { r: 'outstanding', l: 'Outstanding', i: '\uD83D\uDCB0', min: 'staff' },
  { r: 'more', l: 'More', i: '\u2026', min: 'staff' }
];
const NAV_GROUP = { party: 'parties', bill: 'bills', cash: 'more', expenses: 'more', reports: 'more', cleanup: 'more', bin: 'more', users: 'more', settings: 'more', import: 'more', sync: 'more', theme: 'more' };
function renderNav() {
  $('#nav').innerHTML = NAV.filter(n => can(n.min)).map(n => `<button data-act="nav" data-r="${n.r}" id="nav-${n.r}"><span class="ni">${n.i}</span>${n.l}</button>`).join('');
}
ACT.nav = d => { S.route = { name: d.r }; S.depth++; history.pushState({ route: S.route, depth: S.depth }, ''); closeAllModals(); render(); window.scrollTo(0, 0); };
ACT.back = () => back();
ACT.goSync = () => go('sync');

function render(soft) {
  if (!S.user) return;
  const r = S.route;
  const fn = ROUTES[r.name] || ROUTES.parties;
  const group = NAV_GROUP[r.name] || r.name;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.id === 'nav-' + group));
  fn(r, !!soft);
  setPill();
}

/* ---------- Modals / toast ---------- */
function openModal(html, opts) {
  const m = document.createElement('div');
  m.className = 'modal' + (opts && opts.full ? ' full' : '');
  m.innerHTML = '<div class="sheet">' + html + '</div>';
  m.addEventListener('mousedown', ev => { if (ev.target === m && !(opts && opts.sticky)) m.remove(); });
  $('#modals').appendChild(m);
  return m;
}
function closeModal(m) { const t = m || $('#modals').lastElementChild; if (t) t.remove(); }
function closeAllModals() { $('#modals').innerHTML = ''; }
ACT.closeModal = (d, el) => { const m = el.closest('.modal'); if (m) m.remove(); };

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800);
}
function confirmBox(msg, okLabel, cb, danger) {
  const m = openModal(`<h3>Please confirm</h3><p>${esc(msg)}</p>
    <div class="btns"><button class="btn" data-act="closeModal">Cancel</button><button class="btn ${danger ? 'red' : 'green'}" id="cfOk">${esc(okLabel || 'OK')}</button></div>`);
  $('#cfOk', m).onclick = () => { m.remove(); cb(); };
}
function lightbox(src) {
  const l = document.createElement('div'); l.className = 'lightbox';
  l.innerHTML = '<img alt="">'; l.firstChild.src = src;
  l.onclick = () => l.remove();
  document.body.appendChild(l);
}

function setPill() {
  const p = $('#pill'); if (!p) return;
  const n = S.queue.length, f = S.failed.length;
  let t, c = '';
  if (f) { t = '⚠ ' + f + ' failed'; c = 'bad'; }
  else if (!navigator.onLine) { t = 'Offline' + (n ? ' · ' + n + ' pending' : ''); c = 'off'; }
  else if (S.syncing) { t = 'Syncing…'; c = 'warn'; }
  else if (n) { t = n + ' pending'; c = 'warn'; }
  else t = '✓ Synced';
  p.textContent = t; p.className = 'pill ' + c;
}
window.addEventListener('online', () => { setPill(); syncSoon(); });
window.addEventListener('offline', setPill);

/* ---------- Session ---------- */
function showLogin(msg) {
  $('#boot').hidden = true; $('#app').hidden = true; $('#customer').hidden = true; $('#login').hidden = false;
  $('#loginMsg').textContent = msg || 'Log in with your phone number and PIN';
}
function showApp() {
  $('#boot').hidden = true; $('#login').hidden = true; $('#customer').hidden = true; $('#app').hidden = false;
  renderNav();
  S.route = { name: 'parties' }; S.depth = 0;
  history.replaceState({ route: S.route, depth: 0 }, '');
  render();
}
function forceLogout() {
  S.token = null; DB.del('session').catch(() => {});
  showLogin('Session expired. Please log in again.');
}
async function logout(force) {
  if (S.queue.length && !force) {
    confirmBox(S.queue.length + ' change(s) are not synced yet and will be lost if you log out. Log out anyway?', 'Log out', () => logout(true), true);
    return;
  }
  await Promise.all(['session', 'data', 'queue'].map(k => DB.del(k).catch(() => {})));
  S.user = null; S.token = null; S.queue = []; S.failed = []; S.since = '';
  S.data = { parties: [], entries: [], cash: [], expenses: [], bills: [], settings: {} };
  closeAllModals(); showLogin();
}
ACT.logout = () => logout(false);

async function doLogin(ev) {
  ev.preventDefault();
  const btn = $('#lBtn'), err = $('#lErr');
  err.textContent = ''; btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    S.token = null;
    const r = await api('login', { phone: $('#lPhone').value, pin: $('#lPin').value });
    const prev = await DB.get('data');
    if (prev && prev.user && prev.user !== r.user.UserID) {
      S.data = { parties: [], entries: [], cash: [], expenses: [], bills: [], settings: {} }; S.since = ''; S.queue = []; S.failed = [];
      await DB.del('data'); await DB.del('queue');
    }
    S.token = r.token; S.user = r.user;
    await DB.set('session', { token: r.token, user: r.user });
    $('#lPin').value = '';
    $('#boot').hidden = false;
    try { await pull(); } catch (e) { toast('Could not load data: ' + e.message); }
    showApp(); syncSoon();
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Log in';
  }
}

/* ---------- Global events ---------- */
document.addEventListener('click', e => {
  const img = e.target.closest && e.target.closest('img');
  if (img && img.closest('.note,.atts,.rtv')) { lightbox(img.src); return; }
  if (e.target.closest('a[href]')) return;
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const fn = ACT[t.dataset.act];
  if (fn) { e.preventDefault(); try { fn(t.dataset, t, e); } catch (er) { console.error(er); toast('Error: ' + er.message); } }
});

/* ---------- Start ---------- */
async function init() {
  applyTheme();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  const qs = new URLSearchParams(location.search);
  if (qs.get('c')) { openCustomerView(qs.get('c')); return; }
  $('#loginForm').addEventListener('submit', doLogin);
  try {
    const sess = await DB.get('session');
    const dat = await DB.get('data');
    const q = await DB.get('queue');
    S.reminded = (await DB.get('reminded')) || {};
    if (sess && sess.token) {
      S.user = sess.user; S.token = sess.token;
      if (dat && dat.data) { S.data = Object.assign(S.data, dat.data); S.since = dat.since || ''; S.epoch = dat.epoch || ''; }
      if (q) { S.queue = q.queue || []; S.failed = q.failed || []; }
      ['parties', 'entries', 'cash', 'expenses', 'bills'].forEach(k => { if (!Array.isArray(S.data[k])) S.data[k] = []; });
      reindex(); showApp(); syncNow();
    } else showLogin();
  } catch (e) {
    console.error(e); showLogin();
  }
}
