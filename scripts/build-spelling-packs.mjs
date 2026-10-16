// Builds the spelling packs in public/packs/ from SCOWL's Hunspell dictionaries.
//
//   node scripts/build-spelling-packs.mjs <dir>
//
// <dir> holds the unzipped en_US-large/ and en_GB-large/ folders from
// https://github.com/en-wl/wordlist/releases (hunspell-en_US-large-*.zip,
// hunspell-en_GB-large-*.zip). Each pack is every word form spelled out
// (affixes expanded), gzipped JSON: { w: correct words, n: correct words
// never to suggest }, one per line.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [dir] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: node scripts/build-spelling-packs.mjs <dir>');
  process.exit(1);
}
const out = path.join(import.meta.dirname, '..', 'public', 'packs');

function parseAffixes(text) {
  const rules = new Map();
  let noSuggest = '';
  let onlyInCompound = '';
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'NOSUGGEST') noSuggest = p[1];
    if (p[0] === 'ONLYINCOMPOUND') onlyInCompound = p[1];
    if (p[0] !== 'PFX' && p[0] !== 'SFX') continue;
    if (p.length === 4 && !rules.has(p[1])) {
      rules.set(p[1], { prefix: p[0] === 'PFX', cross: p[2] === 'Y', list: [] });
      continue;
    }
    const strip = p[2] === '0' ? '' : p[2];
    const add = p[3] === '0' ? '' : p[3].split('/')[0];
    const cond = p[4] ?? '.';
    const prefix = p[0] === 'PFX';
    rules.get(p[1]).list.push({ strip, add, test: new RegExp(prefix ? `^${cond}` : `${cond}$`) });
  }
  return { rules, noSuggest, onlyInCompound };
}

function apply(word, rule) {
  const out = [];
  for (const r of rule.list) {
    if (!r.test.test(word)) continue;
    if (rule.prefix) {
      if (word.startsWith(r.strip)) out.push(r.add + word.slice(r.strip.length));
    } else if (word.endsWith(r.strip)) out.push(word.slice(0, word.length - r.strip.length) + r.add);
  }
  return out;
}

function build(name, outFile) {
  const base = path.join(dir, name, name);
  const { rules, noSuggest, onlyInCompound } = parseAffixes(fs.readFileSync(`${base}.aff`, 'utf8'));
  const words = new Set();
  const hidden = new Set();
  const lines = fs.readFileSync(`${base}.dic`, 'utf8').split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line) continue;
    const [word, flagStr = ''] = line.split('/');
    const flags = [...flagStr];
    if (onlyInCompound && flags.includes(onlyInCompound)) continue;
    if (/\d/.test(word)) continue;
    const target = noSuggest && flags.includes(noSuggest) ? hidden : words;
    const forms = [word];
    const sfx = flags.map((f) => rules.get(f)).filter((r) => r && !r.prefix);
    const pfx = flags.map((f) => rules.get(f)).filter((r) => r && r.prefix);
    const suffixed = sfx.flatMap((r) => apply(word, r).map((w) => ({ w, cross: r.cross })));
    forms.push(...suffixed.map((s) => s.w));
    for (const p of pfx) {
      forms.push(...apply(word, p));
      if (p.cross) for (const s of suffixed) if (s.cross) forms.push(...apply(s.w, p));
    }
    for (const f of forms) target.add(f.replace(/’/g, "'"));
  }
  for (const w of words) hidden.delete(w);
  const data = { w: [...words].sort().join('\n'), n: [...hidden].sort().join('\n') };
  const gz = zlib.gzipSync(JSON.stringify(data), { level: 9 });
  fs.writeFileSync(path.join(out, outFile), gz);
  fs.copyFileSync(path.join(dir, name, `README_${name}.txt`), path.join(out, outFile.replace('.json.gz', '-README.txt')));
  console.log(outFile, words.size, 'words', (gz.length / 1e6).toFixed(2), 'MB');
}

build('en_US-large', 'en-us-spelling.json.gz');
build('en_GB-large', 'en-gb-spelling.json.gz');
