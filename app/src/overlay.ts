import { FONT } from './config';
import { input } from './input';

/**
 * Real HTML form fields for the few places that need typing (feedback, player
 * name). Game input is suspended while one is open so typing "j" doesn't jab.
 */

const CSS = `
.sol-modal { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
  background: rgba(5,3,13,0.72); font-family: ${FONT}; }
.sol-card { width: min(560px, 92vw); background: #0d0a22; border: 2px solid #9945ff; box-shadow: 0 0 0 2px #05030d, 0 0 32px rgba(153,69,255,0.45);
  padding: 20px; color: #fff; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box; max-height: 94vh; overflow-y: auto; }
.sol-card h2 { margin: 0; font-size: 14px; color: #ffd23a; letter-spacing: 1px; }
.sol-card p { margin: 0; font-size: 9px; line-height: 1.6; color: #9fe8ff; }
.sol-card textarea, .sol-card input { font-family: inherit; font-size: 11px; line-height: 1.6; color: #fff; background: #05030d;
  border: 1px solid #3a2f63; padding: 10px; resize: vertical; outline: none; }
.sol-card textarea:focus, .sol-card input:focus { border-color: #14f195; }
.sol-row { display: flex; gap: 10px; flex-wrap: wrap; }
.sol-btn { font-family: inherit; font-size: 10px; padding: 10px 14px; background: #1b1438; color: #d9ccff; border: 1px solid #3a2f63; cursor: pointer; }
.sol-btn:hover, .sol-btn:focus-visible { border-color: #14f195; color: #fff; outline: none; }
.sol-btn.on { background: #9945ff; color: #fff; border-color: #c9a8ff; }
.sol-btn.go { background: #14f195; color: #05030d; border-color: #14f195; }
.sol-spacer { flex: 1; }
`;

let styled = false;

function mount(build: (card: HTMLElement, close: () => void) => void, onClose?: () => void) {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  input.suspend(true);
  const modal = document.createElement('div');
  modal.className = 'sol-modal';
  const card = document.createElement('div');
  card.className = 'sol-card';
  modal.appendChild(card);
  const close = () => {
    modal.remove();
    input.suspend(false);
    document.getElementById('screen')?.focus();
    onClose?.();
  };
  modal.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  build(card, close);
  document.body.appendChild(modal);
  card.querySelector<HTMLElement>('textarea, input')?.focus();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  return node;
}

function spacer(): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'sol-spacer';
  return d;
}

export interface FeedbackDraft {
  kind: 'bug' | 'feedback';
  message: string;
}

/** REPORT BUG / SEND FEEDBACK form. Context is attached automatically by the caller. */
export function openFeedback(contextLine: string, remote: boolean, onSubmit: (d: FeedbackDraft) => void, onClose?: () => void) {
  mount((card, close) => {
    let kind: FeedbackDraft['kind'] = 'bug';
    card.appendChild(el('h2', { textContent: 'REPORT BUG / SEND FEEDBACK' }));
    const kinds = el('div', { className: 'sol-row' });
    const bugBtn = el('button', { className: 'sol-btn on', textContent: 'BUG', type: 'button' });
    const fbBtn = el('button', { className: 'sol-btn', textContent: 'FEEDBACK', type: 'button' });
    const pick = (k: FeedbackDraft['kind']) => {
      kind = k;
      bugBtn.classList.toggle('on', k === 'bug');
      fbBtn.classList.toggle('on', k === 'feedback');
    };
    bugBtn.onclick = () => pick('bug');
    fbBtn.onclick = () => pick('feedback');
    kinds.append(bugBtn, fbBtn);
    card.appendChild(kinds);
    const area = el('textarea', { rows: 5, maxLength: 1000, placeholder: 'What happened? What did you expect?' });
    card.appendChild(area);
    card.appendChild(el('p', { textContent: `Attached automatically: ${contextLine}` }));
    const status = el('p', { textContent: remote ? '' : 'Saved on this device. Use EXPORT BETA DATA on the profile screen to send it.' });
    card.appendChild(status);
    const row = el('div', { className: 'sol-row' });
    const cancel = el('button', { className: 'sol-btn', textContent: 'CANCEL', type: 'button' });
    const send = el('button', { className: 'sol-btn go', textContent: 'SEND', type: 'button' });
    cancel.onclick = close;
    send.onclick = () => {
      if (!area.value.trim()) {
        area.focus();
        return;
      }
      onSubmit({ kind, message: area.value.trim() });
      send.disabled = true;
      cancel.textContent = 'CLOSE';
      status.textContent = remote ? 'SENT. THANK YOU!' : 'SAVED. THANK YOU!';
      setTimeout(close, 900);
    };
    row.append(cancel, spacer(), send);
    card.appendChild(row);
  }, onClose);
}

/** One-line text prompt (player name). */
export function promptText(title: string, initial: string, maxLength: number, onDone: (value: string) => void) {
  mount((card, close) => {
    card.appendChild(el('h2', { textContent: title }));
    const field = el('input', { value: initial, maxLength });
    card.appendChild(field);
    const row = el('div', { className: 'sol-row' });
    const cancel = el('button', { className: 'sol-btn', textContent: 'CANCEL', type: 'button' });
    const save = el('button', { className: 'sol-btn go', textContent: 'SAVE', type: 'button' });
    cancel.onclick = close;
    const submit = () => {
      onDone(field.value);
      close();
    };
    save.onclick = submit;
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    row.append(cancel, spacer(), save);
    card.appendChild(row);
  });
}
