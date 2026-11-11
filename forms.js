'use strict';
/* =====================================================================
   forms.js - modals/forms, rich text editor, WhatsApp messages, printing
   ===================================================================== */

/* ---------- Business label & wording (customer's point of view) ---------- */
const SEP = '-----------------------------';
function bizLabel() {
  const b = setting('BusinessName') || 'Business', c = setting('ContactPerson');
  return c ? b + ' - ' + c : b;
}
/* Closing sentence from the customer's side. bal > 0 means the party owes us. */
function perspective(bal) {
  if (bal > 0.004) return { t: 'You have to pay ' + bizLabel() + ': ' + rs(bal), cls: 'red', c: '#b00020' };
  if (bal < -0.004) return { t: bizLabel() + ' has to pay you: ' + rs(-bal), cls: 'grn', c: '#0d7a3e' };
  return { t: 'Your account is settled (₹0)', cls: 'grn', c: '#0d7a3e' };
}
function balLine(bal) {
  if (bal > 0.004) return 'Balance to pay: *' + rs(bal) + '*';
  if (bal < -0.004) return 'Balance in your favour: *' + rs(-bal) + '*';
  return 'Account settled';
}

/* ---------- WhatsApp / link helpers ---------- */
function waLink(phone, text) {
  let p = normPhone(phone);
  if (p.length === 10) p = '91' + p;
  return (p ? 'https://wa.me/' + p : 'https://wa.me/') + '?text=' + encodeURIComponent(text);
}
function openWa(url) { window.open(url, '_blank'); }
function appBase() {
  let u = (setting('AppUrl') || '').trim();
  if (!/^https?:\/\//i.test(u)) u = (CFG.APP_URL && /^https?:\/\//i.test(CFG.APP_URL)) ? CFG.APP_URL : (location.origin + location.pathname);
  u = u.replace(/[?#].*$/, '').replace(/index\.html$/, '');
  return u.endsWith('/') ? u : u + '/';
}
function customerLink(p) { return p && p.Code ? appBase() + '?c=' + p.Code : ''; }
function waMsg(parts) { return parts.filter(x => x !== null && x !== undefined && x !== false).join('\n'); }
function ledgerTail(p) { const l = customerLink(p); return l ? ['', 'View your ledger:', l] : []; }

const OLD_TEMPLATE_MARK = 'your pending balance with {business}';
function fillTemplate(t, p, amount) {
  return String(t).replace(/\{name\}/g, p.Name).replace(/\{amount\}/g, rs(amount)).replace(/\{business\}/g, setting('BusinessName') || '')
    .replace(/\{contact\}/g, setting('ContactPerson') || '').replace(/\{date\}/g, fmtDate(todayStr())).replace(/\{upi\}/g, setting('UpiId') || '')
    .replace(/\{link\}/g, customerLink(p) || '').replace(/\{phone\}/g, setting('Phone') || '');
}
function reminderText(p) {
  const bal = balOf(p.PartyID);
  const t = setting('ReminderTemplate');
  if (t && t.trim() && t.indexOf(OLD_TEMPLATE_MARK) < 0) return fillTemplate(t, p, bal);
  return waMsg([
    '*' + bizLabel() + '*', SEP, 'PAYMENT REMINDER', '',
    'Dear ' + p.Name + ',', 'Amount due: *' + rs(bal) + '*', 'As on: ' + fmtDate(todayStr()),
    setting('UpiId') ? '' : null, setting('UpiId') ? 'Pay by UPI: ' + setting('UpiId') : null,
    SEP].concat(customerLink(p) ? ['View your ledger:', customerLink(p)] : []));
}
function entryMsg(p, e, includeTotal) {
  const supplier = p.Type === 'supplier';
  let head;
  if (e.Kind === 'GOT') head = supplier ? 'Credit recorded: *' + rs(e.Amount) + '*' : (e.Mode === 'Refund' ? 'Refund credited: *' : 'Payment received: *') + rs(e.Amount) + '*' + (e.Mode && e.Mode !== 'Refund' ? ' (' + modeLabel(e.Mode) + ')' : '');
  else head = supplier ? 'Payment made: *' + rs(e.Amount) + '*' + (e.Mode ? ' (' + modeLabel(e.Mode) + ')' : '') : 'Added to your account: *' + rs(e.Amount) + '*';
  const note = htmlToText(e.NoteHTML || '').replace(/\s*\n\s*/g, ', ').slice(0, 110);
  return waMsg(['*' + bizLabel() + '*', SEP, 'Dear ' + p.Name + ',', '', head, 'Date: ' + fmtDate(e.Date), note ? 'Details: ' + note : null,
    includeTotal ? '' : null, includeTotal ? balLine(balOf(p.PartyID)) : null, SEP].concat(customerLink(p) ? ['View your ledger:', customerLink(p)] : []));
}
function linkMsg(p) {
  return waMsg(['*' + bizLabel() + '*', SEP, 'Dear ' + p.Name + ',', '', 'Your ledger is available here (view only):', customerLink(p), SEP]);
}
function billMsg(b, p, url) {
  const due = round2(num(b.Total) - num(b.Paid));
  return waMsg(['*' + bizLabel() + '*', SEP, 'Invoice: ' + b.BillNo, 'Date: ' + fmtDate(b.Date), '', 'Dear ' + p.Name + ',',
    'Total: ' + rs(b.Total), num(b.Paid) > 0 ? 'Paid: ' + rs(b.Paid) : null, due > 0 ? 'Balance due: *' + rs(due) + '*' : 'Status: *Paid*', '',
    'Invoice PDF:', url, SEP].concat(customerLink(p) ? ['View your ledger:', customerLink(p)] : []));
}
function statementMsg(p, s, url) {
  return waMsg(['*' + bizLabel() + '*', SEP, 'ACCOUNT STATEMENT', s.label, '', 'Dear ' + p.Name + ',', perspective(s.closing).t, '', 'Statement PDF:', url, SEP].concat(customerLink(p) ? ['View your ledger:', customerLink(p)] : []));
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

/* ---------- Print documents: one header / footer for every PDF ---------- */
const PRINT_CSS = '<style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1c2430;margin:0;padding:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
  'table{border-collapse:collapse;width:100%}td,th{padding:6px 7px;vertical-align:top;text-align:left}.r{text-align:right}.red{color:#b00020}.grn{color:#0d7a3e}' +
  '.bar{background:#1e4fae;height:8px;padding:0}.bx{border:1px solid #7a96c8;border-radius:8px}th{background:#dfe8f7}tr.z td{background:#eef3fb}' +
  '.items{border:1px solid #c9d4e8}.stamp{display:inline-block;border:3px solid;border-radius:8px;padding:2px 12px;font-weight:bold;font-size:16px;transform:rotate(-8deg);letter-spacing:2px}' +
  '.cap{text-align:center;color:#33446b;font-size:13px;margin:16px 0}.pay{border:1px solid #c9d4e8;border-radius:6px;padding:8px;font-size:11px;margin:10px 0}.sub{color:#5b6b86}</style>';
function docHead(rightHtml) {
  const st = k => esc(setting(k));
  return '<table><tr><td class="bar" style="padding:0"></td></tr></table><br><table><tr><td><div style="font-size:22px;font-weight:bold">' + st('BusinessName') + '</div>' +
    (setting('ContactPerson') ? '<div style="font-size:13px">Contact: ' + st('ContactPerson') + '</div>' : '') +
    (setting('Address') ? '<div>' + st('Address').replace(/\n/g, '<br>') + '</div>' : '') +
    (setting('Phone') ? '<div class="sub"><i>Phone: ' + st('Phone') + '</i></div>' : '') +
    (setting('GSTIN') ? '<div>GSTIN: ' + st('GSTIN') + '</div>' : '') + '</td><td class="r">' + rightHtml + '</td></tr></table><br>';
}
function docFoot(caption, signature) {
  const u = setting('UpiId'), b = setting('BankDetails');
  return '<div class="cap">~ ' + esc(caption) + ' ~</div>' +
    ((u || b) ? '<div class="pay">' + (u ? '<div><b>UPI ID:</b> ' + esc(u) + '</div>' : '') + (b ? '<div><b>Bank details</b><br>' + esc(b).replace(/\n/g, '<br>') + '</div>' : '') + '</div>' : '') +
    (signature ? '<div class="r" style="margin:26px 0 8px">For ' + esc(setting('BusinessName')) + '<br><br><br>AUTHORISED SIGNATURE</div>' : '') +
    '<div>' + esc(setting('BillFooter') || '').replace(/\n/g, '<br>') + '</div><br><table><tr><td class="bar"></td></tr></table>';
}
function numWords(n) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = x => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
  const three = x => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
  if (n === 0) return 'Zero';
  let s = ''; const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1000); n %= 1000;
  if (cr) s += three(cr) + ' Crore '; if (lk) s += two(lk) + ' Lakh '; if (th) s += two(th) + ' Thousand '; if (n) s += three(n);
  return s.trim();
}
function rupeesWords(amt) { amt = Math.abs(round2(amt)); const r = Math.floor(amt), p = Math.round((amt - r) * 100); return numWords(r) + ' rupees' + (p ? ' and ' + numWords(p) + ' paise' : '') + ' only'; }

function billPrintHtml(b) {
  const p = S.idx.pmap.get(b.PartyID) || { Name: '?', Phone: '' };
  const items = parseJ(b.Items, []), gst = b.IsGst === 'Y';
  const total = num(b.Total), paid = num(b.Paid), tax = num(b.Tax), taxable = num(b.Taxable) || total, due = round2(total - paid);
  const stt = due <= 0 ? ['PAID', '#0d7a3e'] : paid > 0 ? ['PART PAID', '#b26a00'] : ['UNPAID', '#b00020'];
  let qty = 0;
  const rows = items.map((it, i) => { qty += it.qty; return `<tr class="${i % 2 ? '' : 'z'}"><td>${i + 1}</td><td>${esc(it.desc).replace(/\n/g, '<br>')}</td><td class="r">${it.qty}</td><td class="r">${NF.format(it.rate)}</td>${gst ? '<td class="r">' + it.gst + '%</td>' : ''}<td class="r"><b>${NF.format(it.qty * it.rate)}</b></td></tr>`; }).join('');
  return '<html><head><meta charset="utf-8"><title>' + esc(b.BillNo) + '</title>' + PRINT_CSS + '</head><body>' +
    docHead('<div style="font-size:20px;font-weight:bold">' + (gst ? 'Tax Invoice' : 'Invoice') + ' No. ' + esc(b.BillNo) + '</div><div>Invoice Date: ' + fmtDate(b.Date) + '</div>') +
    '<table class="bx"><tr><td style="width:55%;padding:12px"><div class="sub">Bill and Ship To</div><div style="font-size:16px;font-weight:bold">' + esc(p.Name) + '</div>' +
    (p.Phone ? '<div><b>Phone: ' + esc(p.Phone) + '</b></div>' : '') + '<div class="sub"><i>GSTIN: ' + esc(b.PartyGstin || '') + '</i></div></td>' +
    '<td class="r" style="padding:12px"><div class="stamp" style="color:' + stt[1] + '">' + stt[0] + '</div><div style="margin-top:6px">Total amount</div><div style="font-size:28px;font-weight:bold">' + NF.format(total) + '</div><div class="sub"><i>' + esc(rupeesWords(total)) + '</i></div></td></tr></table><br>' +
    '<table class="items"><tr><th>#</th><th>Item Details</th><th class="r">Qty</th><th class="r">Rate</th>' + (gst ? '<th class="r">GST</th>' : '') + '<th class="r">Total</th></tr>' + rows +
    '<tr style="background:#dfe8f7"><td colspan="' + (gst ? 3 : 2) + '"><small>Sub-total Amount</small></td><td class="r"><small>' + qty + '</small></td><td></td><td class="r"><small>' + NF.format(taxable) + '</small></td></tr></table><br>' +
    '<table><tr><td style="width:50%">' + (b.Note ? '<b>Note:</b> ' + esc(b.Note).replace(/\n/g, '<br>') : '') + '</td><td><table class="bx" style="background:#f6f8fc">' +
    '<tr><td>' + (gst ? 'Taxable value' : 'Sub-total') + '</td><td class="r">' + rs(taxable) + '</td></tr>' +
    (gst ? '<tr><td>CGST</td><td class="r">' + rs(tax / 2) + '</td></tr><tr><td>SGST</td><td class="r">' + rs(tax / 2) + '</td></tr>' : '') +
    '<tr><td style="font-size:14px"><b>Total</b></td><td class="r" style="font-size:14px"><b>' + rs(total) + '</b></td></tr><tr><td class="grn">Paid</td><td class="r grn">' + rs(paid) + '</td></tr>' +
    '<tr><td><b>Balance due</b></td><td class="r ' + (due > 0 ? 'red' : 'grn') + '"><b>' + rs(due) + '</b></td></tr></table></td></tr></table>' +
    docFoot('THIS IS A DIGITALLY CREATED INVOICE', true) + '</body></html>';
}

/* ---------- Rich text editor ---------- */
function editorBlock(id, html) {
  const cols = ['#c62828', '#0d7a3e', '#1565c0', '#ef6c00', '#6a1b9a', '#00838f'];
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
function fileToDataUrl(file) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); }); }
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
      try { const url = await fileToImageDataUrl(img.getAsFile()); ed.focus(); document.execCommand('insertImage', false, url); } catch (er) { toast(er.message); }
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
    <div id="pWarn"></div>
    <div class="grid2">
      <label>Opening balance (₹)<input id="pOb" type="number" inputmode="decimal" min="0" step="0.01" value="${ob ? Math.abs(ob) : ''}" placeholder="0"></label>
      <label>Opening balance is<select id="pObType"><option value="get" ${ob >= 0 ? 'selected' : ''}>You will get</option><option value="give" ${ob < 0 ? 'selected' : ''}>You will give</option></select></label>
    </div>
    <label>Notes (optional)<input id="pNotes" value="${esc(isEdit ? existing.Notes : '')}"></label>
    <button class="btn primary" id="pSave" style="margin-top:12px">Save</button>`);
  const dupOf = () => { const ph = normPhone($('#pPhone', m).value); return ph.length === 10 ? S.data.parties.find(p => p.Deleted !== 'Y' && p.Phone === ph && (!isEdit || p.PartyID !== existing.PartyID)) : null; };
  $('#pPhone', m).oninput = () => { const d = dupOf(); $('#pWarn', m).innerHTML = d ? `<div class="warnbox">This mobile number is already saved for <b>${esc(d.Name)}</b>.</div>` : ''; };
  $('#pSave', m).onclick = () => {
    const name = $('#pName', m).value.trim();
    if (!name) return toast('Enter a name');
    const phone = normPhone($('#pPhone', m).value);
    if (phone && phone.length !== 10) return toast('Mobile number should be 10 digits');
    const amt = round2($('#pOb', m).value);
    const ob2 = $('#pObType', m).value === 'give' ? -amt : amt;
    const dup = dupOf();
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
function entryForm(pid, kind, existing, prefill) {
  const p = S.idx.pmap.get(pid); if (!p) return;
  const isEdit = !!existing;
  kind = isEdit ? existing.Kind : kind;
  const list = isEdit ? atts(existing).slice() : [];
  const isGave = kind === 'GAVE';
  const hasMode = kind === 'GOT' || p.Type === 'supplier';
  const modes = kind === 'GOT' ? ['Cash', 'UPI', 'Refund'] : ['Cash', 'UPI'];
  let mode = isEdit ? (modeLabel(existing.Mode) || 'Cash') : 'Cash';
  if (modes.indexOf(mode) < 0) mode = 'Cash';
  const dirOk = !!cashDir(p, kind);
  const hadCash = isEdit && S.data.cash.some(c => c.LinkedEntryID === existing.EntryID && c.Deleted !== 'Y');
  const m = openModal(`<div class="mh"><h3 class="${isGave ? 'red' : 'grn'}">${isEdit ? 'Edit entry · ' : ''}${isGave ? 'You gave' : 'You got'} · ${esc(p.Name)}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="grid2">
      <label>Amount (₹)<input id="fAmt" type="number" inputmode="decimal" min="0" step="0.01" value="${isEdit ? existing.Amount : ''}"></label>
      <label>Date<input id="fDate" type="date" value="${isEdit ? existing.Date : todayStr()}"></label>
    </div>
    ${hasMode ? `<label>${kind === 'GOT' ? 'Received as' : 'Paid by'}</label><div class="seg" id="fModes">${modes.map(x => `<button type="button" data-v="${x}" class="${x === mode ? 'on' : ''}">${x === 'UPI' ? 'UPI' : x}</button>`).join('')}</div>` : ''}
    ${dirOk ? `<label class="check" id="fCashWrap"><input type="checkbox" id="fCash" ${(isEdit ? hadCash : true) ? 'checked' : ''}> Also record in Cashbook (${cashDir(p, kind) === 'IN' ? 'cash IN' : 'cash OUT'})</label>` : ''}
    <label>Details</label>
    ${editorBlock('fEd', isEdit ? cleanHtml(existing.NoteHTML) : (prefill && prefill.html) || '')}
    <div class="attlist" id="fAtts"></div>
    <button type="button" class="btn sm p4" id="fAttach">&#128206; Attach PDF / photo</button>
    <input type="file" id="fFile" hidden multiple accept="image/*,application/pdf">
    ${!isEdit ? `<label class="check"><input type="checkbox" id="fNotify"> Send WhatsApp message to ${esc(p.Name)} after saving</label>
      <label class="check" id="fTotWrap" hidden><input type="checkbox" id="fTotal" checked> Include running total in message</label>` : ''}
    ${!isEdit && isGave && p.Type === 'customer' ? `<label class="check"><input type="checkbox" id="fBill"> Create a bill for this entry (GST / non-GST)</label>` : ''}
    <button class="btn primary" id="fSave" style="margin-top:10px">Save</button>`);
  const ed = $('#fEd', m); bindEditor(m, ed);
  const syncCashBox = () => { const w = $('#fCashWrap', m); if (w) { w.hidden = mode !== 'Cash'; } };
  syncCashBox();
  $$('#fModes button', m).forEach(b => b.onclick = () => { mode = b.dataset.v; $$('#fModes button', m).forEach(x => x.classList.toggle('on', x === b)); const c = $('#fCash', m); if (c && !isEdit) c.checked = mode === 'Cash'; syncCashBox(); });
  const drawAtts = () => {
    $('#fAtts', m).innerHTML = list.filter(a => !a.inline).map(a =>
      `<span class="a">${(a.mime || '').indexOf('image/') === 0 ? `<img src="${esc(a.dataUrl || a.url)}" alt="">` : '&#128196;'}${esc((a.name || 'file').slice(0, 24))} <b data-rm="${list.indexOf(a)}">&times;</b></span>`).join('');
    $$('#fAtts [data-rm]', m).forEach(b => b.onclick = () => { list.splice(+b.dataset.rm, 1); drawAtts(); });
  };
  drawAtts();
  $('#fAttach', m).onclick = () => $('#fFile', m).click();
  $('#fFile', m).onchange = async ev => {
    for (const f of Array.from(ev.target.files)) {
      try {
        if (f.type.indexOf('image/') === 0) list.push({ name: f.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', dataUrl: await fileToImageDataUrl(f) });
        else if (f.type === 'application/pdf') { if (f.size > 8 * 1024 * 1024) { toast('PDF is larger than 8 MB'); continue; } list.push({ name: f.name, mime: 'application/pdf', dataUrl: await fileToDataUrl(f) }); }
        else toast('Only images and PDF files are supported');
      } catch (er) { toast(er.message); }
    }
    ev.target.value = ''; drawAtts();
  };
  const nt = $('#fNotify', m);
  if (nt) nt.onchange = () => { $('#fTotWrap', m).hidden = !nt.checked; };
  $('#fSave', m).onclick = () => {
    const amount = round2($('#fAmt', m).value);
    if (!(amount > 0)) return toast('Enter the amount');
    const date = $('#fDate', m).value || todayStr();
    const html = editorValue(ed);
    if ($('#fBill', m) && $('#fBill', m).checked) {
      closeModal(m);
      billForm({ PartyID: pid, Date: date, Items: [{ desc: htmlToText(html) || '', qty: 1, rate: amount, gst: 0 }] });
      return;
    }
    const cashChk = $('#fCash', m);
    const data = {
      EntryID: isEdit ? existing.EntryID : uid('e'), PartyID: pid, Date: date, Kind: kind, Amount: amount, NoteHTML: html,
      Mode: hasMode ? mode : '', Attachments: list, cashbook: !!(cashChk && cashChk.checked && mode === 'Cash')
    };
    enqueue(isEdit ? 'entry.edit' : 'entry.add', data);
    closeModal(m); toast('Saved');
    if (nt && nt.checked) openWa(waLink(p.Phone, entryMsg(p, data, $('#fTotal', m).checked)));
  };
  setTimeout(() => $('#fAmt', m).focus(), 50);
}

function viewEntry(id) {
  const e = S.data.entries.find(x => x.EntryID === id); if (!e) return;
  const p = S.idx.pmap.get(e.PartyID);
  const al = atts(e).filter(a => !a.inline);
  const bill = /^b_.+-[GP]$/.test(e.EntryID);
  const m = openModal(`<div class="mh"><h3 class="${e.Kind === 'GAVE' ? 'red' : 'grn'}">${e.Kind === 'GAVE' ? 'You gave' : 'You got'} ${rs(e.Amount)}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="sub">${esc(p ? p.Name : '')} · ${fmtDate(e.Date)} · added ${fmtDate((e.CreatedAt || '').slice(0, 10))} ${fmtTime(e.CreatedAt)} by ${esc(e.CreatedBy || '')}${e.Mode ? ' · ' + esc(modeLabel(e.Mode)) : ''}</div>
    ${e._pending ? '<div class="pend">Waiting to sync…</div>' : ''}
    <div class="rtv" style="margin:10px 0;word-break:break-word">${cleanHtml(e.NoteHTML) || '<span class="muted">No details</span>'}</div>
    <div class="atts">${al.map(a => (a.mime || '').indexOf('image/') === 0 ? `<img class="th" src="${esc(a.dataUrl || a.url)}" alt="">` : `<a class="attchip" target="_blank" rel="noopener" href="${esc(a.url || '#')}">&#128196; ${esc(a.name || 'file')}</a>`).join('')}</div>
    <div class="btns">
      ${p ? '<button class="btn p2" data-act="shareEntry" data-id="' + esc(id) + '">WhatsApp</button>' : ''}
      ${can('manager') && !bill && !e._pending ? '<button class="btn p4" data-act="editEntry" data-id="' + esc(id) + '">Edit</button>' : ''}
      ${can('manager') && !bill && !e._pending ? '<button class="btn red" data-act="delEntry" data-id="' + esc(id) + '">Delete</button>' : ''}
    </div>
    ${bill ? '<div class="muted small">This entry belongs to a bill. Open the bill to edit or delete it.</div>' : ''}`);
  return m;
}
ACT.viewEntry = d => viewEntry(d.id);
ACT.editEntry = d => { const e = S.data.entries.find(x => x.EntryID === d.id); closeAllModals(); if (e) entryForm(e.PartyID, e.Kind, e); };
ACT.delEntry = d => confirmBox('Delete this entry? It will go to the recycle bin.', 'Delete', () => { enqueue('entry.delete', { EntryID: d.id }); closeAllModals(); toast('Deleted'); }, true);
ACT.shareEntry = d => { const e = S.data.entries.find(x => x.EntryID === d.id); const p = e && S.idx.pmap.get(e.PartyID); if (p) openWa(waLink(p.Phone, entryMsg(p, e, true))); };

/* ---------- Bill form (new + edit) ---------- */
function autoGrow(el) {
  el.style.height = 'auto';
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
  el.style.height = Math.min(el.scrollHeight + 2, lh * 12 + 24) + 'px';
}
function billForm(init) {
  init = init || {};
  const edit = init.edit || null;
  const eb = edit ? { items: parseJ(edit.Items, []), gst: edit.IsGst === 'Y' } : null;
  const payE = edit ? S.data.entries.find(e => e.EntryID === edit.BillID + '-P' && e.Deleted !== 'Y') : null;
  const st = {
    isGst: eb ? eb.gst : false,
    items: (eb ? eb.items : (init.Items && init.Items.length ? init.Items : [{ desc: '', qty: 1, rate: '', gst: 0 }])).map(x => Object.assign({}, x)),
    pay: edit ? (num(edit.Paid) >= num(edit.Total) ? 'full' : num(edit.Paid) > 0 ? 'partial' : 'unpaid') : 'unpaid',
    mode: payE ? (modeLabel(payE.Mode) === 'UPI' ? 'UPI' : 'Cash') : 'Cash',
    pid: edit ? edit.PartyID : (init.PartyID || ''), isNew: false, newName: '', newPhone: ''
  };
  const hadCash = !!(edit && S.data.cash.some(c => c.LinkedEntryID === edit.BillID + '-P' && c.Deleted !== 'Y'));
  const m = openModal(`<div class="mh"><h3>${edit ? 'Edit bill ' + esc(edit.BillNo) : 'New bill'}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div id="bCust"></div>
    <div class="grid2">
      <label>Bill date<input id="bDate" type="date" value="${edit ? esc(edit.Date) : esc(init.Date || todayStr())}"></label>
      <label>Customer GSTIN (optional)<input id="bGstin" maxlength="15" value="${edit ? esc(edit.PartyGstin || '') : ''}" placeholder="24ABCDE1234F1Z5" style="text-transform:uppercase"></label>
    </div>
    <div class="seg" id="bType"><button type="button" data-v="non" class="${st.isGst ? '' : 'on'}">Non-GST bill</button><button type="button" data-v="gst" class="${st.isGst ? 'on' : ''}">GST bill</button></div>
    <div id="bItems"></div>
    <button type="button" class="btn sm p4" id="bAdd">+ Add another item</button>
    <div class="card" id="bTot"></div>
    <label>Payment</label>
    <div class="seg" id="bPay"><button type="button" data-v="unpaid">Unpaid</button><button type="button" data-v="partial">Partly paid</button><button type="button" data-v="full">Fully paid</button></div>
    <div id="bPaidWrap" hidden>
      <div class="grid2"><label id="bPaidAmtWrap">Amount received (₹)<input id="bPaid" type="number" inputmode="decimal" min="0" step="0.01" value="${edit && num(edit.Paid) > 0 ? esc(edit.Paid) : ''}"></label>
      <div><label>Received by</label><div class="seg" id="bMode"><button type="button" data-v="Cash">Cash</button><button type="button" data-v="UPI">UPI</button></div></div></div>
      <label class="check" id="bCashWrap"><input type="checkbox" id="bCash" ${edit ? (hadCash ? 'checked' : '') : 'checked'}> Also record in Cashbook</label>
    </div>
    <label>Note (optional)<input id="bNote" maxlength="300" value="${edit ? esc(edit.Note || '') : ''}"></label>
    <button class="btn primary" id="bSave" style="margin-top:12px">${edit ? 'Save changes' : 'Save bill'}</button>`, { full: true });

  /* customer picker */
  const custBox = $('#bCust', m);
  const parties = () => S.data.parties.filter(p => p.Deleted !== 'Y' && p.Type === 'customer');
  const byPhone = ph => ph.length === 10 ? parties().find(p => p.Phone === ph) : null;
  function drawCust() {
    if (edit) {
      const p = S.idx.pmap.get(st.pid);
      custBox.innerHTML = `<div class="chosen"><div class="mid"><div class="nm">${esc(p ? p.Name : '?')}</div><div class="sub">${esc(p && p.Phone || '')}</div></div></div>`; return;
    }
    if (st.pid && !st.isNew) {
      const p = S.idx.pmap.get(st.pid);
      custBox.innerHTML = `<label>Customer</label><div class="chosen"><div class="mid"><div class="nm">${esc(p.Name)}</div><div class="sub">${esc(p.Phone || 'No mobile')} · balance ${rs(balOf(p.PartyID))}</div></div><button type="button" class="btn sm" id="bChange">Change</button></div>`;
      $('#bChange', m).onclick = () => { st.pid = ''; st.isNew = false; drawCust(); };
      return;
    }
    if (st.isNew) {
      custBox.innerHTML = `<label>New customer name<input id="bNName" value="${esc(st.newName)}" placeholder="Customer name"></label>
        <label>Mobile number<input id="bNPhone" type="tel" inputmode="numeric" maxlength="10" value="${esc(st.newPhone)}" placeholder="10 digit number"></label><div id="bNWarn"></div>
        <button type="button" class="btn sm" id="bBack" style="margin-top:6px">&larr; Search existing customers</button>`;
      const warn = () => {
        const ph = normPhone($('#bNPhone', m).value), nm = $('#bNName', m).value.trim().toLowerCase();
        const d = byPhone(ph);
        if (d && d.Name.trim().toLowerCase() !== nm) $('#bNWarn', m).innerHTML = `<div class="warnbox">This mobile number already belongs to <b>${esc(d.Name)}</b>. Is it the same person?<div class="btns"><button type="button" class="btn sm p2" id="bUse">Use ${esc(d.Name)}</button></div></div>`;
        else $('#bNWarn', m).innerHTML = '';
        const u = $('#bUse', m); if (u) u.onclick = () => { st.pid = d.PartyID; st.isNew = false; drawCust(); };
      };
      $('#bNName', m).oninput = e => { st.newName = e.target.value; warn(); };
      $('#bNPhone', m).oninput = e => { st.newPhone = e.target.value.replace(/\D/g, ''); e.target.value = st.newPhone; warn(); };
      $('#bBack', m).onclick = () => { st.isNew = false; drawCust(); };
      warn(); return;
    }
    custBox.innerHTML = `<label>Customer<input id="bQ" placeholder="Type name or mobile number…" autocomplete="off"></label><div id="bSug"></div>`;
    const q = $('#bQ', m);
    const suggest = () => {
      const t = q.value.trim().toLowerCase(); const sug = $('#bSug', m);
      if (!t) { sug.innerHTML = ''; return; }
      const hits = parties().filter(p => p.Name.toLowerCase().includes(t) || (p.Phone || '').includes(t.replace(/\D/g, '') || '\u0000')).sort((a, b) => ((b.Fav === 'Y') - (a.Fav === 'Y'))).slice(0, 8);
      const exact = hits.some(p => p.Name.trim().toLowerCase() === t);
      sug.innerHTML = '<div class="suggest">' + hits.map(p => `<div class="s" data-p="${esc(p.PartyID)}"><div class="nm">${p.Fav === 'Y' ? '★ ' : ''}${esc(p.Name)}</div><div class="sub">${esc(p.Phone || 'No mobile')} · ${balOf(p.PartyID) > 0.004 ? 'owes ' + rs(balOf(p.PartyID)) : 'settled'}</div></div>`).join('') +
        (exact ? '' : `<div class="s new" data-new="1">+ Add new customer "${esc(q.value.trim())}"</div>`) + '</div>';
      $$('#bSug .s', m).forEach(el => el.onclick = () => {
        if (el.dataset.new) { const raw = q.value.trim(); const digits = raw.replace(/\D/g, ''); st.isNew = true; if (digits.length >= 10 && digits.length === raw.replace(/[\s+\-]/g, '').length) { st.newPhone = digits.slice(-10); st.newName = ''; } else { st.newName = raw; st.newPhone = ''; } }
        else st.pid = el.dataset.p;
        drawCust();
      });
    };
    q.oninput = suggest;
    if (!st.pid) setTimeout(() => q.focus(), 60);
  }
  drawCust();

  /* items */
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
      <label style="margin-top:0">Item details (you can write up to 12 lines)<textarea class="bd" rows="3" maxlength="1500" placeholder="e.g. PNR 8154568282 | 04 Oct | Surat to Bhagat Ki Kothi&#10;Passengers, route, other details…">${esc(it.desc)}</textarea></label>
      <div class="grid2"><label>Qty<input class="bq" type="number" inputmode="decimal" min="0" step="any" value="${esc(it.qty)}"></label>
      <label>Rate (₹)<input class="br" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(it.rate)}"></label></div>
      ${st.isGst ? `<label>GST %<select class="bg">${[0, 5, 12, 18, 28].map(g => `<option ${+it.gst === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>` : ''}
      ${st.items.length > 1 ? '<button type="button" class="btn sm red bx" style="margin-top:6px">Remove item</button>' : ''}</div>`).join('');
    $$('#bItems .card', m).forEach(c => {
      const i = +c.dataset.i, ta = $('.bd', c);
      ta.oninput = e => { st.items[i].desc = e.target.value; autoGrow(ta); };
      setTimeout(() => autoGrow(ta), 0);
      $('.bq', c).oninput = e => { st.items[i].qty = e.target.value; drawTot(); };
      $('.br', c).oninput = e => { st.items[i].rate = e.target.value; drawTot(); };
      const g = $('.bg', c); if (g) g.onchange = e => { st.items[i].gst = +e.target.value; drawTot(); };
      const x = $('.bx', c); if (x) x.onclick = () => { st.items.splice(i, 1); drawItems(); drawTot(); };
    });
  };
  if (st.isGst) st.items.forEach(it => { if (it.gst === undefined) it.gst = 18; });
  drawItems(); drawTot();
  $('#bAdd', m).onclick = () => { st.items.push({ desc: '', qty: 1, rate: '', gst: st.isGst ? 18 : 0 }); drawItems(); };
  $$('#bType button', m).forEach(b => b.onclick = () => {
    st.isGst = b.dataset.v === 'gst';
    $$('#bType button', m).forEach(x => x.classList.toggle('on', x === b));
    if (st.isGst) st.items.forEach(it => { if (!it.gst) it.gst = 18; });
    drawItems(); drawTot();
  });
  const setPay = v => {
    st.pay = v;
    $$('#bPay button', m).forEach(x => { x.className = x.dataset.v === v ? 'on ' + (v === 'unpaid' ? 'r' : 'g') : ''; });
    $('#bPaidWrap', m).hidden = v === 'unpaid';
    $('#bPaidAmtWrap', m).hidden = v === 'full';
    if (v === 'full') $('#bPaid', m).value = total().total || '';
    if (v === 'partial' && !edit) $('#bPaid', m).value = '';
  };
  const setMode = v => { st.mode = v; $$('#bMode button', m).forEach(x => x.classList.toggle('on', x.dataset.v === v)); $('#bCashWrap', m).hidden = v !== 'Cash'; };
  $$('#bPay button', m).forEach(b => b.onclick = () => setPay(b.dataset.v));
  $$('#bMode button', m).forEach(b => b.onclick = () => { setMode(b.dataset.v); if (!edit) $('#bCash', m).checked = b.dataset.v === 'Cash'; });
  setPay(st.pay); setMode(st.mode);
  if (st.pay === 'full') $('#bPaid', m).value = total().total || '';

  $('#bSave', m).onclick = () => {
    let pid = st.pid, newParty = null;
    if (!edit) {
      if (st.isNew) {
        const name = st.newName.trim(); if (!name) return toast('Enter the customer name');
        if (st.newPhone && st.newPhone.length !== 10) return toast('Mobile number should be 10 digits');
        newParty = { PartyID: uid('p'), Type: 'customer', Name: name, Phone: st.newPhone, Notes: '', OpeningBalance: 0 };
        pid = newParty.PartyID;
      }
      if (!pid) return toast('Select a customer or add a new one');
    }
    const items = st.items.map(it => ({ desc: String(it.desc || '').trim(), qty: num(it.qty), rate: num(it.rate), gst: st.isGst ? num(it.gst) : 0 })).filter(it => it.desc && it.qty > 0);
    if (!items.length) return toast('Add at least one item with details and quantity');
    const t = billTotals(items);
    if (!(t.total > 0)) return toast('Bill total must be more than zero');
    let paid = 0;
    if (st.pay === 'full') paid = t.total;
    else if (st.pay === 'partial') { paid = round2($('#bPaid', m).value); if (!(paid > 0) || paid >= t.total) return toast('Enter a part payment less than the total'); }
    const data = {
      BillID: edit ? edit.BillID : uid('b'), PartyID: pid, Date: $('#bDate', m).value || todayStr(), Items: items, IsGst: st.isGst, PartyGstin: $('#bGstin', m).value,
      Paid: paid, Mode: paid > 0 ? st.mode : '', cashbook: paid > 0 && st.mode === 'Cash' && $('#bCash', m).checked, Note: $('#bNote', m).value
    };
    const finish = () => {
      if (newParty) enqueue('party.add', newParty);
      enqueue(edit ? 'bill.edit' : 'bill.add', data);
      closeModal(m); toast(edit ? 'Bill updated' : 'Bill saved');
      go('bill', { id: data.BillID });
    };
    const dup = newParty && newParty.Phone ? byPhone(newParty.Phone) : null;
    if (dup) confirmBox('This mobile number already belongs to "' + dup.Name + '". Add "' + newParty.Name + '" as a separate customer anyway?', 'Add anyway', finish); else finish();
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
    <label>Paid by<select id="xMode"><option ${!isEdit || modeLabel(existing.Mode) !== 'UPI' ? 'selected' : ''}>Cash</option><option ${isEdit && modeLabel(existing.Mode) === 'UPI' ? 'selected' : ''}>UPI</option></select></label></div>
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
      ${link ? '<button class="btn p4" id="lkCopy">Copy</button><button class="btn p2" id="lkWa">WhatsApp</button>' : ''}
      ${can('manager') && link ? '<button class="btn p3" id="lkRegen">New link</button>' : ''}
    </div>`);
  if (link) {
    $('#lkCopy', m).onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { $('#lkVal', m).select(); document.execCommand('copy'); toast('Link copied'); } };
    $('#lkWa', m).onclick = () => openWa(waLink(p.Phone, linkMsg(p)));
    const rg = $('#lkRegen', m);
    if (rg) rg.onclick = () => confirmBox('The old link will stop working. Create a new one?', 'Create new link', async () => {
      try { await api('party.regen', { PartyID: pid }); await pull(); closeAllModals(); render(); linkModal(pid); toast('New link created'); } catch (e) { toast(e.message); }
    }, true);
  }
}
ACT.link = d => linkModal(d.id);

function fitText(g, text, maxW, size, weight) { let s = size; g.font = weight + ' ' + s + 'px Arial'; while (g.measureText(text).width > maxW && s > 20) { s -= 2; g.font = weight + ' ' + s + 'px Arial'; } }
function reminderImageBlob(p, bal) {
  return new Promise(res => {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1080, 640);
    g.fillStyle = '#1e4fae'; g.fillRect(0, 0, 1080, 130);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const title = bizLabel(); fitText(g, title, 980, 54, 'bold'); g.fillText(title, 50, 52);
    g.font = '28px Arial'; g.fillText('PAYMENT REMINDER', 50, 100);
    g.fillStyle = '#1c2430'; fitText(g, p.Name, 980, 46, 'bold'); g.fillText(p.Name, 50, 200);
    g.fillStyle = '#6b7686'; g.font = '30px Arial'; g.fillText('Amount due as on ' + fmtDate(todayStr()), 50, 262);
    g.fillStyle = bal > 0 ? '#b00020' : '#0d7a3e'; g.font = 'bold 120px Arial'; g.fillText(rs(bal), 50, 365);
    g.fillStyle = '#c9d4e8'; g.fillRect(50, 430, 980, 2);
    g.fillStyle = '#1c2430'; g.font = '30px Arial';
    let y = 480;
    if (setting('UpiId')) { g.fillText('Pay by UPI:  ' + setting('UpiId'), 50, y); y += 48; }
    if (setting('Phone')) { g.fillText('Call us:  ' + setting('Phone'), 50, y); y += 48; }
    g.fillStyle = '#6b7686'; g.font = '24px Arial'; g.fillText('Please ignore if already paid. Thank you.', 50, 600);
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
      <label>Message (you can edit)<textarea id="rqText" rows="9">${esc(reminderText(p))}</textarea></label>
      <div class="btns"><button class="btn p5" id="rqSkip">Skip</button><button class="btn p2" id="rqSend">Open WhatsApp &rarr;</button></div>
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
  const bc = b => `<span class="${b > 0.004 ? 'red' : 'grn'}">${NF.format(Math.abs(b))}${b > 0.004 ? ' Due' : b < -0.004 ? ' Cr' : ''}</span>`;
  let gv = 0, gt = 0;
  const body = s.rows.map((x, i) => {
    const a = num(x.e.Amount); if (x.e.Kind === 'GAVE') gv += a; else gt += a;
    return `<tr class="${i % 2 ? '' : 'z'}"><td>${fmtDate(x.e.Date)}</td><td>${esc((x.e.NoteText || '').slice(0, 300)).replace(/\n/g, '<br>')}${x.e.Mode ? ' <span class="sub">(' + esc(modeLabel(x.e.Mode)) + ')</span>' : ''}</td><td class="r red">${x.e.Kind === 'GAVE' ? NF.format(a) : ''}</td><td class="r grn">${x.e.Kind === 'GOT' ? NF.format(a) : ''}</td><td class="r">${bc(x.bal)}</td></tr>`;
  }).join('');
  const pv = perspective(s.closing);
  return '<html><head><meta charset="utf-8"><title>Statement</title>' + PRINT_CSS + '</head><body>' +
    docHead('<div style="font-size:20px;font-weight:bold">Account Statement</div><div>' + esc(s.label) + '</div><div>Generated: ' + fmtDate(todayStr()) + '</div>') +
    '<table class="bx"><tr><td style="padding:12px"><div class="sub">Statement for</div><div style="font-size:16px;font-weight:bold">' + esc(p.Name) + '</div>' + (p.Phone ? '<div><b>Phone: ' + esc(p.Phone) + '</b></div>' : '') + '</td>' +
    '<td class="r" style="padding:12px"><div>Closing balance</div><div style="font-size:24px;font-weight:bold" class="' + pv.cls + '">' + rs(s.closing) + '</div></td></tr></table><br>' +
    '<table class="items"><tr><th>Date</th><th>Details</th><th class="r red">To pay</th><th class="r grn">Paid</th><th class="r">Balance</th></tr>' +
    '<tr style="background:#f6f8fc"><td colspan="4"><i>Opening balance</i></td><td class="r">' + bc(s.opening) + '</td></tr>' + body +
    '<tr style="background:#dfe8f7"><td colspan="2"><b>Totals</b></td><td class="r red"><b>' + NF.format(gv) + '</b></td><td class="r grn"><b>' + NF.format(gt) + '</b></td><td></td></tr></table><br>' +
    '<div style="font-size:16px;font-weight:bold" class="' + pv.cls + '">' + esc(pv.t) + '</div>' + docFoot('THIS IS A COMPUTER GENERATED STATEMENT', false) + '</body></html>';
}
function statementModal(pid) {
  const p = S.idx.pmap.get(pid); if (!p) return;
  const now = new Date();
  const st = { mode: 'zero' };
  const m = openModal(`<div class="mh"><h3>Statement · ${esc(p.Name)}</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="chips" id="stChips">
      <button class="chip on" data-v="zero">Since last zero balance</button><button class="chip" data-v="month">This month</button>
      <button class="chip" data-v="lastmonth">Last month</button><button class="chip" data-v="range">Custom dates</button><button class="chip" data-v="all">All entries</button>
    </div>
    <div class="grid2" id="stDates" hidden><label>From<input type="date" id="stFrom"></label><label>To<input type="date" id="stTo"></label></div>
    <div class="card" id="stInfo"></div>
    <div class="btns"><button class="btn p4" id="stPrint">Print / Save PDF</button><button class="btn p2" id="stWa">PDF link on WhatsApp</button></div>
    <p class="muted small">"PDF link on WhatsApp" creates the PDF in your Drive folder and sends its link (needs internet and all entries synced).</p>`);
  $('#stFrom', m).value = dateStr(new Date(now.getFullYear(), now.getMonth(), 1)); $('#stTo', m).value = todayStr();
  const resolve = () => {
    const y = now.getFullYear(), mo = now.getMonth();
    if (st.mode === 'month') return { mode: 'range', from: dateStr(new Date(y, mo, 1)), to: dateStr(new Date(y, mo + 1, 0)) };
    if (st.mode === 'lastmonth') return { mode: 'range', from: dateStr(new Date(y, mo - 1, 1)), to: dateStr(new Date(y, mo, 0)) };
    if (st.mode === 'range') return { mode: 'range', from: $('#stFrom', m).value, to: $('#stTo', m).value };
    return { mode: st.mode, from: '', to: '' };
  };
  const info = () => {
    const r = resolve(); const s = computeStatement(p, r.mode, r.from, r.to); const pv = perspective(s.closing);
    $('#stInfo', m).innerHTML = `<div class="sub">${esc(s.label)}</div><div>${s.rows.length} entries</div><div class="b ${pv.cls}">${esc(pv.t)}</div>`;
  };
  $$('#stChips .chip', m).forEach(b => b.onclick = () => { st.mode = b.dataset.v; $$('#stChips .chip', m).forEach(x => x.classList.toggle('on', x === b)); $('#stDates', m).hidden = st.mode !== 'range'; info(); });
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
      openWa(waLink(p.Phone, statementMsg(p, s, res.url)));
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
  const m = openModal(`<div class="mh"><h3>${isEdit ? 'Edit' : 'Add'} user</h3><button class="x" data-act="closeModal">&times;</button></div>
    <label>Name<input id="uName" value="${esc(isEdit ? u.Name : '')}"></label>
    <label>Mobile number (login)<input id="uPhone" type="tel" inputmode="numeric" value="${esc(isEdit ? u.Phone : '')}"></label>
    <label>Role<select id="uRole"><option value="staff" ${isEdit && u.Role === 'staff' ? 'selected' : ''}>Staff (add only)</option><option value="manager" ${isEdit && u.Role === 'manager' ? 'selected' : ''}>Manager</option><option value="owner" ${isEdit && u.Role === 'owner' ? 'selected' : ''}>Owner</option></select></label>
    <label>${isEdit ? 'New PIN (leave blank to keep)' : 'PIN (4 to 8 digits)'}<input id="uPin" type="password" inputmode="numeric" maxlength="8"></label>
    ${isEdit ? `<label class="check"><input type="checkbox" id="uActive" ${u.Active === 'Y' ? 'checked' : ''}> Active (can log in)</label>` : ''}
    <button class="btn primary" id="uSave" style="margin-top:12px">Save</button>`);
  $('#uSave', m).onclick = async () => {
    const b = $('#uSave', m); b.disabled = true;
    try {
      await api('users.save', { user: { UserID: isEdit ? u.UserID : '', Name: $('#uName', m).value, Phone: $('#uPhone', m).value, Role: $('#uRole', m).value, Pin: $('#uPin', m).value, Active: isEdit ? $('#uActive', m).checked : true } });
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

/* ---------- Theme chooser ---------- */
function themeModal() {
  const cur = themePref();
  const opts = [['light', 'Light'], ['dark', 'Dark'], ['blue', 'Blue'], ['system', 'System default']];
  const m = openModal(`<div class="mh"><h3>Theme</h3><button class="x" data-act="closeModal">&times;</button></div>
    <div class="list">${opts.map(o => `<div class="row" data-theme-v="${o[0]}" style="cursor:pointer"><span class="mid">${o[1]}</span><span>${cur === o[0] ? '✓' : ''}</span></div>`).join('')}</div>
    <p class="muted small">This changes the look on this device only.</p>`);
  $$('[data-theme-v]', m).forEach(r => r.onclick = () => { setThemePref(r.dataset.themeV); closeModal(m); toast('Theme changed'); });
}
ACT.theme = () => themeModal();
