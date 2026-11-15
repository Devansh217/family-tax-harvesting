import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Module rules from docs/superpowers/specs/2026-11-16-architecture-design.md. A failure names the file and the rule.
const SRC = join(__dirname);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const all = files(SRC).map((p) => ({ path: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }));
const imports = (text: string) =>
  [...text.matchAll(/^\s*import\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => ({ typeOnly: !!m[1], from: m[2]! }));
const resolve = (file: string, spec: string) => {
  if (!spec.startsWith('.')) return spec;
  const parts = file.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
};
const inDir = (p: string, dir: string) => p === dir || p.startsWith(`${dir}/`);

describe('module boundaries', () => {
  it('the engine imports only the engine', () => {
    const bad = all.filter((f) => inDir(f.path, 'engine')).flatMap((f) =>
      imports(f.text).map((i) => resolve(f.path, i.from)).filter((to) => !inDir(to, 'engine')).map((to) => `${f.path} → ${to}`));
    expect(bad).toEqual([]);
  });

  it('parsers and prices import only the engine, each other and packages', () => {
    const bad = all.filter((f) => inDir(f.path, 'parsers') || inDir(f.path, 'prices')).flatMap((f) =>
      imports(f.text).flatMap((i) => {
        if (!i.from.startsWith('.')) return [];  // packages such as pdfjs
        const to = resolve(f.path, i.from);
        if (inDir(to, 'parsers') || inDir(to, 'prices') || inDir(to, 'engine')) return [];
        return [`${f.path} → ${to}`];
      }));
    expect(bad).toEqual([]);
  });

  it('only cloud.ts and storage import the Supabase client library', () => {
    const bad = all.filter((f) => f.path !== 'cloud.ts' && !inDir(f.path, 'storage'))
      .filter((f) => imports(f.text).some((i) => i.from === '@supabase/supabase-js')).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it('only storage reads or writes database tables', () => {
    const bad = all.filter((f) => !inDir(f.path, 'storage') && /supabase\s*\.from\(/.test(f.text)).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it('only storage and sign-in code import cloud.ts data functions', () => {
    const dataFns = /\b(loadFamily|saveFamily|deleteFamily|loadProfile|saveProfile)\b/;
    const bad = all.filter((f) => !inDir(f.path, 'storage') && f.path !== 'cloud.ts')
      .filter((f) => imports(f.text).some((i) => resolve(f.path, i.from) === 'cloud') && dataFns.test(f.text.split('\n').filter((l) => /from\s+['"][./]*cloud['"]/.test(l)).join('\n')))
      .map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it('the engine uses no browser, network, randomness or clock outside todayISO', () => {
    const banned = /\b(window|document|localStorage)\b|\bfetch\(|Math\.random|\bcrypto\./;
    const bad = all.filter((f) => inDir(f.path, 'engine')).flatMap((f) => {
      const hits: string[] = [];
      if (banned.test(f.text)) hits.push(`${f.path}: browser, network or randomness`);
      // Reading the clock (new Date() with no argument, Date.now) only in todayISO; date arithmetic is fine.
      const clock = (f.text.match(/new Date\(\s*\)|Date\.now\(/g) ?? []).length;
      if (clock > 0 && f.path !== 'engine/dates.ts') hits.push(`${f.path}: reads the clock outside todayISO`);
      return hits;
    });
    expect(bad).toEqual([]);
  });
});
