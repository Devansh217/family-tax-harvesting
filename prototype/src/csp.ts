/**
 * The page's Content Security Policy (secure storage spec §5.7): only our own scripts, styles and fonts, connections
 * only to our site and our Supabase project. GitHub Pages can't send headers, so it is a <meta> tag added to the
 * built page by vite.config.ts (the dev server needs an inline script for hot reload, so dev runs without it).
 * Styles allow 'unsafe-inline' because React sets `style` attributes.
 */
export function cspFor(supabaseUrl: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self' ${new URL(supabaseUrl).origin}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ') + ';';
}
