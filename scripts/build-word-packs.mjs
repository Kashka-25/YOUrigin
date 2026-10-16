// Builds the downloadable dictionary/thesaurus packs in public/packs/.
//
//   node scripts/build-word-packs.mjs <oewn-json-dir> <oewn-exc-dir> <mthesaur.txt>
//
// Sources (see public/packs/README.md for licences):
//   Open English WordNet 2025: english-wordnet-2025-json.zip (unzipped) and
//     the *.exc files from english-wordnet-2025.zip, from
//     https://github.com/globalwordnet/english-wordnet/releases
//   Moby Thesaurus II: mthesaur.txt from https://www.gutenberg.org/ebooks/3202
//
// The packs are gzipped JSON. They are not precached with the app; the app
// downloads one only when it's chosen in Settings.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [jsonDir, excDir, mobyFile] = process.argv.slice(2);
if (!jsonDir || !excDir || !mobyFile) {
  console.error('Usage: node scripts/build-word-packs.mjs <oewn-json-dir> <oewn-exc-dir> <mthesaur.txt>');
  process.exit(1);
}
const out = path.join(import.meta.dirname, '..', 'public', 'packs');
fs.mkdirSync(out, { recursive: true });

function write(name, data) {
  const gz = zlib.gzipSync(JSON.stringify(data), { level: 9 });
  fs.writeFileSync(path.join(out, name), gz);
  console.log(name, (gz.length / 1e6).toFixed(1), 'MB');
}

// WordNet: s = meanings [pos, definition, example, words, similar meanings],
// w = word -> meanings (most common first), f = form -> [base word, ending]
// (went -> [go, ed]), x = base word -> ending -> irregular forms (go -> ed -> went, gone).
{
  const synsets = {};
  const entries = {};
  for (const f of fs.readdirSync(jsonDir)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(jsonDir, f), 'utf8'));
    if (f.startsWith('entries-')) Object.assign(entries, j);
    else if (/^(noun|verb|adj|adv)\./.test(f)) Object.assign(synsets, j);
  }
  const ids = Object.keys(synsets);
  const at = new Map(ids.map((id, i) => [id, i]));
  const s = ids.map((id) => {
    const x = synsets[id];
    const ex = (x.example ?? []).map((e) => (typeof e === 'string' ? e : e.text))[0] ?? '';
    const pos = x.partOfSpeech === 's' ? 'a' : x.partOfSpeech;
    return [pos, x.definition?.[0] ?? '', ex, x.members, (x.similar ?? []).map((y) => at.get(y)).filter((i) => i !== undefined)];
  });
  const w = Object.create(null);
  const f = Object.create(null);
  const x = Object.create(null);
  const addForm = (form, base, ending) => {
    if (form === base) return;
    // A known ending beats an unknown one for the same base.
    const list = (f[form] = (f[form] ?? []).filter(([b, e]) => !(b === base && !e && ending)));
    if (!list.some(([b, e]) => b === base && (e === ending || !ending))) list.push([base, ending]);
    if (!ending) return;
    const forms = ((x[base] ??= {})[ending] ??= []);
    if (!forms.includes(form)) forms.push(form);
  };
  const guessEnding = (form) => (/ing$/.test(form) ? 'ing' : /ed$/.test(form) ? 'ed' : /s$/.test(form) ? 's' : '');
  const excEnding = (file, form) => {
    if (file.startsWith('noun')) return 's';
    if (file.startsWith('verb')) return /ing$/.test(form) ? 'ing' : /(es|^is|^has)$/.test(form) ? 's' : 'ed';
    return /st$/.test(form) ? 'est' : 'er';
  };
  for (const [lemma, byPos] of Object.entries(entries)) {
    const key = lemma.toLowerCase();
    const list = (w[key] ??= []);
    for (const p of Object.values(byPos)) {
      for (const sense of p.sense) {
        const i = at.get(sense.synset);
        if (i !== undefined && !list.includes(i)) list.push(i);
      }
      for (const form of p.form ?? []) addForm(form.toLowerCase(), key, guessEnding(form.toLowerCase()));
    }
  }
  for (const file of fs.readdirSync(excDir)) {
    if (!file.endsWith('.exc')) continue;
    for (const line of fs.readFileSync(path.join(excDir, file), 'utf8').split(/\r?\n/)) {
      const [form, ...bases] = line.trim().split(/\s+/);
      if (!form) continue;
      for (const b of bases) if (w[b.replace(/_/g, ' ')]) addForm(form.replace(/_/g, ' '), b.replace(/_/g, ' '), excEnding(file, form));
    }
  }
  write('en-wordnet.json.gz', { s, w, f, x });
}

// Moby: w = word -> related words (alphabetical, as in the source).
{
  const w = Object.create(null);
  for (const line of fs.readFileSync(mobyFile, 'utf8').split(/\r?\n/)) {
    const [root, ...rest] = line.split(',');
    if (root && rest.length) w[root.toLowerCase()] = rest;
  }
  write('en-moby.json.gz', { w });
}
