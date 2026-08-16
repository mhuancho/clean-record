const timer = document.getElementById('timer');
const label = document.getElementById('label');
const dot = document.getElementById('dot');
const pause = document.getElementById('pause');
const pauseIcon = document.getElementById('pause-icon');
let paused = false;

pause.addEventListener('click', () => window.cleanRecordOverlay.sendCommand(paused ? 'resume' : 'pause'));
document.getElementById('stop').addEventListener('click', () => window.cleanRecordOverlay.sendCommand('stop'));

window.cleanRecordOverlay.onState(state => {
  paused = Boolean(state.isPaused);
  timer.textContent = state.time || '00:00';
  label.textContent = paused ? 'Grabación en pausa' : state.audioLabel || 'Grabando pantalla';
  dot.classList.toggle('paused', paused);
  pause.setAttribute('aria-label', paused ? 'Reanudar grabación' : 'Pausar grabación');
  pause.setAttribute('title', paused ? 'Reanudar' : 'Pausar');
  pauseIcon.innerHTML = paused
    ? '<path d="m7 4 13 8-13 8V4Z"/>'
    : '<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>';
});
