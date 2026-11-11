'use strict';
/* =====================================================================
   customer.js - read-only customer page opened from a personal link
   ===================================================================== */
async function openCustomerView(code) {
  $('#boot').hidden = true; $('#login').hidden = true; $('#app').hidden = true;
  const root = $('#customer'); root.hidden = false;
  root.innerHTML = '<div class="empty">Loading your account…</div>';
  document.title = 'My account';
  let data;
  try {
    const res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'customerView', code: code }) });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Could not load');
    data = j.data;
  } catch (e) {
    root.innerHTML = '<div class="empty"><h3>Unable to open</h3><p>' + esc(e.message) + '</p></div>';
    return;
  }
  const biz = data.business, label = biz.contact ? biz.name + ' - ' + biz.contact : biz.name;
  document.title = biz.name + ' – my account';
  const sup = data.party.type === 'supplier';
  const cols = sup ? ['Paid to you', 'Billed to you'] : ['To pay', 'Paid'];
  const st = { from: '', to: '', kind: 'all', q: '' };
  const draw = () => {
    const bal = data.balance;
    const rows = data.entries.filter(e => (!st.from || e.Date >= st.from) && (!st.to || e.Date <= st.to) && (st.kind === 'all' || e.Kind === st.kind) && (!st.q || (e.Text + ' ' + e.Amount).toLowerCase().includes(st.q)));
    const settled = Math.abs(bal) < 0.005;
    const youOwe = sup ? bal < -0.004 : bal > 0.004;
    const line = settled ? 'Your account is settled' : youOwe ? 'You have to pay ' + label : label + ' has to pay you';
    root.innerHTML = `<div class="chead"><div style="opacity:.85">${esc(biz.name)}</div><h2 style="margin:4px 0 0">${esc(data.party.name)}</h2>
        ${biz.contact ? '<div style="opacity:.85;font-size:13px">' + esc(biz.contact) + (biz.phone ? ' · ' + esc(biz.phone) : '') + '</div>' : (biz.phone ? '<div style="opacity:.85;font-size:13px">' + esc(biz.phone) + '</div>' : '')}</div>
      <div class="cbal"><div class="sub">${esc(line)}</div>
        <b style="font-size:30px;color:${settled ? 'var(--green)' : youOwe ? 'var(--red)' : 'var(--green)'}">${rs(Math.abs(bal))}</b>
        ${youOwe && biz.upi ? '<div class="sub" style="margin-top:6px">Pay by UPI: <b>' + esc(biz.upi) + '</b></div>' : ''}</div>
      <div class="cbody">
        <div class="card"><div class="grid2"><label>From<input type="date" id="cvFrom" value="${esc(st.from)}"></label><label>To<input type="date" id="cvTo" value="${esc(st.to)}"></label></div>
          <div class="chips"><span class="chip ${st.kind === 'all' ? 'on' : ''}" data-k="all">All</span><span class="chip ${st.kind === 'GAVE' ? 'on' : ''}" data-k="GAVE">${cols[0]}</span><span class="chip ${st.kind === 'GOT' ? 'on' : ''}" data-k="GOT">${cols[1]}</span></div>
          <input id="cvQ" type="search" placeholder="Search entries…" value="${esc(st.q)}"></div>
        <div class="sub" style="margin:6px 4px">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</div>
        <div class="elhead"><span>ENTRIES</span><span class="g">${cols[0].toUpperCase()}</span><span class="t">${cols[1].toUpperCase()}</span></div>
        ${rows.map((e, i) => `<div class="entry ${i % 2 ? 'alt' : ''}" style="cursor:default"><div class="eleft"><div class="et">${fmtDate(e.Date)}${e.Mode ? ' · ' + esc(modeLabel(e.Mode)) : ''}</div><span class="balbadge ${e.Balance < -0.004 ? 'g' : ''}">Balance ${rs(Math.abs(e.Balance))}</span><div class="note full" style="max-height:none">${esc(e.Text).replace(/\n/g, '<br>')}</div></div>
          <div class="ec gave">${e.Kind === 'GAVE' ? rs(e.Amount) : ''}</div><div class="ec got">${e.Kind === 'GOT' ? rs(e.Amount) : ''}</div></div>`).join('') || '<div class="empty">No entries</div>'}
        <p class="muted small" style="text-align:center;margin-top:20px">View only. For any query please contact ${esc(label)}${biz.phone ? ' on ' + esc(biz.phone) : ''}.</p></div>`;
    $('#cvFrom').onchange = e => { st.from = e.target.value; draw(); };
    $('#cvTo').onchange = e => { st.to = e.target.value; draw(); };
    $$('.chip[data-k]', root).forEach(c => c.onclick = () => { st.kind = c.dataset.k; draw(); });
    const q = $('#cvQ'); q.oninput = () => { st.q = q.value.toLowerCase(); const p = q.selectionStart; clearTimeout(q._t); q._t = setTimeout(() => { draw(); const q2 = $('#cvQ'); q2.focus(); q2.setSelectionRange(p, p); }, 200); };
  };
  draw();
}
