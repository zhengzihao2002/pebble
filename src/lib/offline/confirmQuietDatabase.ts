import { getDictionary } from '@/lib/i18n';
import { usePebbleStore } from '@/store/usePebbleStore';
import { quietSyncIsPaused } from './quietSync';

let showing = false;

export function confirmQuietDatabase(purpose: 'now' | 'undo' | 'enable' | 'disable' = 'now'): Promise<boolean> {
  if (purpose !== 'enable' && !quietSyncIsPaused()) return Promise.resolve(true);
  if (showing) return Promise.resolve(false);
  const labels = getDictionary(usePebbleStore.getState().locale).ux.offline.quietSync.confirm;
  const dialog = document.createElement('dialog');
  const body = purpose === 'now' ? labels.body : labels[purpose];
  if (!dialog.showModal) return Promise.resolve(window.confirm(body));

  dialog.className = 'pb-quiet-confirm';
  const heading = document.createElement('h2');
  heading.id = 'pb-quiet-confirm-title';
  heading.textContent = labels.title;
  dialog.setAttribute('aria-labelledby', heading.id);
  const description = document.createElement('p');
  description.id = 'pb-quiet-confirm-description';
  description.textContent = body;
  dialog.setAttribute('aria-describedby', description.id);
  const form = document.createElement('form');
  form.method = 'dialog';
  const cancel = document.createElement('button');
  cancel.type = 'submit';
  cancel.className = 'pill';
  cancel.autofocus = true;
  cancel.textContent = labels.cancel;
  const proceed = document.createElement('button');
  proceed.type = 'submit';
  proceed.className = 'btn-primary';
  proceed.value = 'connect';
  proceed.textContent = labels.proceed;
  form.append(cancel, proceed);
  dialog.append(heading, description, form);
  const previousFocus = document.activeElement;
  showing = true;
  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      dialog.remove();
      showing = false;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(dialog.returnValue === 'connect');
    }, { once: true });
    (document.querySelector('.pebble-root') ?? document.body).append(dialog);
    try { dialog.showModal(); }
    catch { dialog.remove(); showing = false; resolve(false); }
  });
}
