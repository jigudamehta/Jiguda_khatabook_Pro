'use strict';
/* =====================================================================
   pages.js - all screens
   ===================================================================== */
const ROUTES = {};
const page = html => { $('#page').innerHTML = html; };
const fabHtml = (act, label) => `<button class="fab" data-act="${act}">${label}</button>`;
const fold = s => String(s || '').toLowerCase();
const hi = (text, q) => {
  const t = esc(text); if (!q) return t;
  const i = fold(text).indexOf(q); if (i < 0) return t;
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
};
function snippet(text, q) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const i = fold(t).indexOf(q);
  if (i < 0) return t.slice(0, 90);
  const a = Math.max(0, i - 30);
  return (a > 0 ? '…' : '') + t.slice(a, i + q.length + 50) + (i + q.length + 50 < t.length ? '…' : '');
}
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/* ============================ PARTIES ============================ */
ROUTES.parties = function (r, soft) {
  setBar(APP_NAME, { actions: '<button class="ib" data-act="logout" title="Log out">&#9099;</button>' });
  const type = S.tab;
  const q = fold(S.q).trim();
  const all = S.data.parties.filter(p => p.Deleted !== 'Y');
  let youGet = 0, youGive = 0;
  all.forEach(p => { const b = balOf(p.PartyID); if (b > 0.004) youGet += b; else if (b < -0.004) youGive += -b; });

  const tabList = all.filter(p => p.Type === type);
  let rows = [];
  if (q) {
    tabList.forEach(p => {
      const nameHit = fold(p.Name).includes(q) || (p.Phone || '').includes(q);
      let hitE = null, n = 0;
      (S.idx.byParty.get(p.PartyID) || []).forEach(e => { if (S.idx.hay.get(e.EntryID).includes(q)) { n++; hitE = e; } });
      if (nameHit || n) rows.push({ p: p, nameHit: nameHit, n: n, e: hitE });
    });
  } else rows = tabList.map(p => ({ p: p }));
  rows.sort((a, b) => ((b.p.Fav === 'Y') - (a.p.Fav === 'Y')) || ((S.idx.lastTs.get(b.p.PartyID) || '').localeCompare(S.idx.lastTs.get(a.p.PartyID) || '')));

  const shown = rows.slice(0, 150);
  const body = shown.map(x => {
    const p = x.p, b = balOf(p.PartyID);
    const cls = b > 0.004 ? 'get' : b < -0.004 ? 'give' : '';
    const lbl = b > 0.004 ? "YOU'LL GET" : b < -0.004 ? "YOU'LL GIVE" : 'SETTLED';
    return `<div class="row party ${cls}" data-act="openParty" data-id="${esc(p.PartyID)}" style="cursor:pointer">
      <div class="av">${esc(initials(p.Name))}</div>
      <div class="mid"><div class="nm">${hi(p.Name, q)}</div>
        <div class="sub">${p.Phone ? hi(p.Phone, q) + ' · ' : ''}${ago(S.idx.lastTs.get(p.PartyID))}</div>
        ${x.n ? `<span class="snip">${x.n} match${x.n > 1 ? 'es' : ''} in entries: ${hi(snippet(x.e.NoteText, q), q)}</span>` : ''}
        <div class="minis"><button class="mini p1" data-act="link" data-id="${esc(p.PartyID)}" title="Share link">&#128279;</button><button class="mini p2" data-act="remind" data-id="${esc(p.PartyID)}" title="Reminder">&#128276;</button><button class="mini p3" data-act="statement" data-id="${esc(p.PartyID)}" title="Report">&#128196;</button><button class="mini p4" data-act="call" data-id="${esc(p.PartyID)}" title="Call">&#128222;</button></div></div>
      <button class="star ${p.Fav === 'Y' ? 'on' : ''}" data-act="fav" data-id="${esc(p.PartyID)}" aria-label="Favourite">&#9733;</button>
      <div class="amt">${rs(b)}<small>${lbl}</small></div></div>`;
  }).join('');

  page(`<div class="summary"><div><small>You will give</small><b class="grn">${rs(youGive)}</b></div><div><small>You will get</small><b class="red">${rs(youGet)}</b></div></div>
    <div class="tabs"><button data-act="tab" data-t="customer" class="${type === 'customer' ? 'on' : ''}">Customers</button><button data-act="tab" data-t="supplier" class="${type === 'supplier' ? 'on' : ''}">Suppliers</button></div>
    <div class="searchrow"><input id="qBox" type="search" placeholder="Search name, mobile, PNR or any text in entries…" value="${esc(S.q)}" autocomplete="off"></div>
    ${q ? `<div class="sub" style="margin:2px 4px">${rows.length} ledger(s) found</div>` : ''}
    <div class="list">${body || '<div class="empty">' + (q ? 'No ledger or entry matches "' + esc(S.q) + '"' : 'No ' + type + 's yet. Tap the button below to add one.') + '</div>'}</div>
    ${rows.length > shown.length ? '<div class="sub" style="text-align:center">Showing first 150. Refine your search.</div>' : ''}
    ${fabHtml('addParty', '+ ADD ' + (type === 'supplier' ? 'SUPPLIER' : 'CUSTOMER'))}`);
  const box = $('#qBox');
  box.addEventListener('input', () => { S.q = box.value; const pos = box.selectionStart; clearTimeout(box._t); box._t = setTimeout(() => { ROUTES.parties(S.route, true); const b2 = $('#qBox'); b2.focus(); b2.setSelectionRange(pos, pos); }, 180); });
  if (soft && document.activeElement === document.body) { /* keep */ }
};
ACT.tab = d => { S.tab = d.t; S.q = ''; render(); };
ACT.addParty = () => partyForm(S.tab);
ACT.openParty = d => go('party', { id: d.id });
ACT.fav = (d, el, ev) => {
  ev.stopPropagation();
  const p = S.idx.pmap.get(d.id); if (!p) return;
  enqueue('party.fav', { PartyID: d.id, Fav: p.Fav !== 'Y' });
};

/* ============================ PARTY LEDGER ============================ */
ROUTES.party = function (r) {
  const p = S.idx.pmap.get(r.id);
  if (!p || p.Deleted === 'Y') { S.route = { name: 'parties' }; return render(); }
  setBar(p.Name, { back: true, actions: `<button class="ib" data-act="call" data-id="${esc(p.PartyID)}" title="Call">&#128222;</button><button class="ib" data-act="menu" data-id="${esc(p.PartyID)}" title="More">&#8942;</button>` });
  const b = balOf(p.PartyID);
  const list = S.idx.byParty.get(p.PartyID) || [];
  const q = fold(r.q || '').trim();
  // running balances
  let run = num(p.OpeningBalance); const withBal = new Map();
  list.forEach(e => { run = round2(run + (e.Kind === 'GAVE' ? 1 : -1) * num(e.Amount)); withBal.set(e.EntryID, run); });
  let view = list.slice().reverse();
  if (q) view = view.filter(e => S.idx.hay.get(e.EntryID).includes(q));
  let lastDay = '';
  const items = view.map((e, ix) => {
    let head = '';
    if (e.Date !== lastDay) { lastDay = e.Date; head = `<div class="dh">${fmtDate(e.Date)}${e.Date === todayStr() ? ' · Today' : ''}</div>`; }
    const bal = withBal.get(e.EntryID);
    const al = atts(e).filter(a => !a.inline);
    const imgs = (e.NoteHTML || '').match(/<img/gi);
    const gave = e.Kind === 'GAVE';
    return head + `<div class="entry ${ix % 2 ? 'alt' : ''} ${q ? 'hit' : ''}" data-act="viewEntry" data-id="${esc(e.EntryID)}">
      <div class="eleft"><div class="et">${fmtDate(e.Date)} · ${fmtTime(e.CreatedAt)}${e.Mode ? ' · ' + esc(modeLabel(e.Mode)) : ''}${e._pending ? ' <span class="pend">• pending sync</span>' : ''}</div>
        <span class="balbadge ${bal < -0.004 ? 'g' : ''}">Bal. ${rs(bal)}${bal > 0.004 ? ' Dr' : bal < -0.004 ? ' Cr' : ''}</span>
        <div class="note">${cleanHtml(e.NoteHTML)}</div>
        ${(al.length || imgs) ? `<div class="sub">${al.length ? '&#128206; ' + al.length + ' attachment' + (al.length > 1 ? 's' : '') : ''}${imgs ? ' &#128444;' : ''}</div>` : ''}</div>
      <div class="ec gave">${gave ? rs(e.Amount) : ''}</div><div class="ec got">${gave ? '' : rs(e.Amount)}</div></div>`;
  }).join('');
  const opening = num(p.OpeningBalance);
  page(`<div class="balcard"><div><div class="sub">${b > 0.004 ? 'You will get' : b < -0.004 ? 'You will give' : 'Settled'}</div><b class="${b > 0.004 ? 'red' : 'grn'}">${rs(b)}</b></div>
      <button class="star ${p.Fav === 'Y' ? 'on' : ''}" style="font-size:26px" data-act="fav" data-id="${esc(p.PartyID)}">&#9733;</button></div>
    <div class="actions">
      <button class="p3" data-act="statement" data-id="${esc(p.PartyID)}"><span class="ai">&#128196;</span>Report</button>
      <button class="p2" data-act="remind" data-id="${esc(p.PartyID)}"><span class="ai">&#128276;</span>Reminder</button>
      <button class="p5" data-act="reminderImg" data-id="${esc(p.PartyID)}"><span class="ai">&#128444;</span>Image</button>
      <button class="p1" data-act="link" data-id="${esc(p.PartyID)}"><span class="ai">&#128279;</span>Link</button>
      ${p.Type === 'customer' ? `<button class="p4" data-act="newBillFor" data-id="${esc(p.PartyID)}"><span class="ai">&#129534;</span>Bill</button>` : ''}
    </div>
    <div class="searchrow"><input id="lq" type="search" placeholder="Search inside this ledger…" value="${esc(r.q || '')}"></div>
    <div class="elhead"><span>ENTRIES</span><span class="g">YOU GAVE</span><span class="t">YOU GOT</span></div>
    ${items || '<div class="empty">' + (q ? 'No entry matches' : 'No entries yet') + '</div>'}
    ${opening && !q ? `<div class="dh">Opening balance: ${rs(opening)} ${opening > 0 ? '(you will get)' : '(you will give)'}</div>` : ''}
    <div class="bottombar"><button class="btn red" data-act="gave" data-id="${esc(p.PartyID)}">You gave ₹</button><button class="btn green" data-act="got" data-id="${esc(p.PartyID)}">You got ₹</button></div>`);
  const box = $('#lq');
  box.addEventListener('input', () => { S.route.q = box.value; const pos = box.selectionStart; clearTimeout(box._t); box._t = setTimeout(() => { ROUTES.party(S.route); const b2 = $('#lq'); b2.focus(); b2.setSelectionRange(pos, pos); }, 180); });
};
ACT.gave = d => entryForm(d.id, 'GAVE');
ACT.got = d => entryForm(d.id, 'GOT');
ACT.call = d => { const p = S.idx.pmap.get(d.id); if (p && p.Phone) location.href = 'tel:' + p.Phone; else toast('No mobile number saved'); };
ACT.newBillFor = d => billForm({ PartyID: d.id });

/* ============================ OUTSTANDING ============================ */
ROUTES.outstanding = function () {
  setBar('Outstanding', {});
  const o = S.out;
  let due = S.data.parties.filter(p => p.Deleted !== 'Y' && p.Type === 'customer' && balOf(p.PartyID) > Math.max(o.min, 0.004));
  if (o.fav) due = due.filter(p => p.Fav === 'Y');
  due.sort((a, b) => balOf(b.PartyID) - balOf(a.PartyID));
  const total = due.reduce((s, p) => s + balOf(p.PartyID), 0);
  const selTotal = due.filter(p => o.sel.has(p.PartyID)).reduce((s, p) => s + balOf(p.PartyID), 0);
  const today = todayStr();
  page(`<div class="kpis"><div class="kpi"><small>Total outstanding</small><b class="red">${rs(total)}</b></div><div class="kpi"><small>Customers who owe</small><b>${due.length}</b></div></div>
    <div class="chips"><span class="chip ${o.min === 0 && !o.fav ? 'on' : ''}" data-act="outF" data-v="all">All</span><span class="chip ${o.min === 1000 ? 'on' : ''}" data-act="outF" data-v="1000">Above ₹1,000</span>
      <span class="chip ${o.min === 5000 ? 'on' : ''}" data-act="outF" data-v="5000">Above ₹5,000</span><span class="chip ${o.fav ? 'on' : ''}" data-act="outF" data-v="fav">&#9733; Favourites</span></div>
    <div class="btns"><button class="btn sm" data-act="outAll">Select all</button><button class="btn sm" data-act="outNone">Clear</button><button class="btn sm" data-act="outNotToday">Select not reminded today</button></div>
    <div class="list">${due.map(p => `<label class="row" style="margin:0;color:inherit"><input type="checkbox" style="width:auto" data-out="${esc(p.PartyID)}" ${o.sel.has(p.PartyID) ? 'checked' : ''}>
      <div class="mid"><div class="nm">${esc(p.Name)}</div><div class="sub">${esc(p.Phone || 'No mobile')}${S.reminded[p.PartyID] === today ? ' · <span class="grn">reminded today</span>' : S.reminded[p.PartyID] ? ' · last reminded ' + fmtDate(S.reminded[p.PartyID]) : ''}</div></div>
      <div class="amt red">${rs(balOf(p.PartyID))}</div></label>`).join('') || '<div class="empty">Nobody owes you anything 🎉</div>'}</div>
    <div class="bottombar"><button class="btn green" data-act="outSend" ${o.sel.size ? '' : 'disabled'}>Send reminders (${o.sel.size}) ${o.sel.size ? '· ' + rs(selTotal) : ''}</button></div>`);
  $$('[data-out]').forEach(c => c.addEventListener('change', () => { if (c.checked) S.out.sel.add(c.dataset.out); else S.out.sel.delete(c.dataset.out); ROUTES.outstanding(); }));
  S.out._due = due.map(p => p.PartyID);
};
ACT.outF = d => { S.out.min = d.v === '1000' ? 1000 : d.v === '5000' ? 5000 : 0; S.out.fav = d.v === 'fav'; S.out.sel = new Set(); render(); };
ACT.outAll = () => { S.out._due.forEach(id => S.out.sel.add(id)); render(); };
ACT.outNone = () => { S.out.sel = new Set(); render(); };
ACT.outNotToday = () => { S.out.sel = new Set(S.out._due.filter(id => S.reminded[id] !== todayStr())); render(); };
ACT.outSend = () => startReminderQueue(Array.from(S.out.sel));

/* ============================ BILLS ============================ */
function billStatus(b) { const due = round2(num(b.Total) - num(b.Paid)); return due <= 0 ? ['paid', 'Paid'] : num(b.Paid) > 0 ? ['part', 'Part paid'] : ['unpaid', 'Unpaid']; }
ROUTES.bills = function () {
  setBar('Bills', {});
  const q = fold(S.billQ).trim();
  const list = S.data.bills.filter(b => b.Deleted !== 'Y').sort((a, b) => (b.Date + b.CreatedAt).localeCompare(a.Date + a.CreatedAt))
    .map(b => ({ b: b, p: S.idx.pmap.get(b.PartyID) })).filter(x => x.p && (!q || fold(x.p.Name + ' ' + x.b.BillNo + ' ' + x.b.Items).includes(q)));
  const month = todayStr().slice(0, 7);
  const mSales = S.data.bills.filter(b => b.Deleted !== 'Y' && String(b.Date).slice(0, 7) === month).reduce((s, b) => s + num(b.Total), 0);
  page(`<div class="kpis"><div class="kpi"><small>This month's sales</small><b>${rs(mSales)}</b></div><div class="kpi"><small>Bills</small><b>${list.length}</b></div></div>
    <div class="searchrow"><input id="bq" type="search" placeholder="Search bills…" value="${esc(S.billQ)}"></div>
    <div class="list">${list.slice(0, 200).map(x => { const st = billStatus(x.b); return `<div class="row" data-act="openBill" data-id="${esc(x.b.BillID)}" style="cursor:pointer">
      <div class="mid"><div class="nm">${esc(x.p.Name)}</div><div class="sub">${esc(x.b.BillNo)}${x.b.IsGst === 'Y' ? ' · GST' : ''} · ${fmtDate(x.b.Date)}</div></div>
      <div class="amt">${rs(x.b.Total)}<br><span class="status ${st[0]}">${st[1]}</span></div></div>`; }).join('') || '<div class="empty">No bills yet</div>'}</div>
    ${fabHtml('newBill', '+ ADD BILL')}`);
  const box = $('#bq');
  box.addEventListener('input', () => { S.billQ = box.value; const pos = box.selectionStart; clearTimeout(box._t); box._t = setTimeout(() => { ROUTES.bills(); const b2 = $('#bq'); b2.focus(); b2.setSelectionRange(pos, pos); }, 180); });
};
ACT.newBill = () => billForm();
ACT.openBill = d => go('bill', { id: d.id });

ROUTES.bill = function (r) {
  const b = S.data.bills.find(x => x.BillID === r.id);
  if (!b) { S.route = { name: 'bills' }; return render(); }
  const p = S.idx.pmap.get(b.PartyID) || { Name: '?', Phone: '' };
  setBar(b._pending ? 'Bill (syncing…)' : b.BillNo, { back: true });
  const items = parseJ(b.Items, []), st = billStatus(b), due = round2(num(b.Total) - num(b.Paid));
  page(`<div class="card"><div class="row"><div class="mid"><div class="nm">${esc(p.Name)}</div><div class="sub">${fmtDate(b.Date)} · ${b.IsGst === 'Y' ? 'GST bill' : 'Non-GST bill'}${b.PartyGstin ? ' · ' + esc(b.PartyGstin) : ''}</div></div><span class="status ${st[0]}">${st[1]}</span></div></div>
    <div class="card"><table class="t"><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th>${b.IsGst === 'Y' ? '<th class="r">GST</th>' : ''}<th class="r">Amount</th></tr>
      ${items.map(i => `<tr><td>${esc(i.desc).replace(/\n/g, '<br>')}</td><td class="r">${i.qty}</td><td class="r">${NF.format(i.rate)}</td>${b.IsGst === 'Y' ? '<td class="r">' + i.gst + '%</td>' : ''}<td class="r">${NF.format(i.qty * i.rate)}</td></tr>`).join('')}</table>
      <div style="margin-top:10px;text-align:right">
        ${b.IsGst === 'Y' ? `<div>Taxable ${rs(b.Taxable)}</div><div>CGST ${rs(num(b.Tax) / 2)} · SGST ${rs(num(b.Tax) / 2)}</div>` : ''}
        <div class="b" style="font-size:18px">Total ${rs(b.Total)}</div><div>Paid ${rs(b.Paid)}</div><div class="${due > 0 ? 'red' : 'grn'} b">Due ${rs(due)}</div></div></div>
    ${b.Note ? `<div class="card sub">${esc(b.Note)}</div>` : ''}
    <div class="btns"><button class="btn p3" data-act="billPrint" data-id="${esc(b.BillID)}">Print / Save PDF</button><button class="btn p2" data-act="billWa" data-id="${esc(b.BillID)}">PDF link on WhatsApp</button></div>
    ${can('manager') ? `<div class="btns"><button class="btn p5" data-act="billEdit" data-id="${esc(b.BillID)}">Edit bill</button></div>` : ''}
    <div class="btns"><button class="btn out" data-act="openParty" data-id="${esc(b.PartyID)}">Open ledger</button>${can('manager') ? `<button class="btn red" data-act="billDel" data-id="${esc(b.BillID)}">Delete bill</button>` : ''}</div>
    ${b._pending ? '<div class="pend">Waiting to sync. The bill number is given by the server.</div>' : ''}`);
};
ACT.billPrint = d => { const b = S.data.bills.find(x => x.BillID === d.id); if (b) printHtml(billPrintHtml(b)); };
ACT.billEdit = d => { const b = S.data.bills.find(x => x.BillID === d.id); if (!b) return; if (b._pending) return toast('Wait for the bill to sync first'); billForm({ edit: b }); };
ACT.billWa = async d => {
  const b = S.data.bills.find(x => x.BillID === d.id); const p = S.idx.pmap.get(b.PartyID);
  if (b._pending) return toast('Wait for the bill to sync first');
  if (!navigator.onLine) return toast('You need internet for this');
  toast('Creating PDF…');
  try {
    const r = await api('billPdf', { BillID: d.id });
    await pull(); render(true);
    openWa(waLink(p.Phone, billMsg(b, p, r.url)));
  } catch (e) { toast(e.message); }
};
ACT.billDel = d => confirmBox('Delete this bill and its ledger entries? It goes to the recycle bin.', 'Delete', () => { enqueue('bill.delete', { BillID: d.id }); S.route = { name: 'bills' }; render(); toast('Deleted'); }, true);

/* ============================ CASHBOOK ============================ */
function periodRange(per) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if (per === 'today') return [todayStr(), todayStr()];
  if (per === 'week') { const d = new Date(n); d.setDate(n.getDate() - ((n.getDay() + 6) % 7)); return [dateStr(d), todayStr()]; }
  if (per === 'month') return [dateStr(new Date(y, m, 1)), dateStr(new Date(y, m + 1, 0))];
  if (per === 'lastmonth') return [dateStr(new Date(y, m - 1, 1)), dateStr(new Date(y, m, 0))];
  if (per === 'year') return [y + '-01-01', y + '-12-31'];
  return ['0000-01-01', '9999-12-31'];
}
const PERIODS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['all', 'All']];
const chipsHtml = (act, cur) => '<div class="chips">' + PERIODS.map(p => `<span class="chip ${cur === p[0] ? 'on' : ''}" data-act="${act}" data-v="${p[0]}">${p[1]}</span>`).join('') + '</div>';

ROUTES.cash = function () {
  setBar('Cashbook', { back: true });
  const [from, to] = periodRange(S.cb || (S.cb = 'today'));
  const all = S.data.cash.filter(c => c.Deleted !== 'Y');
  const rows = all.filter(c => c.Date >= from && c.Date <= to).sort((a, b) => (b.Date + b.CreatedAt).localeCompare(a.Date + a.CreatedAt));
  const before = all.filter(c => c.Date < from).reduce((s, c) => s + (c.Kind === 'IN' ? 1 : -1) * num(c.Amount), 0);
  const inn = rows.filter(c => c.Kind === 'IN').reduce((s, c) => s + num(c.Amount), 0), out = rows.filter(c => c.Kind === 'OUT').reduce((s, c) => s + num(c.Amount), 0);
  page(`${chipsHtml('cbP', S.cb)}
    <div class="kpis"><div class="kpi"><small>Cash IN</small><b class="grn">${rs(inn)}</b></div><div class="kpi"><small>Cash OUT</small><b class="red">${rs(out)}</b></div>
      <div class="kpi"><small>Opening</small><b>${rs(before)}</b></div><div class="kpi"><small>Closing balance</small><b>${rs(before + inn - out)}</b></div></div>
    <div class="list">${rows.map(c => `<div class="row" ${c.LinkedEntryID ? '' : `data-act="cashOpen" data-id="${esc(c.CashID)}"`} style="cursor:${c.LinkedEntryID ? 'default' : 'pointer'}">
      <div class="mid"><div class="nm">${esc(c.Category || (c.Kind === 'IN' ? 'Cash in' : 'Cash out'))}</div><div class="sub">${fmtDate(c.Date)} · ${esc((c.Note || '').slice(0, 60))}${c._pending ? ' · pending' : ''}</div></div>
      <div class="amt ${c.Kind === 'IN' ? 'grn' : 'red'}">${c.Kind === 'IN' ? '+' : '−'}${rs(c.Amount)}</div></div>`).join('') || '<div class="empty">No cash entries in this period</div>'}</div>
    <div class="bottombar"><button class="btn red" data-act="cashNew" data-k="OUT">Cash out</button><button class="btn green" data-act="cashNew" data-k="IN">Cash in</button></div>`);
};
ACT.cbP = d => { S.cb = d.v; render(); };
ACT.cashNew = d => cashForm(d.k);
ACT.cashOpen = d => {
  const c = S.data.cash.find(x => x.CashID === d.id); if (!c) return;
  const m = openModal(`<div class="mh"><h3>${c.Kind === 'IN' ? 'Cash in' : 'Cash out'} ${rs(c.Amount)}</h3><button class="x" data-act="closeModal">&times;</button></div><div class="sub">${fmtDate(c.Date)} · ${esc(c.Category)}</div><p>${esc(c.Note)}</p>
    <div class="btns"><button class="btn" id="coE">Edit</button><button class="btn red" id="coD">Delete</button></div>`);
  $('#coE', m).onclick = () => { closeModal(m); cashForm(c.Kind, c); };
  $('#coD', m).onclick = () => { closeModal(m); confirmBox('Delete this cash entry?', 'Delete', () => { enqueue('cash.delete', { CashID: c.CashID }); toast('Deleted'); }, true); };
};

/* ============================ EXPENSES ============================ */
ROUTES.expenses = function () {
  setBar('Expenses', { back: true });
  const [from, to] = periodRange(S.ex || (S.ex = 'month'));
  const rows = S.data.expenses.filter(x => x.Deleted !== 'Y' && x.Date >= from && x.Date <= to).sort((a, b) => (b.Date + b.CreatedAt).localeCompare(a.Date + a.CreatedAt));
  const total = rows.reduce((s, x) => s + num(x.Amount), 0);
  const cats = {}; rows.forEach(x => { cats[x.Category] = (cats[x.Category] || 0) + num(x.Amount); });
  page(`${chipsHtml('exP', S.ex)}
    <div class="kpis"><div class="kpi"><small>Total expenses</small><b class="red">${rs(total)}</b></div><div class="kpi"><small>Entries</small><b>${rows.length}</b></div></div>
    ${Object.keys(cats).length ? '<div class="card"><div class="sub">By category</div>' + Object.keys(cats).sort((a, b) => cats[b] - cats[a]).map(k => `<div class="row"><span class="mid">${esc(k)}</span><b>${rs(cats[k])}</b></div>`).join('') + '</div>' : ''}
    <div class="list">${rows.map(x => `<div class="row" data-act="expOpen" data-id="${esc(x.ExpenseID)}" style="cursor:pointer"><div class="mid"><div class="nm">${esc(x.Category)}</div><div class="sub">${fmtDate(x.Date)} · ${esc(x.Mode)} · ${esc((x.Note || '').slice(0, 50))}${x._pending ? ' · pending' : ''}</div></div><div class="amt red">${rs(x.Amount)}</div></div>`).join('') || '<div class="empty">No expenses in this period</div>'}</div>
    ${fabHtml('expNew', '+ ADD EXPENSE')}`);
};
ACT.exP = d => { S.ex = d.v; render(); };
ACT.expNew = () => expenseForm();
ACT.expOpen = d => {
  const x = S.data.expenses.find(e => e.ExpenseID === d.id); if (!x) return;
  const m = openModal(`<div class="mh"><h3>${esc(x.Category)} ${rs(x.Amount)}</h3><button class="x" data-act="closeModal">&times;</button></div><div class="sub">${fmtDate(x.Date)} · ${esc(x.Mode)}</div><p>${esc(x.Note)}</p>
    <div class="btns"><button class="btn" id="exE">Edit</button><button class="btn red" id="exD">Delete</button></div>`);
  $('#exE', m).onclick = () => { closeModal(m); expenseForm(x); };
  $('#exD', m).onclick = () => { closeModal(m); confirmBox('Delete this expense?', 'Delete', () => { enqueue('exp.delete', { ExpenseID: x.ExpenseID }); toast('Deleted'); }, true); };
};

/* ============================ REPORTS ============================ */
ROUTES.reports = function () {
  setBar('Reports', { back: true });
  const per = S.rep || (S.rep = 'month');
  const [from, to] = periodRange(per);
  const inR = d => d >= from && d <= to;
  const bills = S.data.bills.filter(b => b.Deleted !== 'Y' && inR(b.Date));
  const sales = bills.reduce((s, b) => s + num(b.Total), 0), tax = bills.reduce((s, b) => s + num(b.Tax), 0);
  const cashIn = S.data.cash.filter(c => c.Deleted !== 'Y' && c.Kind === 'IN' && inR(c.Date)).reduce((s, c) => s + num(c.Amount), 0);
  const cashOut = S.data.cash.filter(c => c.Deleted !== 'Y' && c.Kind === 'OUT' && inR(c.Date)).reduce((s, c) => s + num(c.Amount), 0);
  const exp = S.data.expenses.filter(x => x.Deleted !== 'Y' && inR(x.Date)).reduce((s, x) => s + num(x.Amount), 0);
  const ents = S.data.entries.filter(e => e.Deleted !== 'Y' && inR(e.Date) && S.idx.bal.has(e.PartyID));
  const gave = ents.filter(e => e.Kind === 'GAVE' && S.idx.pmap.get(e.PartyID).Type === 'customer').reduce((s, e) => s + num(e.Amount), 0);
  const got = ents.filter(e => e.Kind === 'GOT' && S.idx.pmap.get(e.PartyID).Type === 'customer').reduce((s, e) => s + num(e.Amount), 0);
  let get = 0, give = 0; S.data.parties.forEach(p => { if (p.Deleted === 'Y') return; const b = balOf(p.PartyID); if (b > 0) get += b; else give -= b; });
  const top = S.data.parties.filter(p => p.Deleted !== 'Y' && p.Type === 'customer' && balOf(p.PartyID) > 0.004).sort((a, b) => balOf(b.PartyID) - balOf(a.PartyID)).slice(0, 10);
  page(`${chipsHtml('repP', per)}
    <div class="kpis"><div class="kpi"><small>Bills (sales)</small><b>${rs(sales)}</b></div><div class="kpi"><small>GST collected</small><b>${rs(tax)}</b></div>
      <div class="kpi"><small>Credit given (customers)</small><b class="red">${rs(gave)}</b></div><div class="kpi"><small>Received from customers</small><b class="grn">${rs(got)}</b></div>
      <div class="kpi"><small>Cash IN</small><b class="grn">${rs(cashIn)}</b></div><div class="kpi"><small>Cash OUT</small><b class="red">${rs(cashOut)}</b></div>
      <div class="kpi"><small>Expenses</small><b class="red">${rs(exp)}</b></div><div class="kpi"><small>Sales − expenses</small><b>${rs(sales - exp)}</b></div></div>
    <div class="card"><div class="row"><span class="mid">Total you will get (all parties)</span><b class="red">${rs(get)}</b></div><div class="row"><span class="mid">Total you will give</span><b class="grn">${rs(give)}</b></div></div>
    <div class="card"><div class="sub">Top 10 outstanding</div>${top.map(p => `<div class="row" data-act="openParty" data-id="${esc(p.PartyID)}" style="cursor:pointer"><span class="mid">${esc(p.Name)}</span><b class="red">${rs(balOf(p.PartyID))}</b></div>`).join('') || '<div class="muted">None</div>'}</div>
    <div class="btns"><button class="btn" data-act="expCsv">Download entries (CSV)</button><button class="btn out" data-act="goOut">Outstanding list</button></div>
    <p class="muted small">Per-customer statements: open a customer ledger and tap <b>Report</b> (since last zero balance, this month, custom dates, or all).</p>`);
};
ACT.repP = d => { S.rep = d.v; render(); };
ACT.goOut = () => go('outstanding');
ACT.expCsv = () => {
  const [from, to] = periodRange(S.rep || 'month');
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Date', 'Party', 'Type', 'You gave', 'You got', 'Mode', 'Details']];
  S.data.entries.filter(e => e.Deleted !== 'Y' && e.Date >= from && e.Date <= to && S.idx.pmap.get(e.PartyID)).sort((a, b) => a.Date.localeCompare(b.Date))
    .forEach(e => rows.push([e.Date, S.idx.pmap.get(e.PartyID).Name, S.idx.pmap.get(e.PartyID).Type, e.Kind === 'GAVE' ? e.Amount : '', e.Kind === 'GOT' ? e.Amount : '', e.Mode, e.NoteText]));
  downloadBlob(new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }), 'ledger-entries.csv');
};

/* ============================ MORE ============================ */
ROUTES.more = function () {
  setBar('More', {});
  const item = (act, ic, t, s) => `<div class="row" data-act="${act}" style="cursor:pointer"><span style="font-size:22px">${ic}</span><div class="mid"><div class="nm">${t}</div><div class="sub">${s}</div></div><span class="chev">&rsaquo;</span></div>`;
  page(`<div class="card"><div class="nm">${esc(S.user.Name)}</div><div class="sub">${esc(S.user.Role)} · ${esc(S.user.Phone)}</div></div>
    <div class="list">
      ${can('manager') ? item('goCash', '&#128181;', 'Cashbook', 'Cash in and cash out register') : ''}
      ${can('manager') ? item('goExpenses', '&#129534;', 'Expenses', 'Shop expenses by category') : ''}
      ${can('manager') ? item('goReports', '&#128202;', 'Reports', 'Sales, cash, expenses, GST, CSV download') : ''}
      ${can('manager') ? item('goCleanup', '&#129529;', 'Clean up inactive ledgers', 'Batch delete customers with no recent activity') : ''}
      ${can('manager') ? item('goBin', '&#128465;', 'Recycle bin', 'Restore deleted ledgers, entries and bills') : ''}
      ${can('owner') ? item('goImport', '&#128229;', 'Import from Khatabook', 'Bring customers and balances as opening balances') : ''}
      ${can('owner') ? item('goUsers', '&#128101;', 'Staff &amp; permissions', 'Add staff and set roles') : ''}
      ${can('owner') ? item('goSettings', '&#9881;', 'Business settings', 'Name, contact person, GST, UPI, bank, bill numbering') : ''}
      ${item('theme', '&#127912;', 'Theme', 'Light, dark, blue or system default')}
      ${item('goSync', '&#128260;', 'Sync status', 'Pending changes and errors')}
      ${item('changePin', '&#128273;', 'Change my PIN', '')}
      ${item('logout', '&#9099;', 'Log out', '')}
    </div><p class="muted small" style="text-align:center">${esc(APP_NAME)} · attachments are saved in your Google Drive folder "RMS Ledger Attachments"</p>`);
};
ACT.goCash = () => go('cash'); ACT.goExpenses = () => go('expenses');
ACT.goReports = () => go('reports'); ACT.goCleanup = () => go('cleanup'); ACT.goBin = () => go('bin');
ACT.goImport = () => go('import'); ACT.goUsers = () => go('users'); ACT.goSettings = () => go('settings');

/* ============================ SYNC STATUS ============================ */
ROUTES.sync = function () {
  setBar('Sync status', { back: true });
  page(`<div class="card"><div class="row"><div class="mid"><div class="nm">${navigator.onLine ? 'Online' : 'Offline'}</div><div class="sub">Last sync: ${S.lastSync ? fmtTime(S.lastSync) : 'not yet'} · ${S.queue.length} pending</div></div><button class="btn sm green" data-act="syncNow">Sync now</button></div></div>
    ${S.failed.length ? `<div class="card"><div class="b red">Failed changes (${S.failed.length})</div><p class="small muted">These were rejected by the server and have been removed from your screen. Fix and enter them again if needed.</p>
      ${S.failed.map(f => `<div class="row"><div class="mid"><div class="nm">${esc(f.op.type)}</div><div class="sub red">${esc(f.error)}</div></div></div>`).join('')}<button class="btn sm" data-act="clearFailed">Clear list</button></div>` : '<div class="card muted">No failed changes.</div>'}
    <div class="card"><div class="sub">Data on this device</div><div>${S.data.parties.length} parties · ${S.data.entries.length} entries · ${S.data.bills.length} bills</div>
      <button class="btn sm" style="margin-top:8px" data-act="fullResync">Reload everything from server</button></div>`);
};
ACT.syncNow = () => syncNow(true);
ACT.clearFailed = () => { S.failed = []; persistQueue(); render(); };
ACT.fullResync = () => { if (S.queue.length) return toast('Wait for pending changes to sync first'); S.since = ''; syncNow(true); };

/* ============================ CLEANUP ============================ */
ROUTES.cleanup = function () {
  setBar('Clean up ledgers', { back: true });
  const c = S.cl, cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - c.months);
  const cut = dateStr(cutoff);
  const list = S.data.parties.filter(p => p.Deleted !== 'Y' && (!c.zeroOnly || Math.abs(balOf(p.PartyID)) < 0.005) && (S.idx.lastDate.get(p.PartyID) || '') < cut)
    .sort((a, b) => (S.idx.lastDate.get(a.PartyID) || '').localeCompare(S.idx.lastDate.get(b.PartyID) || ''));
  page(`<div class="card"><label>No activity for at least<select id="clM">${[1, 3, 6, 12, 24, 36].map(m => `<option value="${m}" ${c.months === m ? 'selected' : ''}>${m} month${m > 1 ? 's' : ''}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="clZ" ${c.zeroOnly ? 'checked' : ''}> Only ledgers with zero balance (recommended)</label></div>
    <div class="btns"><button class="btn sm" data-act="clAll">Select all (${list.length})</button><button class="btn sm" data-act="clNone">Clear</button></div>
    <div class="list">${list.map(p => `<label class="row" style="margin:0;color:inherit"><input type="checkbox" style="width:auto" data-cl="${esc(p.PartyID)}" ${c.sel.has(p.PartyID) ? 'checked' : ''}>
      <div class="mid"><div class="nm">${esc(p.Name)} <span class="sub">(${p.Type})</span></div><div class="sub">Last activity ${fmtDate(S.idx.lastDate.get(p.PartyID))} · ${(S.idx.byParty.get(p.PartyID) || []).length} entries</div></div>
      <div class="amt ${balOf(p.PartyID) > 0 ? 'red' : 'grn'}">${rs(balOf(p.PartyID))}</div></label>`).join('') || '<div class="empty">No inactive ledgers found</div>'}</div>
    <div class="bottombar"><button class="btn red" data-act="clDel" ${c.sel.size ? '' : 'disabled'}>Delete selected (${c.sel.size})</button></div>`);
  $('#clM').onchange = e => { S.cl.months = +e.target.value; S.cl.sel = new Set(); ROUTES.cleanup(); };
  $('#clZ').onchange = e => { S.cl.zeroOnly = e.target.checked; S.cl.sel = new Set(); ROUTES.cleanup(); };
  $$('[data-cl]').forEach(x => x.onchange = () => { if (x.checked) S.cl.sel.add(x.dataset.cl); else S.cl.sel.delete(x.dataset.cl); ROUTES.cleanup(); });
  S.cl._list = list.map(p => p.PartyID);
};
ACT.clAll = () => { S.cl._list.forEach(id => S.cl.sel.add(id)); render(); };
ACT.clNone = () => { S.cl.sel = new Set(); render(); };
ACT.clDel = () => {
  if (!can('owner')) return toast('Only the owner can batch delete');
  const ids = Array.from(S.cl.sel); const nonZero = ids.filter(id => Math.abs(balOf(id)) > 0.004).length;
  confirmBox('Delete ' + ids.length + ' ledger(s)' + (nonZero ? ' (' + nonZero + ' have a balance that is not zero)' : '') + '? They go to the recycle bin and can be restored.', 'Delete', () => {
    enqueue('party.batchDelete', { ids: ids }); S.cl.sel = new Set(); toast(ids.length + ' ledgers moved to recycle bin');
  }, true);
};

/* ============================ RECYCLE BIN ============================ */
ROUTES.bin = function () {
  setBar('Recycle bin', { back: true });
  const t = S.binTab;
  const del = arr => arr.filter(x => x.Deleted === 'Y').sort((a, b) => String(b.DeletedAt).localeCompare(String(a.DeletedAt)));
  const byParty = e => String(e.DeletedBy || '').includes('|');
  const rows = {
    parties: del(S.data.parties).map(p => ({ id: p.PartyID, act: 'binRestore', k: 'party', t: p.Name, s: p.Type + ' · deleted ' + ago(p.DeletedAt) + ' by ' + String(p.DeletedBy).split('|')[0] })),
    entries: del(S.data.entries).filter(e => !byParty(e)).map(e => { const p = S.idx.pmap.get(e.PartyID); return { id: e.EntryID, k: 'entry', t: (p ? p.Name : '?') + ' · ' + rs(e.Amount) + (e.Kind === 'GAVE' ? ' gave' : ' got'), s: fmtDate(e.Date) + ' · deleted ' + ago(e.DeletedAt) + ' by ' + String(e.DeletedBy).split('|')[0] }; }),
    bills: del(S.data.bills).map(b => ({ id: b.BillID, k: 'bill', t: b.BillNo + ' · ' + rs(b.Total), s: 'deleted ' + ago(b.DeletedAt) + ' by ' + String(b.DeletedBy).split('|')[0] })),
    cash: del(S.data.cash).filter(c => !c.LinkedEntryID).map(c => ({ id: c.CashID, k: 'cash', t: (c.Kind === 'IN' ? 'Cash in ' : 'Cash out ') + rs(c.Amount), s: fmtDate(c.Date) + ' · deleted ' + ago(c.DeletedAt) })),
    expenses: del(S.data.expenses).map(x => ({ id: x.ExpenseID, k: 'exp', t: x.Category + ' · ' + rs(x.Amount), s: fmtDate(x.Date) + ' · deleted ' + ago(x.DeletedAt) }))
  }[t];
  const labels = [['parties', 'Ledgers'], ['entries', 'Entries'], ['bills', 'Bills'], ['cash', 'Cash'], ['expenses', 'Expenses']];
  page(`<div class="chips">${labels.map(l => `<span class="chip ${t === l[0] ? 'on' : ''}" data-act="binTab" data-v="${l[0]}">${l[1]}</span>`).join('')}</div>
    <div class="list">${rows.map(r => `<div class="row"><div class="mid"><div class="nm">${esc(r.t)}</div><div class="sub">${esc(r.s)}</div></div><button class="btn sm green" data-act="binRestore" data-k="${r.k}" data-id="${esc(r.id)}">Restore</button></div>`).join('') || '<div class="empty">Nothing here</div>'}</div>
    ${can('owner') ? '<button class="btn block" data-act="binEmpty">Permanently remove items deleted more than 30 days ago</button>' : ''}`);
};
ACT.binTab = d => { S.binTab = d.v; render(); };
ACT.binRestore = d => {
  const idk = { party: 'PartyID', entry: 'EntryID', bill: 'BillID', cash: 'CashID', exp: 'ExpenseID' }[d.k];
  enqueue(d.k + '.restore', { [idk]: d.id }); toast('Restored');
};
ACT.binEmpty = () => confirmBox('Permanently remove everything deleted more than 30 days ago? This cannot be undone.', 'Remove', async () => {
  try { const r = await api('bin.empty', { days: 30 }); toast(r.removed + ' items removed'); S.since = ''; syncNow(); } catch (e) { toast(e.message); }
}, true);

/* ============================ USERS ============================ */
ROUTES.users = async function () {
  setBar('Staff & permissions', { back: true });
  page('<div class="empty">Loading…</div>');
  if (!navigator.onLine) return page('<div class="empty">You need internet to manage staff</div>');
  try {
    const r = await api('users.list');
    if (S.route.name !== 'users') return;
    page(`<div class="card small muted"><b>Staff</b> can add entries and bills only. <b>Manager</b> can also edit, delete, use cashbook, expenses and reports. <b>Owner</b> can do everything, including staff, settings, import and batch delete.</div>
      <div class="list">${r.users.map(u => `<div class="row" data-act="userEdit" data-id="${esc(u.UserID)}" style="cursor:pointer"><div class="av">${esc(initials(u.Name))}</div><div class="mid"><div class="nm">${esc(u.Name)}${u.Active !== 'Y' ? ' <span class="red small">(disabled)</span>' : ''}</div><div class="sub">${esc(u.Phone)} · ${esc(u.Role)}</div></div><span class="chev">&rsaquo;</span></div>`).join('')}</div>
      ${fabHtml('userNew', '+ ADD USER')}`);
    S._users = r.users;
  } catch (e) { page('<div class="empty red">' + esc(e.message) + '</div>'); }
};
ACT.userNew = () => userForm(null, () => ROUTES.users());
ACT.userEdit = d => userForm((S._users || []).find(u => u.UserID === d.id), () => ROUTES.users());

/* ============================ SETTINGS ============================ */
ROUTES.settings = function () {
  setBar('Business settings', { back: true });
  const f = (k, label, ph, area) => area ? `<label>${label}<textarea data-set="${k}" rows="3" placeholder="${esc(ph || '')}">${esc(setting(k))}</textarea></label>` : `<label>${label}<input data-set="${k}" value="${esc(setting(k))}" placeholder="${esc(ph || '')}"></label>`;
  page(`<div class="card">${f('BusinessName', 'Business name')}${f('ContactPerson', 'Contact person (shown as "Business - Contact person")', 'Jigar Mehta')}${f('Phone', 'Mobile number', '10 digit')}${f('Address', 'Address', '', 1)}${f('GSTIN', 'GSTIN (shown on GST bills)', '24ABCDE1234F1Z5')}
    ${f('UpiId', 'UPI ID (shown on PDFs and reminder image)', 'name@bank')}${f('BankDetails', 'Bank details (shown on all PDFs)', 'Bank name, A/c no, IFSC', 1)}</div>
    <div class="card">${f('BillPrefix', 'Bill number prefix', 'INV-')}${f('BillFooter', 'Bill footer text')}
    ${f('AppUrl', 'Public web address of this app (used in customer links)', 'https://yourname.github.io/your-app/')}<div class="sub">Must be the web address of this app (starts with https://). Not a UPI ID.</div></div>
    <div class="card">${f('ReminderTemplate', 'WhatsApp reminder text', '', 1)}<div class="sub">Use {name} {amount} {business} {link} {phone}. Leave blank to use the standard short message.</div></div>
    <button class="btn primary" data-act="saveSettings">Save settings</button>
    <div class="card" style="margin-top:22px;border:1px solid var(--red)"><div class="b red">Danger zone</div><p class="small muted">CLEAR ALL permanently removes every party, entry, bill, cash and expense record, and restarts bill numbers. Staff, settings and Drive files are kept. Download a copy of the Google Sheet first.</p>
      <button class="btn red" data-act="clearAll">CLEAR ALL data…</button></div>`);
};
ACT.clearAll = () => {
  if (!can('owner')) return toast('Only the owner can do this');
  if (!navigator.onLine) return toast('You need internet for this');
  const m = openModal(`<div class="mh"><h3 class="red">Clear all data</h3><button class="x" data-act="closeModal">&times;</button></div>
    <p>This deletes <b>everything</b>: all ledgers, entries, bills, cash and expenses. It cannot be undone.</p>
    <label>Type <b>CLEAR ALL</b> to confirm<input id="caTxt" autocomplete="off" placeholder="CLEAR ALL"></label>
    <div class="btns"><button class="btn" data-act="closeModal">Cancel</button><button class="btn red" id="caGo" disabled>Delete everything</button></div>`);
  const t = $('#caTxt', m), g = $('#caGo', m);
  t.oninput = () => { g.disabled = t.value !== 'CLEAR ALL'; };
  g.onclick = async () => {
    g.disabled = true; g.textContent = 'Clearing…';
    try {
      const r = await api('data.clearAll', { confirm: 'CLEAR ALL' });
      closeModal(m);
      S.queue = []; S.failed = []; persistQueue();
      S.data.parties = []; S.data.entries = []; S.data.bills = []; S.data.cash = []; S.data.expenses = [];
      S.since = ''; S.epoch = r.epoch || S.epoch; S.reminded = {}; DB.set('reminded', {}).catch(() => {});
      await pull(); S.route = { name: 'parties' }; render(); toast('All data cleared');
    } catch (e) { toast(e.message); g.disabled = false; g.textContent = 'Delete everything'; }
  };
};
ACT.saveSettings = async () => {
  const s = {}; $$('[data-set]').forEach(el => { s[el.dataset.set] = el.value; });
  try { const r = await api('settings.save', { settings: s }); S.data.settings = r.settings; persist(); toast('Settings saved'); } catch (e) { toast(e.message); }
};

/* ============================ IMPORT ============================ */
ROUTES.import = function () {
  setBar('Import customers', { back: true });
  page(`<div class="card"><div class="b">Bring your Khatabook customers across</div>
    <p class="small muted">Only names, mobile numbers and current balances are imported, as opening balances. Entries start fresh from today. Duplicates (same name and number) are skipped.</p>
    <p class="small"><b>Two easy ways:</b><br>1. Paste one customer per line in this format: <code>Name, Mobile, Amount</code> (use a minus sign if you owe them, e.g. -500).<br>2. Choose a CSV file with the same three columns (header row optional).</p>
    <label>Import as<select id="imType"><option value="customer">Customers</option><option value="supplier">Suppliers</option></select></label>
    <label>Pasted list<textarea id="imText" rows="8" placeholder="Ashish Bhansali, 9374718439, 38968&#10;Rahul Shah, , 43143"></textarea></label>
    <label>or CSV file<input type="file" id="imFile" accept=".csv,text/csv,text/plain"></label>
    <div class="card sub" id="imPrev">Nothing to import yet</div>
    <button class="btn primary" id="imGo" disabled>Import</button></div>`);
  let rows = [];
  const parse = text => {
    rows = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      const parts = line.split(/[,\t;]/).map(s => s.replace(/^"|"$/g, '').trim());
      if (/^name$/i.test(parts[0])) return;
      const amt = parseFloat(String(parts[2] || '0').replace(/[^\d.\-]/g, '')) || 0;
      if (parts[0]) rows.push({ Name: parts[0], Phone: parts[1] || '', Balance: amt });
    });
    $('#imPrev').innerHTML = rows.length ? `<b>${rows.length}</b> customers ready. Total to get: <b class="red">${rs(rows.filter(r => r.Balance > 0).reduce((s, r) => s + r.Balance, 0))}</b>` : 'Nothing to import yet';
    $('#imGo').disabled = !rows.length;
  };
  $('#imText').oninput = e => parse(e.target.value);
  $('#imFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { $('#imText').value = fr.result; parse(fr.result); }; fr.readAsText(f); };
  $('#imGo').onclick = async () => {
    const b = $('#imGo'); b.disabled = true; b.textContent = 'Importing…';
    try {
      let added = 0, skipped = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const r = await api('import', { type: $('#imType').value, rows: rows.slice(i, i + 200) }); added += r.added; skipped += r.skipped;
      }
      S.since = ''; await syncNow();
      toast(added + ' added, ' + skipped + ' skipped'); go('parties');
    } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Import'; }
  };
};
