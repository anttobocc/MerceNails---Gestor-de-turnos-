// Utilidades compartidas por las páginas públicas

const icon = (name, cls = '') => `<svg class="${cls}"><use href="icons.svg#i-${name}"/></svg>`;

const money = n =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Algo salió mal. Probá de nuevo.'), { status: res.status });
  return data;
}

const waUrl = (number, text = '') =>
  `https://wa.me/${String(number).replace(/\D/g, '')}${text ? '?text=' + encodeURIComponent(text) : ''}`;

// Configuración del negocio (WhatsApp, dirección, etc.) aplicada a los links de la página
const configReady = api('/config')
  .then(cfg => {
    document.querySelectorAll('.wa-link').forEach(a => {
      a.href = waUrl(cfg.whatsapp, 'Hola Merce! Quería hacerte una consulta 💅');
    });
    return cfg;
  })
  .catch(() => null);


