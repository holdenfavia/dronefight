import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadLocalProfile, mergeOnSignIn, rowFromProfile, saveLocalProfile, type Profile, type ProfileRow } from './profile';

/**
 * Optional sign-in (ADR-0030, ADR-0031): Discord or Google through Supabase. Guests never need it.
 * The Supabase client is loaded only when configured and only when needed, so the game's first load
 * stays small and works without it.
 */

export type Provider = 'discord' | 'google';
export type AccountStatus = 'unavailable' | 'loading' | 'guest' | 'signed-in' | 'error';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** Profile edits are written to the account at most this often (ms). */
const SAVE_DELAY_MS = 800;

export class Account {
  status: AccountStatus = SUPABASE_URL && ANON_KEY ? 'loading' : 'unavailable';
  /** Who's signed in: a display name and which provider, for the menu. */
  user: { id: string; label: string; provider: string } | null = null;
  error: string | null = null;
  profile: Profile = loadLocalProfile();
  /** Providers switched on in the Supabase project; the menu shows only these. */
  providers: Provider[] = [];
  /** Your XP (ADR-0032): read from your progress row at sign-in, then kept current by the room server. */
  xp: number | null = null;
  /** The current access token (for the room server), and who wants to hear when it changes. */
  accessToken: string | null = null;
  onToken: ((token: string | null) => void) | null = null;

  private client: SupabaseClient | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** The user we're loading, so the SIGNED_IN event and getSession() don't both load them. */
  private loading: Promise<void> | null = null;
  /** True while returning from Google with a sign-in code to exchange. */
  returning = false;

  constructor(private readonly onChange: () => void) {
    if (this.status === 'loading') void this.start();
  }

  get available(): boolean {
    return this.status !== 'unavailable';
  }

  /** Redirects to Discord or Google, then back here signed in. */
  async signIn(provider: Provider): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    // Come back to the same page (keeps ?room=CODE invite links working).
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: location.href.split('#')[0] } });
    if (error) this.fail(error.message);
  }

  async signOut(): Promise<void> {
    await this.client?.auth.signOut();
  }

  /** Change the profile: saved in this browser now, and to the account shortly after (when signed in). */
  update(change: Partial<Profile>): void {
    this.profile = { ...this.profile, ...change };
    saveLocalProfile(this.profile);
    this.onChange();
    if (this.status !== 'signed-in') return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.upload(), SAVE_DELAY_MS);
  }

  private async getClient(): Promise<SupabaseClient | null> {
    if (this.client) return this.client;
    if (!SUPABASE_URL || !ANON_KEY) return null;
    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
    return this.client;
  }

  private async start(): Promise<void> {
    // Coming back from Google: either a code to exchange, or an error to show.
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const oauthError = params.get('error_description') ?? hash.get('error_description') ?? params.get('error') ?? hash.get('error');
    this.returning = params.has('code');
    if (oauthError) {
      console.warn('[auth] sign-in returned an error:', oauthError);
      this.error = `Sign-in didn't go through: ${oauthError.replace(/\+/g, ' ')}`;
      for (const k of ['error', 'error_code', 'error_description']) params.delete(k);
      const clean = `${location.pathname}${params.toString() ? `?${params}` : ''}`;
      history.replaceState(null, '', clean);
    }
    try {
      void this.loadProviders();
      const client = await this.getClient();
      if (!client) return;
      client.auth.onAuthStateChange((event, session) => {
        console.info('[auth]', event, session ? `user ${session.user.id}` : 'no session');
        this.setToken(session?.access_token ?? null);
        // Don't call Supabase from inside this callback (it holds the auth lock): defer.
        if (event === 'SIGNED_OUT' || !session) setTimeout(() => this.becomeGuest(), 0);
        else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(() => void this.becomeUser(session.user), 0);
      });
      const { data, error } = await client.auth.getSession();
      if (error) console.warn('[auth] getSession failed:', error.message);
      this.setToken(data.session?.access_token ?? null);
      if (data.session) await this.becomeUser(data.session.user);
      else {
        if (this.returning && !this.error) this.error = "Sign-in didn't complete (no session after returning from Google). Try again.";
        this.becomeGuest();
      }
      this.returning = false;
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Sign-in is unavailable');
    }
  }

  /** Ask the project which sign-in providers are enabled (public settings, no session needed). */
  private async loadProviders(): Promise<void> {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: ANON_KEY ?? '' } });
      const external = ((await res.json()) as { external?: Record<string, boolean> }).external ?? {};
      this.providers = (['discord', 'google'] as const).filter((p) => external[p]);
    } catch {
      // Unknown: offer both rather than none.
      this.providers = ['discord', 'google'];
    }
    this.onChange();
  }

  /** The server's word on your XP (ADR-0032). */
  setXp(xp: number): void {
    this.xp = xp;
    this.onChange();
  }

  private setToken(token: string | null): void {
    if (token === this.accessToken) return;
    this.accessToken = token;
    this.onToken?.(token);
  }

  private becomeGuest(): void {
    this.user = null;
    this.xp = null;
    this.status = 'guest';
    this.onChange();
  }

  private async becomeUser(user: User): Promise<void> {
    if (this.user?.id === user.id && this.status === 'signed-in') return;
    if (this.loading) return this.loading;
    this.loading = this.loadUser(user).finally(() => (this.loading = null));
    return this.loading;
  }

  private async loadUser(user: User): Promise<void> {
    const provider = (user.app_metadata.provider as string | undefined) ?? 'account';
    const meta = user.user_metadata as Record<string, unknown>;
    const label = String(meta.full_name ?? meta.name ?? meta.user_name ?? user.email ?? 'Pilot');
    this.user = { id: user.id, label, provider };
    // Tidy the address bar after the OAuth redirect.
    if (location.search.includes('code=')) {
      const url = new URL(location.href);
      url.searchParams.delete('code');
      history.replaceState(null, '', url.toString());
    }
    try {
      const { data, error } = await this.client!.from('profiles').select('pilot_name, looks').eq('id', user.id).maybeSingle<ProfileRow>();
      if (error) throw new Error(`profile: ${error.message}`);
      const merged = mergeOnSignIn(this.profile, data);
      // Your XP so far (readable only by you; only the server writes it, ADR-0032).
      const progress = await this.client!.from('progress').select('xp').eq('id', user.id).maybeSingle<{ xp: number }>();
      this.xp = Number(progress.data?.xp ?? 0);
      this.profile = merged.profile;
      saveLocalProfile(this.profile);
      this.status = 'signed-in';
      this.error = null;
      console.info('[auth] signed in as', label, `(${provider})`);
      this.onChange();
      if (merged.upload) await this.upload();
    } catch (e) {
      // Signed in with Google even if the profile row failed: say so, and still show as signed in.
      this.status = 'signed-in';
      this.fail(`Signed in, but your profile didn't load: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async upload(): Promise<void> {
    if (!this.client || !this.user) return;
    const { error } = await this.client.from('profiles').upsert({ id: this.user.id, ...rowFromProfile(this.profile) });
    if (error) this.fail(`Couldn't save to your account: ${error.message}`);
  }

  private fail(message: string): void {
    this.error = message;
    if (this.status === 'loading') this.status = 'error';
    this.onChange();
  }
}
