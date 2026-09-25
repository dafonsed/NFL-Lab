const viewport = document.querySelector('#home-review-viewport');

if (viewport) {
  let pointerStart = 0;
  let scrollStart = 0;
  let dragging = false;

  if (innerWidth >= 800) viewport.scrollLeft = 24;

  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    dragging = true;
    pointerStart = event.clientX;
    scrollStart = viewport.scrollLeft;
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', event => {
    if (!dragging) return;
    viewport.scrollLeft = scrollStart - (event.clientX - pointerStart);
    if (Math.abs(event.clientX - pointerStart) > 4) event.preventDefault();
  });

  const finishDrag = () => { dragging = false; };
  viewport.addEventListener('pointerup', finishDrag);
  viewport.addEventListener('pointercancel', finishDrag);
  viewport.addEventListener('lostpointercapture', finishDrag);
}
