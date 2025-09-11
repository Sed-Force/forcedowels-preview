/* Clerk user button (kept safe) */
window.addEventListener('load', async () => {
  try {
    if (window.Clerk) {
      await window.Clerk.load();
      const userBtn = document.getElementById('user-button');
      if (window.Clerk.user && userBtn) {
        window.Clerk.mountUserButton(userBtn);
        document.body.classList.add('authed');
      }
    }
  } catch (_) {}
});

/* ======= Simple Slider (5 slides) ======================================= */
(function () {
  const viewport = document.getElementById('fd-viewport');
  if (!viewport) return;

  const slides = Array.from(viewport.querySelectorAll('.slide'));
  const dots = Array.from(document.querySelectorAll('.slider .dot'));
  const prevBtn = document.querySelector('.slider .prev');
  const nextBtn = document.querySelector('.slider .next');

  let index = 0;
  let timer = null;
  const AUTOPLAY_MS = 4500;

  function goTo(i) {
    index = (i + slides.length) % slides.length;
    viewport.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((s, idx) => s.classList.toggle('is-active', idx === index));
    dots.forEach((d, idx) => {
      d.classList.toggle('is-active', idx === index);
      d.setAttribute('aria-selected', idx === index ? 'true' : 'false');
    });
  }
  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  // Dots click
  dots.forEach(d => d.addEventListener('click', () => {
    const i = parseInt(d.getAttribute('data-slide'), 10) || 0;
    goTo(i);
    restart();
  }));

  // Arrows
  if (nextBtn) nextBtn.addEventListener('click', () => { next(); restart(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); restart(); });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { next(); restart(); }
    if (e.key === 'ArrowLeft')  { prev(); restart(); }
  });

  // Autoplay with pause on hover
  function start() { timer = setInterval(next, AUTOPLAY_MS); }
  function stop()  { if (timer) clearInterval(timer); timer = null; }
  function restart(){ stop(); start(); }

  const slider = document.querySelector('.slider');
  if (slider) {
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
  }

  // Touch swipe
  let sx = 0, dx = 0;
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; dx = 0; stop();
  }, { passive: true });
  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    dx = e.touches[0].clientX - sx;
  }, { passive: true });
  viewport.addEventListener('touchend', () => {
    const threshold = 40;
    if (dx > threshold) prev();
    else if (dx < -threshold) next();
    restart();
  });

  // Init
  goTo(0);
  start();
})();
