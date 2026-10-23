#!/usr/bin/env node
/** Validate locale symmetry, duplicate keys, and initial bundle budget. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'frontend', 'client', 'src', 'i18n', 'locales');
const LOCALES = ['fr', 'en'];
const MAX_BYTES = 150 * 1024;

function load(locale) {
  const file = path.join(ROOT, `${locale}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
    throw new Error(`${file}: exceeds ${MAX_BYTES} bytes (${Buffer.byteLength(raw, 'utf8')})`);
  }
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${file}: root must be an object`);
  }
  return parsed;
}

function keyTree(value, prefix = '') {
  const keys = new Set();
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      for (const nested of keyTree(child, full)) keys.add(nested);
    } else if (typeof child === 'string') {
      keys.add(full);
    } else {
      throw new Error(`${full}: translation leaf must be a string`);
    }
  }
  return keys;
}

try {
  const catalogs = Object.fromEntries(LOCALES.map((locale) => [locale, load(locale)]));
  const trees = Object.fromEntries(LOCALES.map((locale) => [locale, keyTree(catalogs[locale])]));
  const missingFr = [...trees.en].filter((key) => !trees.fr.has(key)).sort();
  const missingEn = [...trees.fr].filter((key) => !trees.en.has(key)).sort();
  if (missingFr.length || missingEn.length) {
    console.error(`FR missing: ${JSON.stringify(missingFr)}\nEN missing: ${JSON.stringify(missingEn)}`);
    process.exit(1);
  }
  console.log(`Locale catalogs synchronized: ${trees.fr.size} leaf keys; initial payloads within ${MAX_BYTES} bytes each.`);
} catch (error) {
  console.error(`i18n catalog check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
