// Small hand-made theme lexicon for offline tag suggestions. Words are matched
// after light stemming (see domain/text.ts `stem`). Extend freely.
export const THEME_LEXICON: Record<string, string[]> = {
  water: ['water', 'ocean', 'sea', 'river', 'rain', 'tide', 'wave', 'shore', 'tear', 'flood', 'lake', 'stream', 'drown', 'salt', 'current', 'wet', 'swim', 'deep'],
  fire: ['fire', 'flame', 'burn', 'ash', 'ember', 'blaze', 'spark', 'smoke', 'heat', 'candle', 'kindle'],
  earth: ['earth', 'soil', 'root', 'stone', 'mountain', 'ground', 'clay', 'dust', 'seed', 'forest', 'tree', 'bone', 'mud'],
  air: ['air', 'wind', 'breath', 'sky', 'feather', 'cloud', 'wing', 'storm', 'whisper', 'breathe'],
  ether: ['ether', 'spirit', 'soul', 'cosmos', 'star', 'void', 'infinite', 'divine', 'sacred', 'heaven'],
  grief: ['grief', 'griev', 'mourn', 'sorrow', 'weep', 'funeral', 'ache', 'heartbreak', 'lament'],
  loss: ['loss', 'lost', 'gone', 'absence', 'empty', 'missing', 'leave', 'left', 'without'],
  love: ['love', 'lover', 'beloved', 'heart', 'tender', 'kiss', 'hold', 'embrace', 'devotion', 'adore'],
  surrender: ['surrender', 'release', 'let', 'yield', 'trust', 'soften', 'float', 'permission'],
  death: ['death', 'die', 'dying', 'dead', 'grave', 'mortal', 'ending'],
  rebirth: ['rebirth', 'reborn', 'renew', 'resurrect', 'phoenix', 'emerge', 'bloom', 'begin'],
  identity: ['identity', 'self', 'myself', 'mirror', 'name', 'who', 'become', 'mask'],
  freedom: ['freedom', 'free', 'liberat', 'cage', 'escape', 'open', 'unbound'],
  desire: ['desire', 'want', 'longing', 'hunger', 'crave', 'yearn', 'ache'],
  memory: ['memory', 'remember', 'forget', 'childhood', 'past', 'once', 'mother', 'father', 'photograph'],
  transformation: ['transform', 'change', 'shift', 'alchemy', 'becom', 'metamorphos', 'shed', 'turn'],
  shadow: ['shadow', 'dark', 'darkness', 'night', 'hidden', 'shame', 'fear'],
  light: ['light', 'sun', 'dawn', 'glow', 'shine', 'bright', 'morning'],
  body: ['body', 'skin', 'blood', 'bone', 'hand', 'belly', 'spine', 'flesh', 'pulse'],
  home: ['home', 'house', 'door', 'window', 'kitchen', 'room', 'belong'],
  time: ['time', 'clock', 'hour', 'season', 'year', 'forever', 'moment'],
};

export const TYPE_SECTION_HINTS: Record<string, string[]> = {
  poem: ['poem', 'poems', 'part', 'section', 'interlude'],
  prompt: ['prompt', 'prompts', 'journal prompts', 'creative exploration'],
  ritual: ['ritual', 'practice', 'embodiment'],
  teaching: ['teaching', 'elemental teaching', 'orientation', 'meaning', 'concept'],
  reflection: ['reflection', 'emotional landscape', 'integration', 'exploration'],
  quote: ['front matter', 'opening', 'epigraph'],
  idea: ['concept', 'thesis / question', 'exploration'],
  fragment: ['interlude', 'fragments'],
  story: ['story', 'stories', 'development'],
  research: ['research', 'development', 'notes'],
  note: ['notes'],
};
