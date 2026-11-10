'use strict';
/* =====================================================================
   forms.js - modals/forms, rich text editor, WhatsApp helpers, printing
   ===================================================================== */

/* ---------- WhatsApp / link helpers ---------- */
function waLink(phone, text) {
  let p = normPhone(phone);
  if (p.length === 10) p = '91' + p;
  return (p ? 'https://wa.me/' + p : 'https://wa.me/') + '?text=' + encodeURIComponent(text);
}
function openWa(url) { window.open(url, '_blank'); }
function appBase() {
  let u = setting('AppUrl') || CFG.APP_URL || (location.origin + location.pathname);
  u = u.replace(/[?#].*$/, '').replace(/index\.html$/, '');
  return u.endsWith('/') ? u : u + '/';
}
function customerLink(p) { return p && p.Code ? appBase() + '?c=' + p.Code : ''; }
function fillTemplate(t, p, amount) {
  return String(t).replace(/\{name\}/g, p.Name).replace(/\{amount\}/g, rs(amount)).replace(/\{business\}/g, setting('BusinessName') || 'us')
    .replace(/\{link\}/g, customerLink(p) || '').replace(/\{phone\}/g, setting('Phone') || '');
}
function reminderText(p) {
  const bal = balOf(p.PartyID);
  const t = setting('ReminderTemplate') || 'Dear {name}, your pending balance with {business} is {amount}. {link}';
  return fillTemplate(t, p, bal);
}
function markReminded(pid) { S.reminded[pid] = todayStr(); DB.set('reminded', S.reminded).catch(() => {}); }

function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function printHtml(html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentWindow.document; d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 400);
}
const PRINT_CSS = '<style>body{font-family:Arial,sans-serif;font-size:12px;color:#222;margin:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px 6px;text-align:left}th{background:#eee}.r{text-align:right}h2{margin:0}.g{color:#b00020}.k{color:#0d7a3e}</style>';
function payBlockLocal() {
  const u = setting('UpiId'), b = setting('BankDetails');
  if (!u && !b) return '';
  return '<hr>' + (u ? '<div><b>UPI:</b> ' + esc(u) + '</div>' : '') + (b ? '<div><b>Bank details:</b><br>' + esc(b).replace(/\n/g, '<br>') + '</div>' : '');
}
function bizHead(rightHtml) {
  return '<table style="border:0"><tr><td style="border:0"><h2>' + esc(setting('BusinessName')) + '</h2><div>' + esc(setting('Address')) + '</div><div>Phone: ' + esc(setting('Phone')) + '</div>' +
    (setting('GSTIN') ? '<div>GSTIN: ' + esc(setting('GSTIN')) + '</div>' : '') + '</td><td style="border:0;text-align:right">' + rightHtml + '</td></tr></table><hr>';
}

/* ---------- Rich text editor ---------- */
function editorBlock(id, html) {
  const cols = ['#000000', '#c62828', '#0d7a3e', '#1565c0', '#ef6c00', '#6a1b9a'];
  return `<div class="rt-bar">
    <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
    <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
    <button type="button" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
    ${cols.map(c => `<button type="button" class="sw" data-cmd="foreColor" data-val="${c}" style="background:${c}" title="Text colour"></button>`).join('')}
    <button type="button" data-cmd="hiliteColor" data-val="#fff176" title="Highlight">&#9998;</button>
    <button type="button" data-cmd="insertUnorderedList" title="Bullets">&bull;&#8801;</button>
    <button type="button" data-cmd="removeFormat" title="Clear formatting">&#10005;</button>
  </div><div id="${id}" class="rt" contenteditable="true" data-ph="Details… (you can paste images here)">${html || ''}</div>`;
}
function fileToImageDataUrl(file, maxDim, q) {
  maxDim = maxDim || 1600; q = q || 0.82;
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height; const sc = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => rej(new Error('Not a valid image'));
      img.src = fr.result;
    };
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}
function fileToDataUrl(file) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
}
function bindEditor(root, ed) {
  $$('[data-cmd]', root).forEach(b => {
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => {
      ed.focus();
      try { document.execCommand('styleWithCSS', false, true); } catch (e) { /* ignore */ }
      document.execCommand(b.dataset.cmd, false, b.dataset.val || null);
    });
  });
  ed.addEventListener('paste', async e => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const img = items.find(i => i.type && i.type.indexOf('image/') === 0);
    if (img) {
      e.preventDefault();
      try {
        const url = await fileToImageDataUrl(img.getAsFile());
        ed.focus(); document.execCommand('insertImage', false, url);
      } catch (er) { toast(er.message); }
    }
  });
}
function editorValue(ed) {
  let h = cleanHtml(ed.innerHTML).trim();
  if (!htmlToText(h) && !/<img/i.test(h)) h = '';
  return h;
}

/* ---------- Party form ---------- */
function partyForm(type, existing) {
  const isEdit = !!existing;
  const t = isEdit ? existing.Type : type;
  const ob = isEdit ? num(existing.OpeningBalance) : 0;
  const m = openModal(`<div class="mh"><h3>${isEdit ? 'Edit' : 'Add'} ${t === 'supplier' ? 'supplier' : 'customer'}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <label>Name<input id="pName" value="${esc(isEdit ? existing.Name : '')}" placeholder="Full name"></label>
    <label>Mobile number (for WhatsApp)<input id="pPhone" type="tel" inputmode="numeric" value="${esc(isEdit ? existing.Phone : '')}" placeholder="10 digit number"></label>
    <div class="grid2">
      <label>Opening balance (₹)<input id="pOb" type="number" inputmode="decimal" min="0" step="0.01" value="${ob ? Math.abs(ob) : ''}" placeholder="0"></label>
      <label>Opening balance is<select id="pObType"><option value="get" ${ob >= 0 ? 'selected' : ''}>You will get</option><option value="give" ${ob < 0 ? 'selected' : ''}>You will give</option></select></label>
    </div>
    <label>Notes (optional)<input id="pNotes" value="${esc(isEdit ? existing.Notes : '')}"></label>
    <button class="btn primary" id="pSave" style="margin-top:12px">Save</button>`);
  $('#pSave', m).onclick = () => {
    const name = $('#pName', m).value.trim();
    if (!name) return toast('Enter a name');
    const phone = normPhone($('#pPhone', m).value);
    if (phone && phone.length !== 10) return toast('Mobile number should be 10 digits');
    const amt = round2($('#pOb', m).value);
    const ob2 = $('#pObType', m).value === 'give' ? -amt : amt;
    const dup = phone && S.data.parties.find(p => p.Deleted !== 'Y' && p.Phone === phone && (!isEdit || p.PartyID !== existing.PartyID));
    const go2 = () => {
      if (isEdit) enqueue('party.edit', { PartyID: existing.PartyID, Name: name, Phone: phone, Notes: $('#pNotes', m).value, OpeningBalance: ob2 });
      else enqueue('party.add', { PartyID: uid('p'), Type: t, Name: name, Phone: phone, Notes: $('#pNotes', m).value, OpeningBalance: ob2 });
      closeModal(m); toast('Saved');
    };
    if (dup) confirmBox('"' + dup.Name + '" already has this mobile number. Save anyway?', 'Save', go2); else go2();
  };
  setTimeout(() => $('#pName', m).focus(), 50);
}

/* ---------- Entry form (You gave / You got) ---------- */
function notifyText(p, e, includeTotal) {
  const bal = balOf(p.PartyID);
  const lines = ['Dear ' + p.Name + ','];
  if (e.Kind === 'GOT') lines.push(p.Type === 'supplier' ? 'Credit of ' + rs(e.Amount) + ' has been recorded on ' + fmtDate(e.Date) + '.' : 'We have received ' + rs(e.Amount) + ' on ' + fmtDate(e.Date) + '. Thank you!');
  else lines.push(p.Type === 'supplier' ? 'We have paid ' + rs(e.Amount) + ' on ' + fmtDate(e.Date) + '.' : rs(e.Amount) + ' has been added to your account on ' + fmtDate(e.Date) + '.');
  const note = htmlToText(e.NoteHTML || '').replace(/\s+/g, ' ').slice(0, 120);
  if (note) lines.push(note);
  if (includeTotal) lines.push('Total balance: ' + rs(bal) + (bal > 0.004 ? (p.Type === 'supplier' ? ' (payable to you)' : ' (to be paid)') : bal < -0.004 ? (p.Type === 'supplier' ? ' (to be paid)' : ' (payable to you)') : ' (settled)'));
  const link = customerLink(p); if (link) lines.push('View your account: ' + link);
  lines.push(setting('BusinessName'));
  return lines.join('\n');
}

function entryForm(pid, kind, existing, prefill) {
  const p = S.idx.pmap.get(pid); if (!p) return;
  const isEdit = !!existing;
  kind = isEdit ? existing.Kind : kind;
  const list = isEdit ? atts(existing).slice() : [];
  const eligible = !!cashDir(p, kind);
  const branches = (setting('Branches') || '').split(',').map(s => s.trim()).filter(Boolean);
  const ownerAll = S.user.Branch === 'All';
  const hasCash = isEdit && S.data.cash.some(c => c.LinkedEntryID === existing.EntryID && c.Deleted !== 'Y');
  const isGave = kind === 'GAVE';
  const m = openModal(`<div class="mh"><h3 class="${isGave ? 'red' : 'grn'}">${isEdit ? 'Edit entry · ' : ''}${isGave ? 'You gave' : 'You got'} · ${esc(p.Name)}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="grid2">
      <label>Amount (₹)<input id="fAmt" type="number" inputmode="decimal" min="0" step="0.01" value="${isEdit ? existing.Amount : ''}"></label>
      <label>Date<input id="fDate" type="date" value="${isEdit ? existing.Date : todayStr()}"></label>
    </div>
    ${eligible ? `<div class="grid2"><label>Payment mode<select id="fMode"><option value="Cash" ${isEdit && existing.Mode === 'Cash' ? 'selected' : ''}>Cash</option><option value="Online" ${isEdit && existing.Mode === 'Online' ? 'selected' : ''}>Online / UPI</option></select></label>
      ${ownerAll && !isEdit ? `<label>Branch<select id="fBranch">${branches.map(b => `<option>${esc(b)}</option>`).join('')}</select></label>` : '<span></span>'}</div>
      <label class="check"><input type="checkbox" id="fCash" ${(isEdit ? hasCash : true) ? 'checked' : ''}> Also record in Cashbook (${cashDir(p, kind) === 'IN' ? 'cash IN' : 'cash OUT'})</label>`
      : (ownerAll && !isEdit ? `<label>Branch<select id="fBranch">${branches.map(b => `<option>${esc(b)}</option>`).join('')}</select></label>` : '')}
    <label>Details</label>
    ${editorBlock('fEd', isEdit ? cleanHtml(existing.NoteHTML) : (prefill && prefill.html) || '')}
    <div class="attlist" id="fAtts"></div>
    <button type="button" class="btn sm" id="fAttach">&#128206; Attach PDF / photo</button>
    <input type="file" id="fFile" hidden multiple accept="image/*,application/pdf">
    ${!isEdit ? `<label class="check"><input type="checkbox" id="fNotify"> Send WhatsApp message to ${esc(p.Name)} after saving</label>
      <label class="check" id="fTotWrap" hidden><input type="checkbox" id="fTotal" checked> Include running total in message</label>` : ''}
    ${!isEdit && isGave && p.Type === 'customer' ? `<label class="check"><input type="checkbox" id="fBill"> Create a bill for this entry (GST / non-GST)</label>` : ''}
    <button class="btn primary" id="fSave" style="margin-top:10px">Save</button>`);
  const ed = $('#fEd', m);
  bindEditor(m, ed);
  const drawAtts = () => {
    $('#fAtts', m).innerHTML = list.filter(a => !a.inline).map((a, i) =>
      `<span class="a">${(a.mime || '').indexOf('image/') === 0 ? `<img src="${esc(a.dataUrl || a.url)}" alt="">` : '&#128196;'}${esc((a.name || 'file').slice(0, 24))} <b data-rm="${list.indexOf(a)}">&times;</b></span>`).join('');
    $$('#fAtts [data-rm]', m).forEach(b => b.onclick = () => { list.splice(+b.dataset.rm, 1); drawAtts(); });
  };
  drawAtts();
  $('#fAttach', m).onclick = () => $('#fFile', m).click();
  $('#fFile', m).onchange = async ev => {
    for (const f of Array.from(ev.target.files)) {
      try {
        if (f.type.indexOf('image/') === 0) list.push({ name: f.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', dataUrl: await fileToImageDataUrl(f) });
        else if (f.type === 'application/pdf') {
          if (f.size > 8 * 1024 * 1024) { toast('PDF is larger than 8 MB'); continue; }
          list.push({ name: f.name, mime: 'application/pdf', dataUrl: await fileToDataUrl(f) });
        } else toast('Only images and PDF files are supported');
      } catch (er) { toast(er.message); }
    }
    ev.target.value = ''; drawAtts();
  };
  const nt = $('#fNotify', m);
  if (nt) nt.onchange = () => { $('#fTotWrap', m).hidden = !nt.checked; };
  const modeSel = $('#fMode', m), cashChk = $('#fCash', m);
  if (modeSel && cashChk && !isEdit) modeSel.onchange = () => { cashChk.checked = modeSel.value === 'Cash'; };
  if (modeSel && cashChk && !isEdit) cashChk.checked = modeSel.value === 'Cash';
  $('#fSave', m).onclick = () => {
    const amount = round2($('#fAmt', m).value);
    if (!(amount > 0)) return toast('Enter the amount');
    const date = $('#fDate', m).value || todayStr();
    const html = editorValue(ed);
    if ($('#fBill', m) && $('#fBill', m).checked) {
      closeModal(m);
      billForm({ PartyID: pid, Date: date, Items: [{ desc: htmlToText(html) || 'Goods / services', qty: 1, rate: amount, gst: 0 }] });
      return;
    }
    const data = {
      EntryID: isEdit ? existing.EntryID : uid('e'), PartyID: pid, Date: date, Kind: kind, Amount: amount, NoteHTML: html,
      Mode: modeSel ? modeSel.value : '', Attachments: list, cashbook: cashChk ? cashChk.checked : false
    };
    const br = $('#fBranch', m); if (br) data.Branch = br.value;
    enqueue(isEdit ? 'entry.edit' : 'entry.add', data);
    closeModal(m); toast('Saved');
    if (nt && nt.checked) openWa(waLink(p.Phone, notifyText(p, data, $('#fTotal', m).checked)));
  };
  setTimeout(() => $('#fAmt', m).focus(), 50);
}

function viewEntry(id) {
  const e = S.data.entries.find(x => x.EntryID === id); if (!e) return;
  const p = S.idx.pmap.get(e.PartyID);
  const al = atts(e).filter(a => !a.inline);
  const bill = /^b_.+-[GP]$/.test(e.EntryID);
  const m = openModal(`<div class="mh"><h3>${e.Kind === 'GAVE' ? 'You gave' : 'You got'} ${rs(e.Amount)}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="sub">${esc(p ? p.Name : '')} · ${fmtDate(e.Date)} · added ${fmtDate((e.CreatedAt || '').slice(0, 10))} ${fmtTime(e.CreatedAt)} by ${esc(e.CreatedBy || '')}${e.Branch ? ' · ' + esc(e.Branch) : ''}${e.Mode ? ' · ' + esc(e.Mode) : ''}</div>
    ${e._pending ? '<div class="pend">Waiting to sync…</div>' : ''}
    <div class="rtv" style="margin:10px 0;word-break:break-word">${cleanHtml(e.NoteHTML) || '<span class="muted">No details</span>'}</div>
    <div class="atts">${al.map(a => (a.mime || '').indexOf('image/') === 0 ? `<img class="th" src="${esc(a.dataUrl || a.url)}" alt="">` : `<a class="attchip" target="_blank" rel="noopener" href="${esc(a.url || '#')}">&#128196; ${esc(a.name || 'file')}</a>`).join('')}</div>
    <div class="btns">
      ${p ? '<button class="btn out" data-act="shareEntry" data-id="' + esc(id) + '">WhatsApp</button>' : ''}
      ${can('manager') && !bill && !e._pending ? '<button class="btn" data-act="editEntry" data-id="' + esc(id) + '">Edit</button>' : ''}
      ${can('manager') && !bill && !e._pending ? '<button class="btn red" data-act="delEntry" data-id="' + esc(id) + '">Delete</button>' : ''}
    </div>
    ${bill ? '<div class="muted small">This entry belongs to a bill. Open the bill to delete it.</div>' : ''}`);
  return m;
}
ACT.viewEntry = d => viewEntry(d.id);
ACT.editEntry = d => { const e = S.data.entries.find(x => x.EntryID === d.id); closeAllModals(); if (e) entryForm(e.PartyID, e.Kind, e); };
ACT.delEntry = d => confirmBox('Delete this entry? It will go to the recycle bin.', 'Delete', () => { enqueue('entry.delete', { EntryID: d.id }); closeAllModals(); toast('Deleted'); }, true);
ACT.shareEntry = d => {
  const e = S.data.entries.find(x => x.EntryID === d.id); const p = e && S.idx.pmap.get(e.PartyID); if (!p) return;
  openWa(waLink(p.Phone, notifyText(p, e, true)));
};

/* ---------- Bill form ---------- */
function billForm(init) {
  init = init || {};
  const branches = (setting('Branches') || '').split(',').map(s => s.trim()).filter(Boolean);
  const ownerAll = S.user.Branch === 'All';
  const st = { isGst: false, items: (init.Items && init.Items.length ? init.Items : [{ desc: '', qty: 1, rate: '', gst: 0 }]).map(x => Object.assign({}, x)), pay: 'unpaid', mode: 'Cash', pid: init.PartyID || '' };
  const customers = S.data.parties.filter(p => p.Deleted !== 'Y').sort((a, b) => a.Name.localeCompare(b.Name));
  const m = openModal(`<div class="mh"><h3>New bill</h3><button class="x" data-act="closeModal">&times;</button></div>
    <label>Customer<input id="bQ" placeholder="Type to search customer…" ${init.PartyID ? 'hidden' : ''}></label>
    <select id="bParty" ${init.PartyID ? 'disabled' : ''}></select>
    <div class="grid2">
      <label>Bill date<input id="bDate" type="date" value="${init.Date || todayStr()}"></label>
      ${ownerAll ? `<label>Branch<select id="bBranch">${branches.map(b => `<option>${esc(b)}</option>`).join('')}</select></label>` : '<span></span>'}
    </div>
    <div class="seg" id="bType"><button type="button" data-v="non" class="on">Non-GST bill</button><button type="button" data-v="gst">GST bill</button></div>
    <label id="bGstinWrap" hidden>Customer GSTIN (optional)<input id="bGstin" maxlength="15" placeholder="e.g. 24ABCDE1234F1Z5" style="text-transform:uppercase"></label>
    <div id="bItems"></div>
    <button type="button" class="btn sm" id="bAdd">+ Add item</button>
    <div class="card" id="bTot"></div>
    <label>Payment</label>
    <div class="seg" id="bPay"><button type="button" data-v="unpaid" class="on r">Unpaid</button><button type="button" data-v="partial">Partly paid</button><button type="button" data-v="full" >Fully paid</button></div>
    <div id="bPaidWrap" hidden>
      <div class="grid2"><label id="bPaidAmtWrap">Amount received (₹)<input id="bPaid" type="number" inputmode="decimal" min="0" step="0.01"></label>
      <label>Mode<select id="bMode"><option value="Cash">Cash</option><option value="Online">Online / UPI</option></select></label></div>
      <label class="check" id="bCashWrap"><input type="checkbox" id="bCash" checked> Also record in Cashbook</label>
    </div>
    <label>Note (optional)<input id="bNote" maxlength="300"></label>
    <button class="btn primary" id="bSave" style="margin-top:12px">Save bill</button>`, { full: true });

  const fillParty = q => {
    const sel = $('#bParty', m); q = (q || '').toLowerCase();
    const list = customers.filter(p => init.PartyID ? p.PartyID === init.PartyID : (!q || (p.Name + ' ' + p.Phone).toLowerCase().includes(q))).slice(0, 80);
    sel.innerHTML = (init.PartyID ? '' : '<option value="">Select customer</option>') + list.map(p => `<option value="${esc(p.PartyID)}" ${p.PartyID === st.pid ? 'selected' : ''}>${esc(p.Name)}${p.Phone ? ' · ' + esc(p.Phone) : ''}</option>`).join('');
    if (st.pid && !list.some(p => p.PartyID === st.pid)) sel.value = '';
  };
  fillParty('');
  $('#bQ', m).oninput = ev => fillParty(ev.target.value);
  $('#bParty', m).onchange = ev => { st.pid = ev.target.value; };
  if (init.PartyID) st.pid = init.PartyID;

  const total = () => billTotals(st.items.map(it => ({ qty: it.qty, rate: it.rate, gst: st.isGst ? it.gst : 0 })));
  const drawTot = () => {
    const t = total();
    $('#bTot', m).innerHTML = `<div class="row"><span class="mid">${st.isGst ? 'Taxable value' : 'Sub-total'}</span><b>${rs(t.taxable)}</b></div>` +
      (st.isGst ? `<div class="row"><span class="mid">CGST</span><span>${rs(t.tax / 2)}</span></div><div class="row"><span class="mid">SGST</span><span>${rs(t.tax / 2)}</span></div>` : '') +
      `<div class="row"><span class="mid b">Total</span><b style="font-size:18px">${rs(t.total)}</b></div>`;
    if (st.pay === 'full') $('#bPaid', m).value = t.total || '';
  };
  const drawItems = () => {
    $('#bItems', m).innerHTML = st.items.map((it, i) => `<div class="card" data-i="${i}">
      <input class="bd" placeholder="Item / description" value="${esc(it.desc)}">
      <div class="grid2" style="margin-top:6px"><label>Qty<input class="bq" type="number" inputmode="decimal" min="0" step="any" value="${esc(it.qty)}"></label>
      <label>Rate (₹)<input class="br" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(it.rate)}"></label></div>
      ${st.isGst ? `<label>GST %<select class="bg">${[0, 5, 12, 18, 28].map(g => `<option ${+it.gst === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>` : ''}
      ${st.items.length > 1 ? '<button type="button" class="btn sm red bx" style="margin-top:6px">Remove</button>' : ''}</div>`).join('');
    $$('#bItems .card', m).forEach(c => {
      const i = +c.dataset.i;
      $('.bd', c).oninput = e => { st.items[i].desc = e.target.value; };
      $('.bq', c).oninput = e => { st.items[i].qty = e.target.value; drawTot(); };
      $('.br', c).oninput = e => { st.items[i].rate = e.target.value; drawTot(); };
      const g = $('.bg', c); if (g) g.onchange = e => { st.items[i].gst = +e.target.value; drawTot(); };
      const x = $('.bx', c); if (x) x.onclick = () => { st.items.splice(i, 1); drawItems(); drawTot(); };
    });
  };
  drawItems(); drawTot();
  $('#bAdd', m).onclick = () => { st.items.push({ desc: '', qty: 1, rate: '', gst: st.isGst ? 18 : 0 }); drawItems(); };
  $$('#bType button', m).forEach(b => b.onclick = () => {
    st.isGst = b.dataset.v === 'gst';
    $$('#bType button', m).forEach(x => x.classList.toggle('on', x === b));
    $('#bGstinWrap', m).hidden = !st.isGst;
    if (st.isGst) st.items.forEach(it => { if (!it.gst) it.gst = 18; });
    drawItems(); drawTot();
  });
  const setPay = v => {
    st.pay = v;
    $$('#bPay button', m).forEach(x => { x.className = x.dataset.v === v ? 'on ' + (v === 'unpaid' ? 'r' : 'g') : ''; });
    $('#bPaidWrap', m).hidden = v === 'unpaid';
    $('#bPaidAmtWrap', m).hidden = v === 'full';
    if (v === 'full') $('#bPaid', m).value = total().total || '';
    if (v === 'partial') $('#bPaid', m).value = '';
  };
  $$('#bPay button', m).forEach(b => b.onclick = () => setPay(b.dataset.v));
  $('#bMode', m).onchange = e => { $('#bCash', m).checked = e.target.value === 'Cash'; $('#bCashWrap', m).hidden = e.target.value !== 'Cash'; };
  $('#bSave', m).onclick = () => {
    if (!st.pid) return toast('Select a customer');
    const items = st.items.map(it => ({ desc: String(it.desc || '').trim(), qty: num(it.qty), rate: num(it.rate), gst: st.isGst ? num(it.gst) : 0 })).filter(it => it.desc && it.qty > 0);
    if (!items.length) return toast('Add at least one item with a name and quantity');
    const t = billTotals(items);
    if (!(t.total > 0)) return toast('Bill total must be more than zero');
    let paid = 0;
    if (st.pay === 'full') paid = t.total;
    else if (st.pay === 'partial') { paid = round2($('#bPaid', m).value); if (!(paid > 0) || paid >= t.total) return toast('Enter a part payment less than the total'); }
    const mode = $('#bMode', m).value;
    const data = {
      BillID: uid('b'), PartyID: st.pid, Date: $('#bDate', m).value || todayStr(), Items: items, IsGst: st.isGst, PartyGstin: $('#bGstin', m).value,
      Paid: paid, Mode: paid > 0 ? mode : '', cashbook: paid > 0 && mode === 'Cash' && $('#bCash', m).checked, Note: $('#bNote', m).value
    };
    const br = $('#bBranch', m); if (br) data.Branch = br.value;
    enqueue('bill.add', data);
    closeModal(m); toast('Bill saved');
    go('bill', { id: data.BillID });
  };
}

/* ---------- Cashbook / expense forms ---------- */
const EXP_CATS = ['Rent', 'Salary', 'Electricity', 'Transport', 'Tea / Misc', 'Stock purchase', 'Repairs', 'Internet / Phone', 'Other'];
function cashForm(kind, existing) {
  const isEdit = !!existing; kind = isEdit ? existing.Kind : kind;
  const m = openModal(`<div class="mh"><h3 class="${kind === 'IN' ? 'grn' : 'red'}">${isEdit ? 'Edit ' : ''}Cash ${kind}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="grid2"><label>Amount (₹)<input id="cAmt" type="number" inputmode="decimal" min="0" step="0.01" value="${isEdit ? existing.Amount : ''}"></label>
    <label>Date<input id="cDate" type="date" value="${isEdit ? existing.Date : todayStr()}"></label></div>
    <label>Category / reason<input id="cCat" value="${esc(isEdit ? existing.Category : '')}" placeholder="e.g. Shop sale, Bank deposit"></label>
    <label>Note<input id="cNote" value="${esc(isEdit ? existing.Note : '')}"></label>
    <button class="btn primary" id="cSave" style="margin-top:12px">Save</button>`);
  $('#cSave', m).onclick = () => {
    const amount = round2($('#cAmt', m).value); if (!(amount > 0)) return toast('Enter the amount');
    const data = { CashID: isEdit ? existing.CashID : uid('c'), Date: $('#cDate', m).value || todayStr(), Kind: kind, Amount: amount, Category: $('#cCat', m).value, Note: $('#cNote', m).value };
    enqueue(isEdit ? 'cash.edit' : 'cash.add', data); closeModal(m); toast('Saved');
  };
  setTimeout(() => $('#cAmt', m).focus(), 50);
}
function expenseForm(existing) {
  const isEdit = !!existing;
  const m = openModal(`<div class="mh"><h3>${isEdit ? 'Edit' : 'Add'} expense</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="grid2"><label>Amount (₹)<input id="xAmt" type="number" inputmode="decimal" min="0" step="0.01" value="${isEdit ? existing.Amount : ''}"></label>
    <label>Date<input id="xDate" type="date" value="${isEdit ? existing.Date : todayStr()}"></label></div>
    <div class="grid2"><label>Category<input id="xCat" list="xCats" value="${esc(isEdit ? existing.Category : '')}" placeholder="Pick or type"><datalist id="xCats">${EXP_CATS.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label>Paid by<select id="xMode"><option ${isEdit && existing.Mode === 'Cash' ? 'selected' : ''}>Cash</option><option ${isEdit && existing.Mode === 'Online' ? 'selected' : ''}>Online</option></select></label></div>
    <label>Note<input id="xNote" value="${esc(isEdit ? existing.Note : '')}"></label>
    <button class="btn primary" id="xSave" style="margin-top:12px">Save</button>`);
  $('#xSave', m).onclick = () => {
    const amount = round2($('#xAmt', m).value); if (!(amount > 0)) return toast('Enter the amount');
    const data = { ExpenseID: isEdit ? existing.ExpenseID : uid('x'), Date: $('#xDate', m).value || todayStr(), Category: $('#xCat', m).value.trim() || 'Other', Amount: amount, Mode: $('#xMode', m).value, Note: $('#xNote', m).value };
    enqueue(isEdit ? 'exp.edit' : 'exp.add', data); closeModal(m); toast('Saved');
  };
  setTimeout(() => $('#xAmt', m).focus(), 50);
}

/* ---------- Customer link, reminder, image ---------- */
function linkModal(pid) {
  const p = S.idx.pmap.get(pid); if (!p) return;
  const link = customerLink(p);
  const m = openModal(`<div class="mh"><h3>Customer link</h3><button class="x" data-act="closeModal">&times;</button></div>
    <p class="muted small">${esc(p.Name)} can open this private link to see only their own ledger (view only). Anyone with the link can see it, so share it only with them.</p>
    ${link ? `<input id="lkVal" readonly value="${esc(link)}">` : '<p class="pend">The link will be ready after the customer is synced.</p>'}
    <div class="btns">
      ${link ? '<button class="btn" id="lkCopy">Copy</button><button class="btn green" id="lkWa">WhatsApp</button>' : ''}
      ${can('manager') && link ? '<button class="btn red" id="lkRegen">New link</button>' : ''}
    </div>`);
  if (link) {
    $('#lkCopy', m).onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { $('#lkVal', m).select(); document.execCommand('copy'); toast('Link copied'); } };
    $('#lkWa', m).onclick = () => openWa(waLink(p.Phone, 'Dear ' + p.Name + ', you can see your account with ' + (setting('BusinessName') || 'us') + ' here: ' + link));
    const rg = $('#lkRegen', m);
    if (rg) rg.onclick = () => confirmBox('The old link will stop working. Create a new one?', 'Create new link', async () => {
      try { await api('party.regen', { PartyID: pid }); await pull(); closeAllModals(); render(); linkModal(pid); toast('New link created'); } catch (e) { toast(e.message); }
    }, true);
  }
}
ACT.link = d => linkModal(d.id);

function fitText(g, text, maxW, size, weight) {
  let s = size; g.font = weight + ' ' + s + 'px Arial';
  while (g.measureText(text).width > maxW && s > 20) { s -= 2; g.font = weight + ' ' + s + 'px Arial'; }
}
function reminderImageBlob(p, bal) {
  return new Promise(res => {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1080, 640);
    g.fillStyle = '#0b4fa8'; g.fillRect(0, 0, 1080, 130);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    fitText(g, setting('BusinessName') || 'Payment reminder', 980, 54, 'bold'); g.fillText(setting('BusinessName') || 'Payment reminder', 50, 52);
    g.font = '28px Arial'; g.fillText('PAYMENT REMINDER', 50, 100);
    g.fillStyle = '#1c2430'; fitText(g, p.Name, 980, 46, 'bold'); g.fillText(p.Name, 50, 200);
    g.fillStyle = '#6b7686'; g.font = '30px Arial'; g.fillText('Amount due as on ' + fmtDate(todayStr()), 50, 262);
    g.fillStyle = bal > 0 ? '#b00020' : '#0d7a3e'; g.font = 'bold 120px Arial';
    g.fillText(rs(bal), 50, 365);
    g.fillStyle = '#fbeff0'; g.fillRect(50, 430, 980, 2);
    g.fillStyle = '#1c2430'; g.font = '30px Arial';
    let y = 480;
    if (setting('UpiId')) { g.fillText('Pay by UPI:  ' + setting('UpiId'), 50, y); y += 48; }
    if (setting('Phone')) { g.fillText('Call us:  ' + setting('Phone'), 50, y); y += 48; }
    g.fillStyle = '#6b7686'; g.font = '24px Arial';
    g.fillText('Please ignore if already paid. Thank you!', 50, 600);
    c.toBlob(b => res(b), 'image/png');
  });
}
async function shareReminderImage(p) {
  const bal = balOf(p.PartyID);
  const blob = await reminderImageBlob(p, bal);
  const name = 'reminder-' + p.Name.replace(/\W+/g, '_') + '.png';
  const file = new File([blob], name, { type: 'image/png' });
  const text = reminderText(p);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: text }); markReminded(p.PartyID); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  downloadBlob(blob, name);
  toast('Image saved. Attach it in the WhatsApp chat.');
  markReminded(p.PartyID);
  openWa(waLink(p.Phone, text));
}
ACT.reminderImg = d => { const p = S.idx.pmap.get(d.id); if (p) shareReminderImage(p); };
ACT.remind = d => {
  const p = S.idx.pmap.get(d.id); if (!p) return;
  if (!(balOf(p.PartyID) > 0.004)) return toast('Nothing is due from ' + p.Name);
  markReminded(p.PartyID); openWa(waLink(p.Phone, reminderText(p)));
  render(true);
};

/* One-by-one WhatsApp reminder queue (free click-to-send) */
function startReminderQueue(ids) {
  const list = ids.map(id => S.idx.pmap.get(id)).filter(p => p && balOf(p.PartyID) > 0.004);
  if (!list.length) return toast('Nothing to send');
  let i = 0, sent = 0, skipped = 0;
  const m = openModal('<div id="rqBody"></div>', { sticky: true });
  const draw = () => {
    const body = $('#rqBody', m);
    if (i >= list.length) {
      body.innerHTML = `<h3>Done</h3><p>${sent} reminder(s) opened in WhatsApp${skipped ? ', ' + skipped + ' skipped' : ''}.</p><button class="btn primary" id="rqClose">Close</button>`;
      $('#rqClose', m).onclick = () => { closeModal(m); render(); };
      return;
    }
    const p = list[i];
    body.innerHTML = `<div class="mh"><h3>Reminder ${i + 1} of ${list.length}</h3><button class="x" id="rqX">&times;</button></div>
      <div class="card"><div class="nm">${esc(p.Name)}</div><div class="sub">${esc(p.Phone || 'No mobile number saved')}</div><div class="b red" style="font-size:20px">${rs(balOf(p.PartyID))}</div></div>
      <label>Message (you can edit)<textarea id="rqText" rows="6">${esc(reminderText(p))}</textarea></label>
      <div class="btns"><button class="btn" id="rqSkip">Skip</button><button class="btn green" id="rqSend">Open WhatsApp &rarr;</button></div>
      <p class="muted small">WhatsApp opens with the message ready. Tap send there, then come back here for the next customer.</p>`;
    $('#rqX', m).onclick = () => { closeModal(m); render(); };
    $('#rqSkip', m).onclick = () => { skipped++; i++; draw(); };
    $('#rqSend', m).onclick = () => { openWa(waLink(p.Phone, $('#rqText', m).value)); markReminded(p.PartyID); sent++; i++; draw(); };
  };
  draw();
}

/* ---------- Statements ---------- */
function computeStatement(p, mode, from, to) {
  const all = (S.idx.byParty.get(p.PartyID) || []);
  let run = num(p.OpeningBalance);
  const list = all.map(e => { run = round2(run + (e.Kind === 'GAVE' ? 1 : -1) * num(e.Amount)); return { e: e, bal: run }; });
  let opening = num(p.OpeningBalance), rows = list, label = 'All entries';
  if (mode === 'zero') {
    let lz = -1; list.forEach((x, i) => { if (Math.abs(x.bal) < 0.005) lz = i; });
    rows = list.slice(lz + 1); opening = lz >= 0 ? 0 : num(p.OpeningBalance);
    label = 'Since last zero balance' + (lz >= 0 ? ' (' + fmtDate(list[lz].e.Date) + ')' : '');
  } else if (mode === 'range') {
    const before = list.filter(x => x.e.Date < from);
    opening = before.length ? before[before.length - 1].bal : num(p.OpeningBalance);
    rows = list.filter(x => x.e.Date >= from && x.e.Date <= to);
    label = fmtDate(from) + ' to ' + fmtDate(to);
  }
  return { opening: opening, rows: rows, closing: rows.length ? rows[rows.length - 1].bal : opening, label: label };
}
function statementHtml(p, mode, from, to) {
  const s = computeStatement(p, mode, from, to);
  let gv = 0, gt = 0;
  const body = s.rows.map(x => {
    const a = num(x.e.Amount); if (x.e.Kind === 'GAVE') gv += a; else gt += a;
    return `<tr><td>${fmtDate(x.e.Date)}</td><td>${esc((x.e.NoteText || '').slice(0, 220)).replace(/\n/g, '<br>')}</td><td class="r g">${x.e.Kind === 'GAVE' ? NF.format(a) : ''}</td><td class="r k">${x.e.Kind === 'GOT' ? NF.format(a) : ''}</td><td class="r">${NF.format(Math.abs(x.bal))}${x.bal > 0 ? ' Dr' : x.bal < 0 ? ' Cr' : ''}</td></tr>`;
  }).join('');
  const c = s.closing;
  return '<html><head><meta charset="utf-8"><title>Statement</title>' + PRINT_CSS + '</head><body>' +
    bizHead('<h3 style="margin:0">ACCOUNT STATEMENT</h3><div>' + esc(s.label) + '</div><div>Generated ' + fmtDate(todayStr()) + '</div>') +
    '<div><b>' + esc(p.Name) + '</b>' + (p.Phone ? ' &nbsp; Phone: ' + esc(p.Phone) : '') + '</div><br>' +
    '<table><tr><th>Date</th><th>Details</th><th class="r">You gave</th><th class="r">You got</th><th class="r">Balance</th></tr>' +
    '<tr><td colspan="4"><i>Opening balance</i></td><td class="r">' + NF.format(Math.abs(s.opening)) + (s.opening > 0 ? ' Dr' : s.opening < 0 ? ' Cr' : '') + '</td></tr>' + body +
    '<tr><th colspan="2">Totals</th><th class="r">' + NF.format(gv) + '</th><th class="r">' + NF.format(gt) + '</th><th></th></tr></table><br>' +
    '<h3>' + (c > 0.004 ? 'You will get ' + rs(c) : c < -0.004 ? 'You will give ' + rs(-c) : 'Settled ₹0') + '</h3>' +
    '<div style="color:#666;font-size:11px">Dr = to be received / Cr = payable</div>' + payBlockLocal() + '</body></html>';
}
function statementModal(pid) {
  const p = S.idx.pmap.get(pid); if (!p) return;
  const now = new Date();
  const st = { mode: 'zero', from: dateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayStr() };
  const m = openModal(`<div class="mh"><h3>Statement · ${esc(p.Name)}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="chips" id="stChips">
      <button class="chip on" data-v="zero">Since last zero balance</button><button class="chip" data-v="month">This month</button>
      <button class="chip" data-v="lastmonth">Last month</button><button class="chip" data-v="range">Custom dates</button><button class="chip" data-v="all">All entries</button>
    </div>
    <div class="grid2" id="stDates" hidden><label>From<input type="date" id="stFrom"></label><label>To<input type="date" id="stTo"></label></div>
    <div class="card" id="stInfo"></div>
    <div class="btns"><button class="btn" id="stPrint">Print / Save PDF</button><button class="btn green" id="stWa">PDF link on WhatsApp</button></div>
    <p class="muted small">"PDF link on WhatsApp" creates the PDF in your Drive folder and sends its link (needs internet and all entries synced).</p>`);
  $('#stFrom', m).value = st.from; $('#stTo', m).value = st.to;
  const resolve = () => {
    const y = now.getFullYear(), mo = now.getMonth();
    if (st.mode === 'month') return { mode: 'range', from: dateStr(new Date(y, mo, 1)), to: dateStr(new Date(y, mo + 1, 0)) };
    if (st.mode === 'lastmonth') return { mode: 'range', from: dateStr(new Date(y, mo - 1, 1)), to: dateStr(new Date(y, mo, 0)) };
    if (st.mode === 'range') return { mode: 'range', from: $('#stFrom', m).value, to: $('#stTo', m).value };
    return { mode: st.mode, from: '', to: '' };
  };
  const info = () => {
    const r = resolve(); const s = computeStatement(p, r.mode, r.from, r.to);
    $('#stInfo', m).innerHTML = `<div class="sub">${esc(s.label)}</div><div>${s.rows.length} entries · closing <b class="${s.closing > 0 ? 'red' : 'grn'}">${rs(s.closing)}</b> ${s.closing > 0.004 ? 'to get' : s.closing < -0.004 ? 'to give' : ''}</div>`;
  };
  $$('#stChips .chip', m).forEach(b => b.onclick = () => {
    st.mode = b.dataset.v; $$('#stChips .chip', m).forEach(x => x.classList.toggle('on', x === b));
    $('#stDates', m).hidden = st.mode !== 'range'; info();
  });
  $('#stFrom', m).onchange = info; $('#stTo', m).onchange = info;
  info();
  $('#stPrint', m).onclick = () => { const r = resolve(); printHtml(statementHtml(p, r.mode, r.from, r.to)); };
  $('#stWa', m).onclick = async () => {
    if (!navigator.onLine) return toast('You need internet for this');
    if (S.queue.length) return toast('Wait for pending entries to sync first');
    const r = resolve();
    if (r.mode === 'range' && (!r.from || !r.to)) return toast('Pick both dates');
    const b = $('#stWa', m); b.disabled = true; b.textContent = 'Creating PDF…';
    try {
      const res = await api('report.pdf', { PartyID: pid, mode: r.mode, from: r.from, to: r.to });
      const s = computeStatement(p, r.mode, r.from, r.to);
      const msg = 'Dear ' + p.Name + ',\nHere is your account statement (' + s.label + ') from ' + (setting('BusinessName') || 'us') + ':\n' + res.url +
        '\n' + (s.closing > 0.004 ? 'Balance to be paid: ' + rs(s.closing) : s.closing < -0.004 ? 'Balance payable to you: ' + rs(-s.closing) : 'Your account is settled.') +
        (customerLink(p) ? '\nView your ledger anytime: ' + customerLink(p) : '');
      openWa(waLink(p.Phone, msg));
    } catch (e) { toast(e.message); } finally { b.disabled = false; b.textContent = 'PDF link on WhatsApp'; }
  };
}
ACT.statement = d => statementModal(d.id);

/* ---------- Party menu ---------- */
function partyMenu(pid) {
  const p = S.idx.pmap.get(pid); if (!p) return;
  const m = openModal(`<div class="mh"><h3>${esc(p.Name)}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="list">
      ${can('manager') ? '<div class="row" data-act="menuEdit" data-id="' + esc(pid) + '">&#9998; Edit details</div>' : ''}
      <div class="row" data-act="link" data-id="${esc(pid)}">&#128279; Customer link</div>
      <div class="row" data-act="reminderImg" data-id="${esc(pid)}">&#128444; Reminder image on WhatsApp</div>
      ${can('manager') ? '<div class="row" data-act="statement" data-id="' + esc(pid) + '">&#128196; Statement / report</div>' : ''}
      ${can('manager') ? '<div class="row red" data-act="menuDelParty" data-id="' + esc(pid) + '">&#128465; Delete ledger</div>' : ''}
    </div>`);
  return m;
}
ACT.menu = d => partyMenu(d.id);
ACT.menuEdit = d => { closeAllModals(); const p = S.idx.pmap.get(d.id); if (p) partyForm(p.Type, p); };
ACT.menuDelParty = d => {
  const p = S.idx.pmap.get(d.id); if (!p) return;
  const b = balOf(d.id);
  confirmBox('Delete ' + p.Name + '\'s ledger' + (Math.abs(b) > 0.004 ? ' (balance ' + rs(b) + ' is not zero)' : '') + '? It goes to the recycle bin and can be restored.', 'Delete', () => {
    enqueue('party.delete', { PartyID: d.id }); closeAllModals(); S.route = { name: 'parties' }; render(); toast('Moved to recycle bin');
  }, true);
};

/* ---------- Users (owner) ---------- */
function userForm(u, done) {
  const isEdit = !!u;
  const branches = ['All'].concat((setting('Branches') || '').split(',').map(s => s.trim()).filter(Boolean));
  const m = openModal(`<div class="mh"><h3>${isEdit ? 'Edit' : 'Add'} user</h3><button class="x" data-act="closeModal">&times;</button></div>
    <label>Name<input id="uName" value="${esc(isEdit ? u.Name : '')}"></label>
    <label>Mobile number (login)<input id="uPhone" type="tel" inputmode="numeric" value="${esc(isEdit ? u.Phone : '')}"></label>
    <div class="grid2"><label>Role<select id="uRole"><option value="staff" ${isEdit && u.Role === 'staff' ? 'selected' : ''}>Staff (add only)</option><option value="manager" ${isEdit && u.Role === 'manager' ? 'selected' : ''}>Manager</option><option value="owner" ${isEdit && u.Role === 'owner' ? 'selected' : ''}>Owner</option></select></label>
    <label>Branch<select id="uBranch">${branches.map(b => `<option ${isEdit && u.Branch === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label></div>
    <label>${isEdit ? 'New PIN (leave blank to keep)' : 'PIN (4 to 8 digits)'}<input id="uPin" type="password" inputmode="numeric" maxlength="8"></label>
    ${isEdit ? `<label class="check"><input type="checkbox" id="uActive" ${u.Active === 'Y' ? 'checked' : ''}> Active (can log in)</label>` : ''}
    <button class="btn primary" id="uSave" style="margin-top:12px">Save</button>`);
  $('#uSave', m).onclick = async () => {
    const b = $('#uSave', m); b.disabled = true;
    try {
      await api('users.save', { user: { UserID: isEdit ? u.UserID : '', Name: $('#uName', m).value, Phone: $('#uPhone', m).value, Role: $('#uRole', m).value, Branch: $('#uBranch', m).value, Pin: $('#uPin', m).value, Active: isEdit ? $('#uActive', m).checked : true } });
      closeModal(m); toast('Saved'); if (done) done();
    } catch (e) { toast(e.message); b.disabled = false; }
  };
}

function changePinModal() {
  const m = openModal(`<div class="mh"><h3>Change PIN</h3><button class="x" data-act="closeModal">&times;</button></div>
    <label>Current PIN<input id="oPin" type="password" inputmode="numeric" maxlength="8"></label>
    <label>New PIN (4 to 8 digits)<input id="nPin" type="password" inputmode="numeric" maxlength="8"></label>
    <button class="btn primary" id="pinSave" style="margin-top:12px">Change PIN</button>`);
  $('#pinSave', m).onclick = async () => {
    try {
      const r = await api('me.changePin', { oldPin: $('#oPin', m).value, newPin: $('#nPin', m).value });
      S.token = r.token; await DB.set('session', { token: r.token, user: S.user });
      closeModal(m); toast('PIN changed');
    } catch (e) { toast(e.message); }
  };
}
ACT.changePin = () => changePinModal();
