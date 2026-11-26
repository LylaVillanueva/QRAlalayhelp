import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Production build safety:
//  * refuses to build without the Supabase project URL and publishable key,
//    so a published site can never load without a backend;
//  * requires an HTTPS *.supabase.co origin (phones only share location over HTTPS);
//  * adds a Content-Security-Policy so the page can only load its own files
//    and talk to that one Supabase project.
function productionSafety(supabaseUrl, supabasePublishableKey) {
  return {
    name: 'qralalay-production-safety',
    apply: 'build',
    configResolved() {
      if (!supabaseUrl || !supabasePublishableKey) {
        throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before building.');
      }
      let url;
      try { url = new URL(supabaseUrl); }
      catch { throw new Error('VITE_SUPABASE_URL must be an absolute URL.'); }
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('VITE_SUPABASE_URL must be an HTTPS Supabase project origin.');
      }
      if (/^(sb_secret_|eyJ[^.]+\.eyJ[^.]*cm9sZSI6InNlcnZpY2Vfcm9sZS)/.test(supabasePublishableKey)) {
        throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key, never a secret or service-role key.');
      }
    },
    transformIndexHtml(html) {
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self' ${new URL(supabaseUrl).origin}`,
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), productionSafety(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)],
    // Local development only: reachable from a phone on the same Wi-Fi.
    server: { host: true, port: 5173 },
  };
});
