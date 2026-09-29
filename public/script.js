// Fotos de trabajos: agregá o cambiá imágenes en /img/trabajos y en esta lista
const GALERIA = [
  { src: 'img/trabajos/u1.jpg', alt: 'Uñas almendradas efecto ojo de gato violeta' },
  { src: 'img/trabajos/u2.jpg', alt: 'Uñas nude con detalles animal print dorado' },
  { src: 'img/trabajos/u3.jpg', alt: 'Uñas marrón chocolate con moños dorados' },
  { src: 'img/trabajos/u4.jpg', alt: 'Uñas negras con estrellas doradas' },
  { src: 'img/trabajos/u5.jpg', alt: 'Francesitas clásicas con baby boomer' },
  { src: 'img/trabajos/u6.jpg', alt: 'Uñas rosa con puntas negras, animal print y piedras' },
  { src: 'img/trabajos/u7.jpg', alt: 'Uñas rosa nude largas' },
  { src: 'img/trabajos/u8.jpg', alt: 'Uñas efecto mármol en tonos cobre y rosa' },
];

// Datos del negocio
configReady.then(cfg => {
  if (!cfg) return;
  document.getElementById('address').textContent = cfg.address;
  document.getElementById('maps-link').href = cfg.maps_url;
  if (cfg.instagram) {
    const ig = document.getElementById('instagram-link');
    ig.href = `https://instagram.com/${cfg.instagram.replace(/^@/, '')}`;
    ig.hidden = false;
  }
});

// Servicios con precio y duración
api('/services')
  .then(services => {
    document.getElementById('services').innerHTML = services.map(s => `
      <a class="service" href="reservar.html?servicio=${s.id}">
        <span class="service-ico">${icon(s.icon)}</span>
        <div class="service-body">
          <h3>${escapeHtml(s.name)}</h3>
          <p>${escapeHtml(s.description)}</p>
          <div class="service-meta">
            <span>${icon('clock')} ${duration(s.duration)}</span>
            <strong>${money(s.price)}</strong>
          </div>
        </div>
        <span class="service-cta">Reservar ${icon('arrow')}</span>
      </a>`).join('');
  })
  .catch(() => {
    document.getElementById('services').innerHTML =
      '<p class="muted-note">No pudimos cargar los servicios. Escribinos por WhatsApp.</p>';
  });

// Carrusel de trabajos
const track = document.getElementById('carousel');
const dotsBox = document.getElementById('dots');
track.innerHTML = GALERIA.map((g, i) =>
  `<button class="photo" data-i="${i}"><img src="${g.src}" alt="${escapeHtml(g.alt)}" loading="lazy"></button>`).join('');
const slides = [...track.children];

// Un punto por "página" visible del carrusel
function pages() {
  const perView = Math.max(1, Math.round(track.clientWidth / slides[0].offsetWidth));
  return Math.max(1, slides.length - perView + 1);
}
function renderDots() {
  dotsBox.innerHTML = Array.from({ length: pages() }, (_, i) => `<button aria-label="Ir a la foto ${i + 1}" data-go="${i}"></button>`).join('');
  updateDots();
}
function currentIndex() {
  const step = slides[1] ? slides[1].offsetLeft - slides[0].offsetLeft : track.clientWidth;
  return Math.round(track.scrollLeft / step);
}
function updateDots() {
  const i = Math.min(currentIndex(), pages() - 1);
  [...dotsBox.children].forEach((d, k) => d.classList.toggle('active', k === i));
}
function goTo(i) {
  const n = pages();
  const target = slides[((i % n) + n) % n];
  track.scrollTo({ left: target.offsetLeft - slides[0].offsetLeft, behavior: 'smooth' });
}
dotsBox.addEventListener('click', e => { if (e.target.dataset.go) { goTo(Number(e.target.dataset.go)); restartAuto(); } });
document.querySelector('.car-prev').onclick = () => { goTo(currentIndex() - 1); restartAuto(); };
document.querySelector('.car-next').onclick = () => { goTo(currentIndex() + 1); restartAuto(); };
track.addEventListener('scroll', updateDots, { passive: true });
window.addEventListener('resize', renderDots);
renderDots();

// Avanza solo cada 4 segundos; se pausa mientras la clienta lo toca o pasa el mouse
let auto;
function restartAuto() {
  clearInterval(auto);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) auto = setInterval(() => goTo(currentIndex() + 1), 4000);
}
['pointerenter', 'touchstart'].forEach(ev => track.addEventListener(ev, () => clearInterval(auto), { passive: true }));
['pointerleave', 'touchend'].forEach(ev => track.addEventListener(ev, restartAuto, { passive: true }));
restartAuto();

// Visor
const lb = document.getElementById('lightbox');
const lbImg = lb.querySelector('img');
let current = 0;

function showPhoto(i) {
  clearInterval(auto);
  current = (i + GALERIA.length) % GALERIA.length;
  lbImg.src = GALERIA[current].src;
  lbImg.alt = GALERIA[current].alt;
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closePhoto() {
  lb.hidden = true;
  restartAuto();
  document.body.style.overflow = '';
}

document.addEventListener('click', e => {
  const photo = e.target.closest('.photo');
  if (photo) showPhoto(Number(photo.dataset.i));
});
lb.querySelector('.lb-close').onclick = closePhoto;
lb.querySelector('.lb-prev').onclick = () => showPhoto(current - 1);
lb.querySelector('.lb-next').onclick = () => showPhoto(current + 1);
lb.addEventListener('click', e => { if (e.target === lb) closePhoto(); });
document.addEventListener('keydown', e => {
  if (lb.hidden) return;
  if (e.key === 'Escape') closePhoto();
  if (e.key === 'ArrowLeft') showPhoto(current - 1);
  if (e.key === 'ArrowRight') showPhoto(current + 1);
});
let touchX = 0;
lb.addEventListener('touchstart', e => (touchX = e.touches[0].clientX), { passive: true });
lb.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) showPhoto(current + (dx < 0 ? 1 : -1));
});

// Barra inferior: resalta la sección visible
const navLinks = [...document.querySelectorAll('.bottom-nav a[href^="#"]')];
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
['inicio', 'servicios', 'trabajos'].forEach(id => observer.observe(document.getElementById(id)));
