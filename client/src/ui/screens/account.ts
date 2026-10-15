import type { Account } from '../../account/account';
import { cleanPilotName, NAME_MAX } from '../../../../shared/cosmetics';
import { levelProgress } from '../../../../shared/progression';
import { escapeHtml, type MenuContext, type MenuScreen } from './screen';

/**
 * Start-screen entry to the account: plainly "✓ Signed in" (green, with your name and level) once you
 * are, "Sign in (optional)" for guests. Hidden if sign-in isn't set up.
 */
export function accountButton(a: Account): string {
  if (!a.available) return '';
  if (a.status === 'signed-in') {
    const name = escapeHtml(a.profile.name || a.user?.label || '');
    const level = a.xp !== null ? ` · Lv ${levelProgress(a.xp).level}` : '';
    return `<button class="btn ghost account-btn signed-in" data-account><span class="signed-in-mark">✓ Signed in</span>${name ? ` · ${name}` : ''}${level}</button>`;
  }
  const label = a.status === 'loading' ? (a.returning ? 'Finishing sign-in…' : 'Checking sign-in…') : 'Sign in (optional) ▸';
  // A failed sign-in says why, right on the start screen.
  const err = a.error ? `<div class="join-status warn">${escapeHtml(a.error)}</div>` : '';
  return `<button class="btn ghost account-btn" data-account>${label}</button>${err}`;
}

/** Your level and progress to the next (ADR-0032). */
function levelBlock(xp: number): string {
  const { level, into, span } = levelProgress(xp);
  return `<div class="level-row"><span class="level-num">Level ${level}</span><span>${into.toLocaleString()} / ${span.toLocaleString()} XP to level ${level + 1}</span></div>
        <div class="level-bar"><div style="width:${((into / span) * 100).toFixed(1)}%"></div></div>
        <div class="level-hint">Earn XP in online matches: kills, assists, finishing and winning.</div>`;
}

/** Account: sign in with Discord or Google, your pilot name, sign out (ADR-0030, ADR-0031). */
export class AccountScreen implements MenuScreen {
  constructor(private readonly ctx: MenuContext) {}

  /** Sign-in state changed: redraw, unless you're typing your pilot name. */
  refresh(): void {
    if (!this.ctx.root.querySelector('[data-pilot-name]:focus')) this.render();
  }

  render(): void {
    const { root, account: a } = this.ctx;
    const signedIn = a.status === 'signed-in';
    const via = a.user?.provider === 'google' ? 'Google' : a.user?.provider === 'discord' ? 'Discord' : 'your account';
    root.innerHTML = `
      <div class="panel account">
        <div class="panel-head"><span class="kicker">Account</span><h2>${signedIn ? 'Signed in' : 'Sign in'}</h2></div>
        <p class="calib-body">${
          signedIn
            ? `Signed in with <b>${via}</b> as <b>${escapeHtml(a.user?.label ?? '')}</b>. Your pilot name and drones follow you to any device.`
            : 'Optional. Playing never needs an account; signing in keeps your pilot name and drones on every device, and later your progress.'
        }</p>
        ${
          signedIn
            ? ''
            : `<div class="signin-buttons">
          ${a.providers.includes('discord') ? `<button class="btn signin discord" data-signin="discord" ${a.status === 'loading' ? 'disabled' : ''}>Sign in with Discord</button>` : ''}
          ${a.providers.includes('google') ? `<button class="btn signin google" data-signin="google" ${a.status === 'loading' ? 'disabled' : ''}>${GOOGLE_G}<span>Sign in with Google</span></button>` : ''}
        </div>`
        }
        ${signedIn && a.xp !== null ? levelBlock(a.xp) : ''}
        <label class="field">Pilot name <input type="text" maxlength="${NAME_MAX}" placeholder="your callsign" value="${escapeHtml(a.profile.name)}" data-pilot-name autocomplete="off" spellcheck="false"></label>
        <div class="join-status warn">${a.error ? escapeHtml(a.error) : ''}</div>
        <div class="actions">
          ${signedIn ? '<button class="btn ghost" data-signout>Sign out</button>' : ''}
          <button class="btn" data-done>Done</button>
        </div>
      </div>`;
    root.querySelectorAll<HTMLButtonElement>('[data-signin]').forEach((b) =>
      b.addEventListener('click', () => {
        b.disabled = true;
        b.textContent = 'Opening…';
        void a.signIn(b.dataset.signin === 'google' ? 'google' : 'discord');
      }),
    );
    root.querySelector('[data-signout]')?.addEventListener('click', () => void a.signOut());
    root.querySelector('[data-done]')?.addEventListener('click', () => this.ctx.back());
    const name = root.querySelector<HTMLInputElement>('[data-pilot-name]');
    name?.addEventListener('input', () => {
      const clean = cleanPilotName(name.value);
      if (clean !== name.value.trim()) name.value = clean;
      a.update({ name: clean });
    });
  }
}

/** Google's "G" mark, as their sign-in branding guidelines specify for a "Sign in with Google" button. */
const GOOGLE_G = `<svg class="signin-logo" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;
