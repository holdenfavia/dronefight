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

  private client: SupabaseClient | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

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
    try {
      void this.loadProviders();
      const client = await this.getClient();
      if (!client) return;
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) this.becomeGuest();
        else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void this.becomeUser(session.user);
      });
      const { data } = await client.auth.getSession();
      if (data.session) await this.becomeUser(data.session.user);
      else this.becomeGuest();
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

  private becomeGuest(): void {
    this.user = null;
    this.status = 'guest';
    this.onChange();
  }

  private async becomeUser(user: User): Promise<void> {
    if (this.user?.id === user.id && this.status === 'signed-in') return;
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
      if (error) throw new Error(error.message);
      const merged = mergeOnSignIn(this.profile, data);
      this.profile = merged.profile;
      saveLocalProfile(this.profile);
      this.status = 'signed-in';
      this.error = null;
      this.onChange();
      if (merged.upload) await this.upload();
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Could not load your profile');
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
