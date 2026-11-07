// yourigin-portfolio — serves a published YOUrigin portfolio to a visitor
// who has its link. Visitors need no account; the link token (and, for
// protected portfolios, a password or a recent pass) is the only key.
//
// Reads with the service role, but only the columns a visitor's page needs:
// never the password hash (passwords are checked inside the database by
// yourigin_portfolio_try_password). See handler.ts for the flow.
//
// Deploy (visitors have no sign-in, so the platform's JWT check is off;
// the function does its own checks):
//   supabase functions deploy yourigin-portfolio --no-verify-jwt --project-ref yikoymzktspamahrsuje
// Secrets:
//   supabase secrets set PORTFOLIO_PASS_SECRET=<64+ random characters> --project-ref yikoymzktspamahrsuje
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createHandler, type PortfolioRow } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('PORTFOLIO_PASS_SECRET') ?? '';
if (SECRET.length < 32) throw new Error('PORTFOLIO_PASS_SECRET must be set (at least 32 characters).');

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const COLUMNS = 'id,user_id,local_id,share_token,status,visibility,password_version,expires_at,snapshot';

Deno.serve(
  createHandler({
    secret: SECRET,
    now: () => Date.now(),
    async findByToken(token) {
      const { data, error } = await admin.from('yourigin_portfolios').select(COLUMNS).eq('share_token', token).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PortfolioRow | null) ?? null;
    },
    async tryPassword(id, password, client) {
      const { data, error } = await admin.rpc('yourigin_portfolio_try_password', { p_id: id, p_password: password, p_client: client });
      if (error) throw new Error(error.message);
      return data === 'ok' || data === 'locked' ? data : 'wrong';
    },
    async noteView(id) {
      await admin.rpc('yourigin_portfolio_note_view', { p_id: id });
    },
    async signImages(paths, seconds) {
      const { data, error } = await admin.storage.from('portfolios').createSignedUrls(paths, seconds);
      if (error) throw new Error(error.message);
      return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
    },
  }),
);
