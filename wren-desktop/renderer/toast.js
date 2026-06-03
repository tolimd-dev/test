'use strict';

const DURATION = 12000; // ms before auto-dismiss

window.toast.onData(({ message, wrenName, wrenColor }) => {
  const color = wrenColor || '#10b981';

  document.getElementById('dot').style.background       = color;
  document.getElementById('wren-name').style.color      = color;
  document.getElementById('wren-name').textContent      = wrenName || 'Lucas';
  document.getElementById('progress-bar').style.background = color;

  // First sentence or first 160 chars — whichever is shorter
  const firstSentence = message.match(/^[^.!?]+[.!?]/)?.[0] || message;
  const text = firstSentence.length > 160 ? firstSentence.slice(0, 157) + '…' : firstSentence;
  document.getElementById('message').textContent = text;

  // Shrink progress bar over DURATION ms
  const bar = document.getElementById('progress-bar');
  requestAnimationFrame(() => {
    bar.style.transition = `width ${DURATION}ms linear`;
    bar.style.width = '0%';
  });

  setTimeout(() => window.toast.dismiss(), DURATION);
});

document.getElementById('card').addEventListener('click', (e) => {
  if (e.target.id === 'dismiss') {
    window.toast.dismiss();
  } else {
    window.toast.open();
  }
});

document.getElementById('dismiss').addEventListener('click', (e) => {
  e.stopPropagation();
  window.toast.dismiss();
});
