import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Production build safety:
//  * refuses to build without a real backend address, so a published site
//    can never quietly point at a developer's laptop (localhost);
//  * requires HTTPS for that address (phones only share location over HTTPS);
//  * adds a Content-Security-Policy so the page can only load its own files
//    and talk to that one backend.
function productionSafety(apiBaseUrl) {
  return {
    name: 'resqr-production-safety',
    apply: 'build',
    configResolved() {
      if (!apiBaseUrl) throw new Error('VITE_API_BASE_URL is not set. Set it to the public backend address, e.g. https://api.example.com/api');
      let url;
      try {
        url = new URL(apiBaseUrl);
      } catch {
        throw new Error(`VITE_API_BASE_URL is not a valid absolute URL (got ${apiBaseUrl}).`);
      }
      const hostname = url.hostname.toLowerCase();
      if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname) || hostname.endsWith('.localhost')) {
        throw new Error(`VITE_API_BASE_URL is ${apiBaseUrl}. A published site can't reach localhost; use the public backend address.`);
      }
      if (url.protocol !== 'https:') throw new Error(`VITE_API_BASE_URL must use https:// (got ${apiBaseUrl}).`);
      if (url.username || url.password || url.search || url.hash) {
        throw new Error('VITE_API_BASE_URL must not contain credentials, a query string, or a fragment.');
      }
      if (!url.pathname.replace(/\/+$/, '').endsWith('/api')) {
        throw new Error(`VITE_API_BASE_URL must end in /api (got ${apiBaseUrl}).`);
      }
    },
    transformIndexHtml(html) {
      const parsedApiUrl = apiBaseUrl ? new URL(apiBaseUrl) : null;
      const api = parsedApiUrl ? `${parsedApiUrl.origin}${parsedApiUrl.pathname.replace(/\/+$/, '')}/` : '';
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self' ${api}`.trim(),
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
    plugins: [react(), productionSafety(env.VITE_API_BASE_URL)],
    // Local development only: reachable from a phone on the same Wi-Fi.
    server: { host: true, port: 5173 },
  };
});
