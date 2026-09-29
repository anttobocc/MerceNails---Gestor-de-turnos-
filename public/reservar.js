// Reserva en 5 pasos: servicio → fecha → horario → datos → confirmación
const STEPS = ['servicio', 'fecha', 'horario', 'datos', 'confirmar'];
const state = { step: 0, services: [], service: null, date: null, time: null, name: '', phone: '' };

const $step = document.getElementById('step');
const $error = document.getElementById('error');
const $progress = document.querySelectorAll('#progress span');
const $label = document.getElementById('step-label');

const DAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const parseDate = d => new Date(d + 'T12:00:00');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = d => cap(parseDate(d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
const monthName = d => parseDate(d).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');

function showError(msg) {
  $error.textContent = msg;
  $error.hidden = !msg;
}

function go(step) {
  state.step = step;
  showError('');
  $progress.forEach((el, i) => el.classList.toggle('done', i <= step));
  $label.textContent = `Paso ${step + 1} de ${STEPS.length}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render[STEPS[step]]();
}

document.getElementById('back').onclick = () => {
  if (state.step > 0 && state.step < STEPS.length) go(state.step - 1);
  else location.href = './';
};

const loading = () => ($step.innerHTML = '<div class="spinner"></div>');

const render = {
  servicio() {
    $step.innerHTML = `
      <h2>¿Qué te querés hacer?</h2>
      <p class="hint">Elegí el servicio. Ves el precio y cuánto dura.</p>
      <div class="pick-list">
        ${state.services.map(s => `
          <button class="pick ${state.service?.id === s.id ? 'selected' : ''}" data-id="${s.id}">
            <span class="service-ico">${icon(s.icon)}</span>
            <span class="pick-body">
              <strong>${escapeHtml(s.name)}</strong>
              <small>${icon('clock')} ${duration(s.duration)}</small>
            </span>
            <span class="pick-price">${money(s.price)}</span>
          </button>`).join('')}
      </div>`;
    $step.querySelectorAll('.pick').forEach(btn => btn.onclick = () => {
      const service = state.services.find(s => s.id === Number(btn.dataset.id));
      if (state.service?.id !== service.id) { state.date = null; state.time = null; }
      state.service = service;
      go(1);
    });
  },

  async fecha() {
    loading();
    let days;
    try {
      days = await api(`/days?service_id=${state.service.id}`);
    } catch (err) {
      return showError(err.message);
    }
    if (!days.some(d => d.available)) {
      $step.innerHTML = `<h2>Elegí el día</h2>
        <div class="empty">No hay turnos disponibles para ${escapeHtml(state.service.name)} en los próximos días.<br><br>
        <a class="btn btn-wa wa-link" href="#" target="_blank" rel="noopener">${icon('whatsapp', 'ico')} Consultar por WhatsApp</a></div>`;
      return configReady.then(cfg => cfg && ($step.querySelector('.wa-link').href = waUrl(cfg.whatsapp, `Hola Merce! Quería un turno de ${state.service.name} 💅`)));
    }

    // Agrupado por mes, empezando en el primer día con lugar
    const first = days.findIndex(d => d.available);
    let html = `<h2>Elegí el día</h2><p class="hint">${escapeHtml(state.service.name)} · ${duration(state.service.duration)}</p>`;
    let month = '';
    days.slice(first).forEach(d => {
      const m = monthName(d.date);
      if (m !== month) {
        html += `${month ? '</div>' : ''}<p class="month-label">${m}</p><div class="days">`;
        month = m;
      }
      const date = parseDate(d.date);
      html += `<button class="day ${state.date === d.date ? 'selected' : ''}" data-date="${d.date}" ${d.available ? '' : 'disabled'}>
        <small>${DAY_NAMES[date.getDay()]}</small><b>${date.getDate()}</b></button>`;
    });
    $step.innerHTML = html + '</div>';
    $step.querySelectorAll('.day:not(:disabled)').forEach(btn => btn.onclick = () => {
      if (state.date !== btn.dataset.date) state.time = null;
      state.date = btn.dataset.date;
      go(2);
    });
  },

  async horario() {
    loading();
    let slots;
    try {
      slots = await api(`/slots?service_id=${state.service.id}&date=${state.date}`);
    } catch (err) {
      return showError(err.message);
    }
    const title = `<h2>Elegí el horario</h2><p class="hint">${longDate(state.date)}</p>`;
    if (!slots.length) {
      $step.innerHTML = title + '<div class="empty">Se ocuparon todos los horarios de este día. Elegí otro día.</div>';
      return;
    }
    const groups = [
      ['Mañana', slots.filter(t => t < '13:00')],
      ['Tarde', slots.filter(t => t >= '13:00' && t < '19:00')],
      ['Noche', slots.filter(t => t >= '19:00')],
    ].filter(([, list]) => list.length);
    $step.innerHTML = title + groups.map(([label, list]) => `
      <div class="slot-group">
        <h3>${label}</h3>
        <div class="slots">${list.map(t => `<button class="slot ${state.time === t ? 'selected' : ''}" data-time="${t}">${t}</button>`).join('')}</div>
      </div>`).join('');
    $step.querySelectorAll('.slot').forEach(btn => btn.onclick = () => {
      state.time = btn.dataset.time;
      go(3);
    });
  },

  datos() {
    $step.innerHTML = `
      <h2>Tus datos</h2>
      <p class="hint">Te vamos a escribir a este WhatsApp para confirmar el turno.</p>
      <form id="data-form" novalidate>
        <label class="field">
          <span>Nombre y apellido</span>
          <input name="name" autocomplete="name" required maxlength="60" value="${escapeHtml(state.name)}" placeholder="Ej: Camila Rodríguez">
        </label>
        <label class="field">
          <span>WhatsApp</span>
          <input name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20" value="${escapeHtml(state.phone)}" placeholder="Ej: 379 4123456">
          <small>Con característica, sin 0 ni 15.</small>
        </label>
        <button class="btn btn-lg btn-block" type="submit">Continuar ${icon('arrow', 'ico')}</button>
      </form>`;
    const form = document.getElementById('data-form');
    if (!state.name) form.name.focus();
    form.onsubmit = e => {
      e.preventDefault();
      const name = form.name.value.trim();
      const phone = form.phone.value.trim();
      if (name.length < 2) return showError('Ingresá tu nombre.');
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) return showError('Revisá el número de WhatsApp.');
      Object.assign(state, { name, phone });
      go(4);
    };
  },

  confirmar() {
    const s = state.service;
    const row = (ico, label, value, step) => `
      <div class="summary-row">${icon(ico)}<div><small>${label}</small><b>${value}</b></div>
      ${step !== undefined ? `<button data-step="${step}">Cambiar</button>` : ''}</div>`;
    $step.innerHTML = `
      <h2>Confirmá tu turno</h2>
      <p class="hint">Revisá que esté todo bien.</p>
      <div class="summary">
        ${row(s.icon, 'Servicio', `${escapeHtml(s.name)} · ${money(s.price)}`, 0)}
        ${row('calendar', 'Día', `<span>${longDate(state.date)}</span>`, 1)}
        ${row('clock', 'Horario', `${state.time} hs · ${duration(s.duration)}`, 2)}
        ${row('user', 'A nombre de', `${escapeHtml(state.name)} · ${escapeHtml(state.phone)}`, 3)}
      </div>
      <button class="btn btn-lg btn-block" id="confirm">${icon('check', 'ico')} Confirmar turno</button>`;
    $step.querySelectorAll('[data-step]').forEach(b => b.onclick = () => go(Number(b.dataset.step)));

    const btn = document.getElementById('confirm');
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Reservando…';
      try {
        const result = await api('/appointments', {
          method: 'POST',
          body: { service_id: s.id, date: state.date, time: state.time, name: state.name, phone: state.phone },
        });
        success(result);
      } catch (err) {
        if (err.status === 409) {
          state.time = null;
          go(2);
        }
        showError(err.message);
        btn.disabled = false;
        btn.innerHTML = `${icon('check', 'ico')} Confirmar turno`;
      }
    };
  },
};

// El turno ya quedó guardado; WhatsApp es el aviso a Merce, no el registro
function success({ appointment: a, whatsapp_url }) {
  state.step = STEPS.length;
  $label.textContent = '¡Listo!';
  document.getElementById('back').hidden = true;
  $step.innerHTML = `
    <div class="success">
      <div class="success-ico">${icon('check')}</div>
      <h2>¡Turno reservado!</h2>
      <p>Tu turno quedó registrado. Enviá el mensaje por WhatsApp para que Merce lo confirme. 💅</p>
      <div class="summary">
        <div class="summary-row">${icon('sparkles')}<div><small>Servicio</small><b>${escapeHtml(a.service_name)}</b></div></div>
        <div class="summary-row">${icon('calendar')}<div><small>Día y hora</small><b>${longDate(a.date)} · ${a.time} hs</b></div></div>
        <div class="summary-row">${icon('list')}<div><small>Turno N°</small><b>${a.id} · Pendiente de confirmación</b></div></div>
      </div>
      <a class="btn btn-lg btn-block btn-wa" href="${whatsapp_url}" target="_blank" rel="noopener">${icon('whatsapp', 'ico')} Enviar por WhatsApp</a>
      <a class="btn btn-lg btn-block btn-ghost" href="./">Volver al inicio</a>
    </div>`;
  window.scrollTo({ top: 0 });

  // Abre WhatsApp con el mensaje armado; si el navegador no lo abre, queda el botón
  setTimeout(() => { location.href = whatsapp_url; }, 1500);
}

// Inicio: carga servicios y, si viene ?servicio=ID desde la página principal, lo preselecciona
(async () => {
  loading();
  try {
    state.services = await api('/services');
  } catch (err) {
    return showError(err.message);
  }
  const preset = state.services.find(s => s.id === Number(new URLSearchParams(location.search).get('servicio')));
  if (preset) {
    state.service = preset;
    go(1);
  } else {
    go(0);
  }
})();
