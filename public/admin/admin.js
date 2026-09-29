/* ===== Utilidades ===== */
const I = (name, cls = '') => `<svg class="${cls}"><use href="../icons.svg#i-${name}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const duration = min => {
  const h = Math.floor(min / 60), m = min % 60;
  return !h ? `${m} min` : m ? `${h} h ${m} min` : `${h} h`;
};

const STATUS = { pendiente: 'Pendiente', confirmado: 'Confirmado', realizado: 'Realizado', cancelado: 'Cancelado' };
const ICONS = ['polish', 'nail', 'sparkles', 'heart', 'flower', 'brush', 'diamond', 'leaf'];
const WEEK = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Fechas siempre en hora de Argentina
const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const parseD = d => new Date(d + 'T12:00:00');
const addDays = (d, n) => { const x = parseD(d); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
const fmtShort = d => d.split('-').reverse().join('/');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtLong = d => cap(parseD(d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
function fmtHead(d) {
  const t = todayAR();
  const x = parseD(d);
  const base = `${String(x.getDate()).padStart(2, '0')} ${x.toLocaleDateString('es-AR', { month: 'long' })}`;
  if (d === t) return `Hoy · ${base}`;
  if (d === addDays(t, 1)) return `Mañana · ${base}`;
  return `${x.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')} ${base}`;
}

function toWaNumber(phone) {
  let d = String(phone).replace(/\D/g, '').replace(/^00/, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '549' + d;
  else if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) d = '549' + d.slice(2);
  return d;
}
const waLink = (phone, text = '') => `https://wa.me/${toWaNumber(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;

function fillTemplate(tpl, a) {
  return String(tpl || '')
    .replaceAll('{nombre}', a.client_name.split(' ')[0])
    .replaceAll('{servicio}', a.service_name)
    .replaceAll('{fecha}', fmtShort(a.date))
    .replaceAll('{hora}', a.time)
    .replaceAll('{dia}', parseD(a.date).toLocaleDateString('es-AR', { weekday: 'long' }));
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/admin' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    showLogin();
    throw new Error(data.error);
  }
  if (!res.ok) throw new Error(data.error || 'Algo salió mal');
  return data;
}

let toastTimer;
function toast(msg, error = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (error ? ' error' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}

/* ===== Estado ===== */
const $view = document.getElementById('view');
const state = { me: null, settings: null, services: null, appts: new Map(), calMonth: null, calSelected: null, filter: 'activos' };

async function getSettings(force) {
  if (!state.settings || force) state.settings = await api('/settings');
  return state.settings;
}
async function getServices(force) {
  if (!state.services || force) state.services = await api('/services');
  return state.services;
}
const remember = list => { list.forEach(a => state.appts.set(a.id, a)); return list; };

/* ===== Login ===== */
function showLogin() {
  document.getElementById('app').hidden = true;
  document.getElementById('sheet').hidden = true;
  document.getElementById('login').hidden = false;
}

document.getElementById('login-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById('login-error');
  err.hidden = true;
  try {
    await api('/login', { method: 'POST', body: { user: f.user.value, password: f.password.value } });
    f.password.value = '';
    start();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
};

document.getElementById('logout').onclick = async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  showLogin();
};

/* ===== Menú ===== */
const drawer = document.getElementById('drawer');
document.getElementById('menu-btn').onclick = () => drawer.classList.add('open');
document.querySelectorAll('[data-close-drawer]').forEach(el => (el.onclick = () => drawer.classList.remove('open')));

function setHeader(title, subtitle = '') {
  document.getElementById('title').innerHTML = title;
  document.getElementById('subtitle').textContent = subtitle;
  document.title = `${document.getElementById('title').textContent} · Merce Nails`;
}

async function updateBadge() {
  const pend = await api(`/appointments?from=${todayAR()}&status=pendiente`).catch(() => []);
  const b = document.getElementById('pending-badge');
  b.textContent = pend.length;
  b.hidden = !pend.length;
}

/* ===== Hoja modal ===== */
const $sheet = document.getElementById('sheet');
function openSheet(html) {
  document.getElementById('sheet-body').innerHTML = html;
  $sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  return document.getElementById('sheet-body');
}
function closeSheet() {
  $sheet.hidden = true;
  document.body.style.overflow = '';
}
$sheet.querySelector('.sheet-close').onclick = closeSheet;
$sheet.addEventListener('click', e => { if (e.target === $sheet) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$sheet.hidden) closeSheet(); });

/* ===== Tarjetas de turno ===== */
function apptCard(a) {
  return `
    <button class="appt is-${a.status}" data-appt="${a.id}">
      <span class="appt-time">${a.time}</span>
      <span>
        <span class="appt-name">${esc(a.client_name)}</span>
        <span class="appt-meta">${esc(a.service_name)} · WhatsApp</span>
      </span>
      <span class="pill ${a.status}">${STATUS[a.status]}</span>
    </button>`;
}

function groupedList(list, empty) {
  if (!list.length) return `<div class="empty">${empty}</div>`;
  let html = '', date = '';
  for (const a of list) {
    if (a.date !== date) {
      html += `${date ? '</div>' : ''}<p class="date-head">${fmtHead(a.date)}</p><div class="appts">`;
      date = a.date;
    }
    html += apptCard(a);
  }
  return html + '</div>';
}

$view.addEventListener('click', e => {
  const card = e.target.closest('[data-appt]');
  if (card) openAppt(state.appts.get(Number(card.dataset.appt)));
});

async function setStatus(a, status, silent) {
  const updated = await api(`/appointments/${a.id}`, { method: 'PATCH', body: { status } });
  state.appts.set(updated.id, updated);
  if (!silent) toast(`Turno ${STATUS[status].toLowerCase()}`);
  render();
  return updated;
}

async function openAppt(a) {
  const s = await getSettings();
  const confirmMsg = fillTemplate(s.wa_confirm_template, a);
  const reminderMsg = fillTemplate(s.wa_reminder_template, a);
  const body = openSheet(`
    <h2>${esc(a.client_name)}</h2>
    <p class="sub">Turno N° ${a.id} · ${a.source === 'admin' ? 'cargado por vos' : 'reservado desde la web'}</p>

    <div class="detail">
      <div class="detail-row">${I('sparkles')}<div><small>Servicio</small>${esc(a.service_name)} · ${money(a.price)} · ${duration(a.duration)}</div></div>
      <div class="detail-row">${I('calendar')}<div><small>Día y horario</small>${fmtLong(a.date)} · ${a.time} hs</div></div>
      <div class="detail-row">${I('whatsapp')}<div><small>WhatsApp</small><a href="tel:+${toWaNumber(a.client_phone)}">${esc(a.client_phone)}</a></div></div>
    </div>

    <p class="label">Estado</p>
    <div class="status-pick">
      ${Object.entries(STATUS).map(([k, v]) => `<button class="${k} ${a.status === k ? 'active' : ''}" data-status="${k}">${v}</button>`).join('')}
    </div>

    <div class="actions">
      ${a.status === 'pendiente'
        ? `<a class="btn btn-wa btn-block" id="confirm-wa" href="${waLink(a.client_phone, confirmMsg)}" target="_blank" rel="noopener">${I('whatsapp')} Confirmar y avisar por WhatsApp</a>`
        : `<a class="btn btn-wa btn-block" href="${waLink(a.client_phone)}" target="_blank" rel="noopener">${I('whatsapp')} Abrir chat</a>`}
      <div class="actions-2">
        <a class="btn btn-ghost btn-sm" href="${waLink(a.client_phone, confirmMsg)}" target="_blank" rel="noopener">Enviar confirmación</a>
        <a class="btn btn-ghost btn-sm" href="${waLink(a.client_phone, reminderMsg)}" target="_blank" rel="noopener">Recordatorio</a>
      </div>
    </div>

    <label class="field"><span>Notas</span><textarea id="notes" placeholder="Diseño elegido, alergias, seña…">${esc(a.notes)}</textarea></label>
    <button class="btn btn-ghost btn-sm" id="save-notes">Guardar nota</button>

    <details class="more">
      <summary>Reprogramar turno</summary>
      <label class="field"><span>Nueva fecha</span><input type="date" id="re-date" value="${a.date}" min="${todayAR()}"></label>
      <div class="slot-pick" id="re-slots"></div>
      <button class="btn btn-block" id="re-save" disabled>Guardar nuevo horario</button>
    </details>`);

  body.querySelectorAll('[data-status]').forEach(b => (b.onclick = async () => {
    try {
      a = await setStatus(a, b.dataset.status);
      openAppt(a);
    } catch (err) { toast(err.message, true); }
  }));

  const confirmWa = body.querySelector('#confirm-wa');
  if (confirmWa) confirmWa.addEventListener('click', () => {
    setStatus(a, 'confirmado', true).then(u => { toast('Turno confirmado'); openAppt(u); }).catch(err => toast(err.message, true));
  });

  body.querySelector('#save-notes').onclick = async () => {
    try {
      a = await api(`/appointments/${a.id}`, { method: 'PATCH', body: { notes: body.querySelector('#notes').value } });
      state.appts.set(a.id, a);
      toast('Nota guardada');
    } catch (err) { toast(err.message, true); }
  };

  // Reprogramar
  let newTime = null;
  const reDate = body.querySelector('#re-date');
  const reSlots = body.querySelector('#re-slots');
  const reSave = body.querySelector('#re-save');
  async function loadSlots() {
    newTime = null;
    reSave.disabled = true;
    reSlots.innerHTML = '<div class="spinner" style="grid-column:1/-1"></div>';
    const slots = await api(`/slots?service_id=${a.service_id}&date=${reDate.value}&exclude=${a.id}`).catch(() => []);
    reSlots.innerHTML = slots.length
      ? slots.map(t => `<button data-t="${t}">${t}</button>`).join('')
      : '<p class="help" style="grid-column:1/-1">No hay horarios libres ese día.</p>';
    reSlots.querySelectorAll('button').forEach(b => (b.onclick = () => {
      reSlots.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      newTime = b.dataset.t;
      reSave.disabled = false;
    }));
  }
  body.querySelector('details').addEventListener('toggle', e => { if (e.target.open) loadSlots(); }, { once: true });
  reDate.onchange = loadSlots;
  reSave.onclick = async () => {
    try {
      a = await api(`/appointments/${a.id}`, { method: 'PATCH', body: { date: reDate.value, time: newTime } });
      state.appts.set(a.id, a);
      toast('Turno reprogramado. Avisale a la clienta.');
      render();
      openAppt(a);
    } catch (err) { toast(err.message, true); }
  };
}

/* ===== Nuevo turno (carga manual) ===== */
async function newApptSheet(date = todayAR()) {
  const services = (await getServices()).filter(s => s.active);
  const body = openSheet(`
    <h2>Nuevo turno</h2>
    <p class="sub">Para turnos que te piden por Instagram, WhatsApp o en persona.</p>
    <form id="new-form">
      <label class="field"><span>Servicio</span>
        <select name="service_id">${services.map(s => `<option value="${s.id}">${esc(s.name)} · ${duration(s.duration)}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Fecha</span><input type="date" name="date" value="${date}" min="${todayAR()}" required></label>
      <p class="label">Horario</p>
      <div class="slot-pick" id="new-slots"></div>
      <label class="field"><span>Nombre de la clienta</span><input name="name" required maxlength="60"></label>
      <label class="field"><span>WhatsApp</span><input name="phone" type="tel" inputmode="tel" required maxlength="20" placeholder="379 4123456"></label>
      <label class="field"><span>Estado</span>
        <select name="status"><option value="confirmado">Confirmado</option><option value="pendiente">Pendiente</option></select>
      </label>
      <label class="field"><span>Notas (opcional)</span><textarea name="notes"></textarea></label>
      <p class="form-error" id="new-error" hidden></p>
      <button class="btn btn-block" type="submit">${I('check')} Guardar turno</button>
    </form>`);

  const f = body.querySelector('#new-form');
  const slotsEl = body.querySelector('#new-slots');
  let time = null;
  async function loadSlots() {
    time = null;
    slotsEl.innerHTML = '<div class="spinner" style="grid-column:1/-1"></div>';
    const slots = await api(`/slots?service_id=${f.service_id.value}&date=${f.date.value}`).catch(() => []);
    slotsEl.innerHTML = slots.length
      ? slots.map(t => `<button type="button" data-t="${t}">${t}</button>`).join('')
      : '<p class="help" style="grid-column:1/-1">No hay horarios libres ese día (revisá Horarios disponibles).</p>';
    slotsEl.querySelectorAll('button').forEach(b => (b.onclick = () => {
      slotsEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      time = b.dataset.t;
    }));
  }
  f.service_id.onchange = loadSlots;
  f.date.onchange = loadSlots;
  loadSlots();

  f.onsubmit = async e => {
    e.preventDefault();
    const err = body.querySelector('#new-error');
    err.hidden = true;
    if (!time) { err.textContent = 'Elegí un horario'; err.hidden = false; return; }
    try {
      await api('/appointments', {
        method: 'POST',
        body: { service_id: Number(f.service_id.value), date: f.date.value, time, name: f.name.value, phone: f.phone.value, status: f.status.value, notes: f.notes.value },
      });
      closeSheet();
      toast('Turno guardado');
      render();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
}
document.getElementById('fab').onclick = () => newApptSheet(location.hash === '#/calendario' && state.calSelected >= todayAR() ? state.calSelected : todayAR());

/* ===== Páginas ===== */
const pages = {
  async '/'() {
    const t = todayAR();
    const list = remember(await api(`/appointments?from=${t}&to=${addDays(t, 60)}`));
    const today = list.filter(a => a.date === t);
    const active = today.filter(a => a.status !== 'cancelado');
    const pendingAll = list.filter(a => a.status === 'pendiente');
    const next = list.filter(a => a.date > t && ['pendiente', 'confirmado'].includes(a.status)).slice(0, 5);

    setHeader(`Hola, ${esc(state.me.name)} ${I('heart', 'heart-sm')}`, `Panel de turnos · Hoy, ${fmtLong(t)}`);
    $view.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${active.length}</b><span>Turnos hoy</span></div>
        <div class="stat"><b>${today.filter(a => a.status === 'pendiente').length}</b><span>Pendientes</span></div>
        <div class="stat"><b>${today.filter(a => a.status === 'confirmado').length}</b><span>Confirmados</span></div>
      </div>
      ${pendingAll.length ? `<a class="alert" href="#/pendientes">${I('hourglass')}<span>Tenés <b>${pendingAll.length}</b> turno${pendingAll.length > 1 ? 's' : ''} por confirmar</span>${I('arrow', 'arrow')}</a>` : ''}
      <div class="section-title"><h2>Agenda de hoy</h2><a href="#/calendario">Ver calendario</a></div>
      <div class="appts">${today.length ? today.map(apptCard).join('') : '<div class="empty">No tenés turnos para hoy. ☕</div>'}</div>
      <div class="section-title"><h2>Próximos turnos</h2><a href="#/proximos">Ver todos</a></div>
      ${groupedList(next, 'No hay turnos próximos todavía.')}`;
  },

  async '/hoy'() {
    const t = todayAR();
    const list = remember(await api(`/appointments?from=${t}&to=${t}`));
    setHeader('Turnos de hoy', fmtLong(t));
    $view.innerHTML = `<div class="appts">${list.length ? list.map(apptCard).join('') : '<div class="empty">No tenés turnos para hoy.</div>'}</div>`;
  },

  async '/proximos'() {
    const t = todayAR();
    const filters = {
      activos: ['Activos', `from=${t}&status=pendiente,confirmado`],
      pendiente: ['Pendientes', `from=${t}&status=pendiente`],
      confirmado: ['Confirmados', `from=${t}&status=confirmado`],
      cancelado: ['Cancelados', `from=${t}&status=cancelado`],
      historial: ['Historial', `from=${addDays(t, -90)}&to=${addDays(t, -1)}`],
    };
    const [label, query] = filters[state.filter] || filters.activos;
    let list = remember(await api(`/appointments?${query}`));
    if (state.filter === 'historial') list = list.reverse();
    setHeader('Próximos turnos', `${list.length} turno${list.length === 1 ? '' : 's'} · ${label.toLowerCase()}`);
    $view.innerHTML = `
      <div class="chips">${Object.entries(filters).map(([k, [l]]) => `<button class="chip ${state.filter === k ? 'active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
      ${groupedList(list, 'No hay turnos para mostrar.')}`;
    $view.querySelectorAll('[data-filter]').forEach(b => (b.onclick = () => { state.filter = b.dataset.filter; render(); }));
  },

  async '/pendientes'() {
    const list = remember(await api(`/appointments?from=${todayAR()}&status=pendiente`));
    setHeader('Turnos pendientes', list.length ? 'Tocá un turno para confirmarlo por WhatsApp' : '');
    $view.innerHTML = groupedList(list, '¡Todo al día! No hay turnos por confirmar. 💖');
  },

  async '/calendario'() {
    const t = todayAR();
    state.calMonth ??= t.slice(0, 7);
    state.calSelected ??= t;
    const [y, m] = state.calMonth.split('-').map(Number);
    const first = `${state.calMonth}-01`;
    const daysInMonth = new Date(y, m, 0).getDate();
    const last = `${state.calMonth}-${String(daysInMonth).padStart(2, '0')}`;

    const [list, schedule] = await Promise.all([api(`/appointments?from=${first}&to=${last}`), api('/schedule')]);
    remember(list);
    const blocked = new Set(schedule.blocked.map(b => b.date));
    const byDay = {};
    list.forEach(a => (byDay[a.date] ||= []).push(a));

    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // semana empieza el lunes
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span class="cal-day other"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${state.calMonth}-${String(d).padStart(2, '0')}`;
      const active = (byDay[date] || []).filter(a => a.status !== 'cancelado');
      const cls = [date === t && 'today', date === state.calSelected && 'selected', blocked.has(date) && 'blocked'].filter(Boolean).join(' ');
      cells += `<button class="cal-day ${cls}" data-date="${date}">${d}
        <span class="cal-dots">${active.slice(0, 4).map(a => `<i class="${a.status}"></i>`).join('')}</span></button>`;
    }

    const sel = state.calSelected;
    const dayList = (byDay[sel] || []);
    const isBlocked = blocked.has(sel);
    const monthLabel = cap(new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(' de ', ' '));

    setHeader('Calendario', `${list.filter(a => a.status !== 'cancelado').length} turnos en ${monthLabel.split(' ')[0].toLowerCase()}`);
    $view.innerHTML = `
      <div class="cal">
        <div class="cal-head">
          <button class="icon-btn" data-month="-1" aria-label="Mes anterior">${I('chev-left')}</button>
          <h2>${monthLabel}</h2>
          <button class="icon-btn" data-month="1" aria-label="Mes siguiente">${I('chev-right')}</button>
        </div>
        <div class="cal-grid">
          ${['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(d => `<span class="cal-dow">${d}</span>`).join('')}
          ${cells}
        </div>
      </div>
      <div class="section-title">
        <h2>${fmtLong(sel)}</h2>
        ${sel >= t ? `<button class="link" id="toggle-block">${isBlocked ? 'Habilitar día' : 'Bloquear día'}</button>` : ''}
      </div>
      ${isBlocked ? `<div class="alert">${I('x')}<span>Día bloqueado: no se pueden reservar turnos.</span></div>` : ''}
      <div class="appts">${dayList.length ? dayList.map(apptCard).join('') : '<div class="empty">Sin turnos este día.</div>'}</div>
      ${sel >= t && !isBlocked ? `<button class="btn btn-ghost btn-block" id="add-here" style="margin-top:1rem">${I('plus')} Agregar turno este día</button>` : ''}`;

    $view.querySelectorAll('[data-month]').forEach(b => (b.onclick = () => {
      const d = new Date(y, m - 1 + Number(b.dataset.month), 1);
      state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      state.calSelected = state.calMonth === t.slice(0, 7) ? t : `${state.calMonth}-01`;
      render();
    }));
    $view.querySelectorAll('.cal-day[data-date]').forEach(b => (b.onclick = () => { state.calSelected = b.dataset.date; render(); }));
    $view.querySelector('#add-here')?.addEventListener('click', () => newApptSheet(sel));
    $view.querySelector('#toggle-block')?.addEventListener('click', async () => {
      try {
        if (isBlocked) await api(`/blocked/${sel}`, { method: 'DELETE' });
        else await api('/blocked', { method: 'POST', body: { date: sel, reason: '' } });
        toast(isBlocked ? 'Día habilitado' : 'Día bloqueado');
        render();
      } catch (err) { toast(err.message, true); }
    });
  },

  async '/servicios'() {
    const services = await getServices(true);
    setHeader('Servicios', 'Precios y duración que ven las clientas');
    $view.innerHTML = `
      ${services.map(s => `
        <button class="list-card ${s.active ? '' : 'inactive'}" data-svc="${s.id}">
          <span class="svc-ico">${I(s.icon)}</span>
          <span class="grow"><strong>${esc(s.name)}</strong><small>${duration(s.duration)}${s.active ? '' : ' · oculto'}</small></span>
          <b>${money(s.price)}</b>
        </button>`).join('')}
      <button class="btn btn-ghost btn-block" id="new-svc" style="margin-top:1rem">${I('plus')} Nuevo servicio</button>`;
    $view.querySelectorAll('[data-svc]').forEach(b => (b.onclick = () => serviceSheet(services.find(s => s.id === Number(b.dataset.svc)))));
    $view.querySelector('#new-svc').onclick = () => serviceSheet();
  },

  async '/horarios'() {
    const sched = await api('/schedule');
    const days = Array.from({ length: 7 }, (_, d) => sched.slots.filter(s => s.weekday === d).map(s => s.time));
    setHeader('Horarios disponibles', 'Los horarios de turno que ven las clientas');

    const draw = () => {
      $view.innerHTML = `
        ${[1, 2, 3, 4, 5, 6, 0].map(d => `
          <div class="day-row">
            <div class="day-row-head">
              <strong>${WEEK[d]}</strong>
              <label class="switch"><input type="checkbox" data-day="${d}" ${days[d].length ? 'checked' : ''}><span></span></label>
            </div>
            ${days[d].length ? `
              <div class="time-chips">
                ${days[d].map((t, i) => `<span class="time-chip">${t}<button data-remove="${d}:${i}" aria-label="Quitar ${t}">${I('x')}</button></span>`).join('')}
              </div>
              <div class="range">
                <input type="time" data-new="${d}" step="900">
                <button class="btn btn-ghost btn-sm" data-add="${d}">${I('plus')} Agregar</button>
              </div>` : '<p class="help" style="margin-top:.4rem">Sin turnos este día.</p>'}
          </div>`).join('')}
        <button class="btn btn-block sticky-save" id="save-sched">${I('check')} Guardar horarios</button>

        <div class="section-title"><h2>Días sin atención</h2></div>
        <div class="card">
          <div class="row2">
            <label class="field"><span>Fecha</span><input type="date" id="block-date" min="${todayAR()}"></label>
            <label class="field"><span>Motivo (opcional)</span><input id="block-reason" placeholder="Feriado, vacaciones…" maxlength="80"></label>
          </div>
          <button class="btn btn-ghost btn-block" id="add-block">${I('plus')} Bloquear día</button>
        </div>
        ${sched.blocked.map(b => `
          <div class="list-card">
            <span class="svc-ico">${I('calendar')}</span>
            <span class="grow"><strong>${fmtLong(b.date)}</strong><small>${esc(b.reason) || 'Sin atención'}</small></span>
            <button class="icon-btn" data-unblock="${b.date}" aria-label="Quitar">${I('trash')}</button>
          </div>`).join('')}`;

      $view.querySelectorAll('[data-day]').forEach(el => (el.onchange = () => {
        days[el.dataset.day] = el.checked ? ['14:00', '17:00', '20:00'] : [];
        draw();
      }));
      $view.querySelectorAll('[data-remove]').forEach(el => (el.onclick = () => {
        const [d, i] = el.dataset.remove.split(':').map(Number);
        days[d].splice(i, 1);
        draw();
      }));
      $view.querySelectorAll('[data-add]').forEach(el => (el.onclick = () => {
        const d = el.dataset.add;
        const t = $view.querySelector(`[data-new="${d}"]`).value;
        if (!t) return toast('Elegí un horario', true);
        if (!days[d].includes(t)) days[d] = [...days[d], t].sort();
        draw();
      }));
      $view.querySelector('#save-sched').onclick = async () => {
        const slots = days.flatMap((list, weekday) => list.map(time => ({ weekday, time })));
        try {
          await api('/schedule', { method: 'PUT', body: { slots } });
          toast('Horarios guardados');
        } catch (err) { toast(err.message, true); }
      };
      $view.querySelector('#add-block').onclick = async () => {
        const date = $view.querySelector('#block-date').value;
        if (!date) return toast('Elegí una fecha', true);
        try {
          await api('/blocked', { method: 'POST', body: { date, reason: $view.querySelector('#block-reason').value } });
          toast('Día bloqueado');
          render();
        } catch (err) { toast(err.message, true); }
      };
      $view.querySelectorAll('[data-unblock]').forEach(el => (el.onclick = async () => {
        await api(`/blocked/${el.dataset.unblock}`, { method: 'DELETE' });
        toast('Día habilitado');
        render();
      }));
    };
    draw();
  },

  async '/config'() {
    const s = await getSettings(true);
    setHeader('Configuración', 'Datos del negocio y acceso al panel');
    $view.innerHTML = `
      <form class="card" id="settings-form">
        <h3>Negocio</h3>
        <label class="field"><span>Nombre del negocio</span><input name="business_name" value="${esc(s.business_name)}" maxlength="60"></label>
        <label class="field"><span>Dirección</span><input name="address" value="${esc(s.address)}" maxlength="120"></label>
        <label class="field"><span>Link de Google Maps</span><input name="maps_url" value="${esc(s.maps_url)}" type="url" maxlength="300"></label>
        <label class="field"><span>Instagram</span><input name="instagram" value="${esc(s.instagram)}" placeholder="@mercenails" maxlength="60"></label>
        <h3 style="margin-top:1.4rem">Reservas</h3>
        <div class="row2">
          <label class="field"><span>Anticipación mínima (horas)</span><input name="min_notice_hours" type="number" min="0" max="72" value="${esc(s.min_notice_hours)}"></label>
          <label class="field"><span>Reservar hasta (días)</span><input name="max_days_ahead" type="number" min="1" max="180" value="${esc(s.max_days_ahead)}"></label>
        </div>
        <h3 style="margin-top:1.4rem">Panel</h3>
        <div class="row2">
          <label class="field"><span>Tu nombre</span><input name="admin_name" value="${esc(s.admin_name)}" maxlength="40"></label>
          <label class="field"><span>Usuario</span><input name="admin_user" value="${esc(s.admin_user)}" maxlength="40" autocomplete="username"></label>
        </div>
        <button class="btn btn-block" type="submit">${I('check')} Guardar cambios</button>
      </form>

      <form class="card" id="password-form">
        <h3>Cambiar contraseña</h3>
        <label class="field"><span>Contraseña actual</span><input name="current" type="password" autocomplete="current-password" required></label>
        <label class="field"><span>Nueva contraseña</span><input name="next" type="password" minlength="8" autocomplete="new-password" required><small>Mínimo 8 caracteres.</small></label>
        <button class="btn btn-ghost btn-block" type="submit">Actualizar contraseña</button>
      </form>`;

    $view.querySelector('#settings-form').onsubmit = async e => {
      e.preventDefault();
      try {
        await api('/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) });
        await getSettings(true);
        state.me.name = state.settings.admin_name;
        toast('Cambios guardados');
      } catch (err) { toast(err.message, true); }
    };
    $view.querySelector('#password-form').onsubmit = async e => {
      e.preventDefault();
      try {
        await api('/password', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) });
        e.target.reset();
        toast('Contraseña actualizada');
      } catch (err) { toast(err.message, true); }
    };
  },

  async '/whatsapp'() {
    const s = await getSettings(true);
    const sample = { client_name: 'Camila Rodríguez', service_name: 'Capping', date: addDays(todayAR(), 3), time: '17:00' };
    setHeader('WhatsApp', 'Número y mensajes');
    $view.innerHTML = `
      <form id="wa-form">
        <div class="card">
          <h3>Tu número</h3>
          <label class="field"><span>WhatsApp donde recibís los turnos</span>
            <input name="whatsapp" value="${esc(s.whatsapp)}" inputmode="tel" maxlength="20">
            <small>Formato internacional sin + ni espacios. Ej: 5493794123456 (54 + 9 + característica + número).</small>
          </label>
          <p class="label">Así te llega cada reserva nueva:</p>
          <div class="preview">💅 Nuevo turno — ${esc(s.business_name)}
Cliente: ${sample.client_name}
Servicio: ${sample.service_name}
Fecha: ${fmtShort(sample.date)}
Hora: ${sample.time}
WhatsApp: 3794123456
Turno N° 12</div>
        </div>

        <div class="card">
          <h3>Mensajes para las clientas</h3>
          <p class="help" style="margin-bottom:1rem">Podés usar <code>{nombre}</code> <code>{servicio}</code> <code>{dia}</code> <code>{fecha}</code> <code>{hora}</code> y se reemplazan solos.</p>
          <label class="field"><span>Confirmación de turno</span><textarea name="wa_confirm_template" maxlength="500">${esc(s.wa_confirm_template)}</textarea></label>
          <div class="preview" id="pv-confirm"></div>
          <label class="field" style="margin-top:1.2rem"><span>Recordatorio</span><textarea name="wa_reminder_template" maxlength="500">${esc(s.wa_reminder_template)}</textarea></label>
          <div class="preview" id="pv-reminder"></div>
        </div>
        <button class="btn btn-block" type="submit">${I('check')} Guardar</button>
      </form>`;

    const f = $view.querySelector('#wa-form');
    const preview = () => {
      $view.querySelector('#pv-confirm').textContent = fillTemplate(f.wa_confirm_template.value, sample);
      $view.querySelector('#pv-reminder').textContent = fillTemplate(f.wa_reminder_template.value, sample);
    };
    f.addEventListener('input', preview);
    preview();
    f.onsubmit = async e => {
      e.preventDefault();
      try {
        await api('/settings', { method: 'PUT', body: Object.fromEntries(new FormData(f)) });
        await getSettings(true);
        toast('Guardado');
      } catch (err) { toast(err.message, true); }
    };
  },
};

/* ===== Servicio (alta / edición) ===== */
function serviceSheet(s = { name: '', description: '', price: '', duration: 60, icon: 'heart', active: 1, sort: (state.services?.length || 0) }) {
  const body = openSheet(`
    <h2>${s.id ? 'Editar servicio' : 'Nuevo servicio'}</h2>
    <p class="sub">${s.id ? 'Los turnos ya reservados mantienen el precio con el que se sacaron.' : 'Aparece en la web apenas lo guardás.'}</p>
    <form id="svc-form">
      <label class="field"><span>Nombre</span><input name="name" value="${esc(s.name)}" required maxlength="60"></label>
      <label class="field"><span>Descripción</span><input name="description" value="${esc(s.description)}" maxlength="200"></label>
      <div class="row2">
        <label class="field"><span>Precio ($)</span><input name="price" type="number" min="0" step="100" value="${s.price}" required></label>
        <label class="field"><span>Duración (min)</span><input name="duration" type="number" min="5" max="600" step="5" value="${s.duration}" required></label>
      </div>
      <p class="label">Ícono</p>
      <div class="icon-pick" style="margin-bottom:1rem">
        ${ICONS.map(ic => `<label><input type="radio" name="icon" value="${ic}" ${s.icon === ic ? 'checked' : ''}><span>${I(ic)}</span></label>`).join('')}
      </div>
      <label class="field"><span>Orden en la lista</span><input name="sort" type="number" value="${s.sort}"></label>
      <label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Visible en la web</label>
      <button class="btn btn-block" type="submit">${I('check')} Guardar</button>
      ${s.id ? `<button class="btn btn-danger btn-block" type="button" id="del-svc" style="margin-top:.6rem">${I('trash')} Eliminar servicio</button>` : ''}
    </form>`);

  const f = body.querySelector('#svc-form');
  f.onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    data.active = f.active.checked;
    try {
      await api(s.id ? `/services/${s.id}` : '/services', { method: s.id ? 'PUT' : 'POST', body: data });
      closeSheet();
      toast('Servicio guardado');
      render();
    } catch (err) { toast(err.message, true); }
  };
  body.querySelector('#del-svc')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    if (btn.dataset.sure !== '1') {
      btn.dataset.sure = '1';
      btn.textContent = 'Tocá de nuevo para eliminar (o destildá “Visible” para ocultarlo)';
      return;
    }
    try {
      await api(`/services/${s.id}`, { method: 'DELETE' });
      closeSheet();
      toast('Servicio eliminado');
      render();
    } catch (err) { toast(err.message, true); }
  });
}

/* ===== Router ===== */
async function render() {
  const path = location.hash.slice(1) || '/';
  const page = pages[path] || pages['/'];
  document.querySelectorAll('#menu a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + path));
  drawer.classList.remove('open');
  document.getElementById('fab').hidden = !['/', '/hoy', '/proximos', '/pendientes', '/calendario'].includes(path);
  if (!$view.children.length) $view.innerHTML = '<div class="spinner"></div>';
  try {
    await page();
  } catch (err) {
    if (err.message) $view.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
  updateBadge();
}

window.addEventListener('hashchange', () => {
  $view.innerHTML = '';
  closeSheet();
  window.scrollTo(0, 0);
  render();
});

async function start() {
  try {
    state.me = await api('/me');
  } catch {
    return;
  }
  document.getElementById('login').hidden = true;
  document.getElementById('app').hidden = false;
  $view.innerHTML = '';
  render();
}

start();
