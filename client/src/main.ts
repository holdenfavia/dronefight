import './ui/styles.css';
import { startGame } from './game';

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} missing from index.html`);
  return found;
}

startGame(el('stage'), el('hud'), el('menu')).catch((err: unknown) => {
  console.error(err);
  const menu = el('menu');
  menu.hidden = false;
  menu.innerHTML = `<div class="panel"><h2>Couldn't start</h2><p>${String(err)}</p><p class="hint">Try the latest Chrome or Edge.</p></div>`;
});
