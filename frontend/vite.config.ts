import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Content-Security-Policy só no build de produção (no modo dev o Vite usa
 * scripts inline para recarregar a página). Reduz o impacto de um XSS:
 * scripts só deste site e conexões só com a API configurada.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'lifehub-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const api = new URL(process.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1');
      const apiOrigins = [api.origin, api.origin.replace('localhost', '127.0.0.1')].join(' ');
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        `img-src 'self' data: blob: ${apiOrigins}`,
        `connect-src 'self' ${apiOrigins} https://viacep.com.br`,
        "frame-src https://www.openstreetmap.org https://meet.livekit.io",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  server: { host: process.env.LIFEHUB_LAN === 'true' ? '0.0.0.0' : '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api/v1': { target: 'http://127.0.0.1:3000', changeOrigin: true } } },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
