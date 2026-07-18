type ToastTone = 'success' | 'error' | 'info';

let host: HTMLDivElement | null = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

export function showToast(message: string, tone: ToastTone = 'info', durationMs = 3200) {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  ensureHost().appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  window.setTimeout(() => {
    el.classList.remove('toast--visible');
    window.setTimeout(() => el.remove(), 220);
  }, durationMs);
}
