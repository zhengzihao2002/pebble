'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Eye, EyeOff } from 'lucide-react';
import { LoadingBlock } from '@/components/shared/Spinner';
import { usePebbleStore } from '@/store/usePebbleStore';

/**
 * Some of the auth library's views render differently on the server and in
 * the browser - email-verification drew a <div> on the server and a <form>
 * in the browser, a hydration mismatch. The same fix AccountViewClient
 * already uses for the account views: skip the server render of the form
 * only. The brand panel around it stays server-rendered and appears at once.
 */
const AuthView = dynamic(
  () => import('@neondatabase/auth-ui').then((m) => m.AuthView),
  { ssr: false, loading: () => <LoadingBlock minHeight={320} /> },
);

// Auth-only strings live here, as PebbleAuthUIProvider keeps its own. The
// library ships no show/hide wording, and its own eye has no label at all.
const EYE_LABELS = {
  en: { show: 'Show password', hide: 'Hide password' },
  zh: { show: '显示密码', hide: '隐藏密码' },
};
type EyeLabels = (typeof EYE_LABELS)['en'];

// The library's PasswordInput only draws its eye where its own code passes
// enableToggle - sign-up and change password, but not sign-in or reset. This
// is the same control for the fields it leaves out: same place and size,
// disabled while empty, eye when shown and crossed eye when hidden.
function PasswordEye({ input, labels }: { input: HTMLInputElement; labels: EyeLabels }) {
  const [visible, setVisible] = useState(input.type === 'text');
  const [empty, setEmpty] = useState(input.value === '');

  useEffect(() => {
    const sync = () => setEmpty(input.value === '');
    // Hidden again on submit, so password managers still see a password field.
    const hideOnSubmit = () => { input.type = 'password'; setVisible(false); };
    const form = input.form;
    input.addEventListener('input', sync);
    form?.addEventListener('submit', hideOnSubmit, true);
    return () => {
      input.removeEventListener('input', sync);
      form?.removeEventListener('submit', hideOnSubmit, true);
    };
  }, [input]);

  const toggle = () => {
    const next = !visible;
    input.type = next ? 'text' : 'password';
    setVisible(next);
  };

  const Icon = visible ? Eye : EyeOff;
  return (
    <button
      type="button"
      onClick={toggle}
      // Keeps the cursor in the field, so typing carries on after a click.
      onMouseDown={(e) => e.preventDefault()}
      disabled={empty}
      aria-pressed={visible}
      aria-label={visible ? labels.hide : labels.show}
      title={visible ? labels.hide : labels.show}
      style={{
        position: 'absolute', top: 0, right: 0, height: '100%', width: 36,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', padding: 0,
        color: 'var(--ink-soft)', cursor: empty ? 'default' : 'pointer', opacity: empty ? 0.5 : 1,
      }}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

// React must not unmount one tree while another is rendering; a microtask
// is enough to step outside the current commit. Not a timer or a poll.
const unmountLater = (root: Root, holder: HTMLElement) => {
  queueMicrotask(() => { root.unmount(); holder.remove(); });
};

export function AuthViewClient({ path }: { path: string }) {
  const labels = usePebbleStore((s) => s.locale) === 'zh' ? EYE_LABELS.zh : EYE_LABELS.en;
  const hostRef = useRef<HTMLDivElement>(null);

  // Watches only this wrapper. An observer, not a timer: it runs when the
  // library adds or removes nodes, and is disconnected on unmount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mounted = new Map<HTMLInputElement, { root: Root; holder: HTMLSpanElement }>();

    const attach = () => {
      // Drop eyes whose field is gone (a view change, or the library re-rendered).
      mounted.forEach((m, input) => {
        if (!input.isConnected) { unmountLater(m.root, m.holder); mounted.delete(input); }
      });
      host.querySelectorAll<HTMLInputElement>('input[type="password"], input[data-pb-eye]').forEach((input) => {
        if (mounted.has(input)) return;
        // pr-10 is the library's mark for a field that already has its own eye.
        if (input.classList.contains('pr-10')) return;
        const box = input.parentElement;
        if (!box) return;
        input.dataset.pbEye = '1';
        input.style.paddingRight = '2.5rem';
        if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
        const holder = document.createElement('span');
        box.appendChild(holder);
        const root = createRoot(holder);
        root.render(<PasswordEye input={input} labels={labels} />);
        mounted.set(input, { root, holder });
      });
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(host, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mounted.forEach((m) => unmountLater(m.root, m.holder));
      mounted.clear();
    };
  }, [labels]);

  return (
    <div ref={hostRef}>
      <AuthView path={path} />
    </div>
  );
}
