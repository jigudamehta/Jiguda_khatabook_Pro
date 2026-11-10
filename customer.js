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
  document.title = data.business.name + ' – my account';
  const st = { from: '', to: '', kind: 'all', q: '' };
  const draw = () => {
    const bal = data.balance;
    const rows = data.entries.filter(e => (!st.from || e.Date >= st.from) && (!st.to || e.Date <= st.to) && (st.kind === 'all' || e.Kind === st.kind) && (!st.q || (e.Text + ' ' + e.Amount).toLowerCase().includes(st.q)));
    const owes = data.party.type === 'supplier' ? bal < -0.004 : bal > 0.004;
    const settled = Math.abs(bal) < 0.005;
    const youOwe = data.party.type === 'supplier' ? bal < -0.004 : bal > 0.004;
    root.innerHTML = `<div class="chead"><div style="opacity:.85">${esc(data.business.name)}</div><h2 style="margin:4px 0 0">${esc(data.party.name)}</h2>
        ${data.business.phone ? '<div style="opacity:.85;font-size:13px">' + esc(data.business.phone) + '</div>' : ''}</div>
      <div class="cbal"><div class="sub">${settled ? 'Your account is settled' : (youOwe ? 'Amount to be paid to ' + esc(data.business.name) : esc(data.business.name) + ' will pay you')}</div>
        <b style="font-size:30px;color:${settled ? 'var(--green)' : youOwe ? 'var(--red)' : 'var(--green)'}">${rs(bal)}</b>
        ${youOwe && data.business.upi ? '<div class="sub" style="margin-top:6px">Pay by UPI: <b>' + esc(data.business.upi) + '</b></div>' : ''}</div>
      <div class="cbody">
        <div class="card"><div class="grid2"><label>From<input type="date" id="cvFrom" value="${esc(st.from)}"></label><label>To<input type="date" id="cvTo" value="${esc(st.to)}"></label></div>
          <div class="chips"><span class="chip ${st.kind === 'all' ? 'on' : ''}" data-k="all">All</span><span class="chip ${st.kind === 'GAVE' ? 'on' : ''}" data-k="GAVE">${data.party.type === 'supplier' ? 'Payments made' : 'Purchases / dues'}</span><span class="chip ${st.kind === 'GOT' ? 'on' : ''}" data-k="GOT">${data.party.type === 'supplier' ? 'Credits' : 'Payments received'}</span></div>
          <input id="cvQ" type="search" placeholder="Search entries…" value="${esc(st.q)}"></div>
        <div class="sub" style="margin:6px 4px">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</div>
        ${rows.map(e => `<div class="entry"><div class="eleft"><div class="et">${fmtDate(e.Date)}</div><span class="balbadge ${e.Balance < -0.004 ? 'g' : ''}">Balance ${rs(e.Balance)}</span><div class="note full" style="max-height:none">${esc(e.Text).replace(/\n/g, '<br>')}</div></div>
          <div class="ecol ${e.Kind === 'GAVE' ? 'gave' : 'got'}">${rs(e.Amount)}</div></div>`).join('') || '<div class="empty">No entries</div>'}
        <p class="muted small" style="text-align:center;margin-top:20px">View only. For any query please contact ${esc(data.business.name)}${data.business.phone ? ' on ' + esc(data.business.phone) : ''}.</p></div>`;
    $('#cvFrom').onchange = e => { st.from = e.target.value; draw(); };
    $('#cvTo').onchange = e => { st.to = e.target.value; draw(); };
    $$('.chip[data-k]', root).forEach(c => c.onclick = () => { st.kind = c.dataset.k; draw(); });
    const q = $('#cvQ'); q.oninput = () => { st.q = q.value.toLowerCase(); const p = q.selectionStart; clearTimeout(q._t); q._t = setTimeout(() => { draw(); const q2 = $('#cvQ'); q2.focus(); q2.setSelectionRange(p, p); }, 200); };
  };
  draw();
}
