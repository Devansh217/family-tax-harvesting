import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPABASE_URL } from './cloud';
import { cspFor } from './csp';

describe('content security policy', () => {
  it('allows only our own scripts, styles and fonts, and our Supabase project', () => {
    const csp = cspFor(SUPABASE_URL);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain(`connect-src 'self' ${new URL(SUPABASE_URL).origin}`);
    expect(csp).toContain("frame-src 'none'");
    expect(csp).not.toMatch(/googleapis|gstatic|unsafe-eval/);
  });
  it('the page loads no fonts from Google', () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });
});
