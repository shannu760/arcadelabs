/* Five-letter answer dictionary for Word Master.
   Guesses are restricted to this list so every accepted guess is a real word. */

export const WORDS = [
  'about', 'above', 'actor', 'acute', 'adapt', 'admit', 'adult', 'after', 'again', 'agent',
  'agree', 'ahead', 'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone', 'along',
  'aloud', 'alter', 'among', 'anger', 'angle', 'angry', 'ankle', 'apart', 'apple', 'apply',
  'arena', 'argue', 'arise', 'armor', 'aroma', 'array', 'arrow', 'aside', 'asset', 'atlas',
  'audio', 'audit', 'avoid', 'awake', 'award', 'aware', 'badge', 'baker', 'basic', 'basil',
  'batch', 'beach', 'beard', 'beast', 'began', 'begin', 'being', 'below', 'bench', 'berry',
  'birth', 'black', 'blade', 'blame', 'blank', 'blast', 'blaze', 'bleak', 'blend', 'bless',
  'blind', 'block', 'blood', 'bloom', 'blunt', 'blush', 'board', 'boast', 'bonus', 'boost',
  'booth', 'bound', 'brain', 'brake', 'brand', 'brass', 'brave', 'bread', 'break', 'breed',
  'brick', 'bride', 'brief', 'bring', 'brisk', 'broad', 'broke', 'brook', 'brown', 'brush',
  'build', 'bunch', 'burst', 'cabin', 'cable', 'candy', 'canoe', 'cargo', 'carry', 'carve',
  'catch', 'cause', 'cedar', 'chain', 'chair', 'chalk', 'charm', 'chart', 'chase', 'cheap',
  'cheat', 'check', 'cheek', 'cheer', 'chess', 'chest', 'chief', 'child', 'chill', 'chord',
  'chose', 'chunk', 'cider', 'civic', 'claim', 'clash', 'class', 'clean', 'clear', 'clerk',
  'click', 'cliff', 'climb', 'cling', 'cloak', 'clock', 'close', 'cloth', 'cloud', 'clown',
  'coach', 'coast', 'cobra', 'cocoa', 'colon', 'color', 'comet', 'coral', 'couch', 'cough',
  'could', 'count', 'court', 'cover', 'crack', 'craft', 'crane', 'crash', 'crate', 'crawl',
  'crazy', 'cream', 'creek', 'creep', 'crept', 'crest', 'crime', 'crisp', 'cross', 'crowd',
  'crown', 'crude', 'cruel', 'crumb', 'crush', 'crust', 'curve', 'cycle', 'daily', 'dairy',
  'dance', 'dated', 'dealt', 'death', 'debut', 'decay', 'decor', 'delay', 'delta', 'dense',
  'depth', 'derby', 'devil', 'diary', 'diner', 'dirty', 'ditch', 'diver', 'dizzy', 'dodge',
  'donor', 'doubt', 'dough', 'dozen', 'draft', 'drain', 'drama', 'drank', 'drawn', 'dread',
  'dream', 'dress', 'dried', 'drift', 'drill', 'drink', 'drive', 'drone', 'drove', 'drown',
  'dryer', 'dusty', 'dwarf', 'dwell', 'eager', 'eagle', 'early', 'earth', 'easel', 'eaten',
  'eight', 'elbow', 'elder', 'elect', 'elite', 'email', 'empty', 'enemy', 'enjoy', 'enter',
  'entry', 'equal', 'equip', 'erase', 'error', 'essay', 'ethic', 'evade', 'event', 'every',
  'exact', 'exist', 'extra', 'fable', 'faint', 'fairy', 'faith', 'false', 'fancy', 'fatal',
  'fault', 'favor', 'feast', 'fence', 'ferry', 'fetch', 'fever', 'fiber', 'field', 'fiery',
  'fifth', 'fifty', 'fight', 'final', 'finch', 'first', 'flame', 'flash', 'fleet', 'flesh',
  'flick', 'float', 'flock', 'flood', 'floor', 'flour', 'fluid', 'flush', 'flute', 'focus',
  'foggy', 'force', 'forge', 'forth', 'forty', 'forum', 'found', 'frame', 'fraud', 'fresh',
  'fried', 'frost', 'frown', 'froze', 'fruit', 'fudge', 'fully', 'funny', 'gauge', 'gecko',
  'ghost', 'giant', 'given', 'giver', 'glade', 'gland', 'glare', 'glass', 'gleam', 'glide',
  'globe', 'gloom', 'glory', 'gloss', 'glove', 'going', 'grace', 'grade', 'grain', 'grand',
  'grant', 'grape', 'graph', 'grasp', 'grass', 'grave', 'graze', 'great', 'greed', 'green',
  'greet', 'grief', 'grill', 'grind', 'groan', 'grope', 'gross', 'group', 'grove', 'growl',
  'grown', 'guard', 'guess', 'guest', 'guide', 'guild', 'guilt', 'habit', 'handy', 'happy',
  'harsh', 'haste', 'hatch', 'haunt', 'haven', 'heart', 'heavy', 'hedge', 'hello', 'hence',
  'herbs', 'hinge', 'hippo', 'hobby', 'honey', 'honor', 'horse', 'hotel', 'house', 'hover',
  'human', 'humid', 'humor', 'hurry', 'ideal', 'image', 'imply', 'index', 'inner', 'input',
  'irony', 'issue', 'ivory', 'jelly', 'jewel', 'joint', 'jolly', 'judge', 'juice', 'juicy',
  'jumbo', 'kebab', 'kneel', 'knife', 'knock', 'known', 'koala', 'label', 'labor', 'lance',
  'large', 'laser', 'latch', 'later', 'laugh', 'layer', 'leach', 'learn', 'lease', 'least',
  'leave', 'ledge', 'legal', 'lemon', 'level', 'lever', 'light', 'lilac', 'limit', 'linen',
  'liver', 'lobby', 'local', 'lodge', 'logic', 'loose', 'lorry', 'lover', 'lower', 'loyal',
  'lucky', 'lunar', 'lunch', 'lying', 'magic', 'major', 'maker', 'mango', 'maple', 'march',
  'marsh', 'match', 'maybe', 'mayor', 'medal', 'media', 'melon', 'mercy', 'merge', 'merit',
  'merry', 'metal', 'meter', 'micro', 'might', 'mimic', 'miner', 'minor', 'minty', 'minus',
  'mixed', 'model', 'money', 'month', 'moral', 'motor', 'mount', 'mouse', 'mouth', 'movie',
  'muddy', 'music', 'naive', 'naked', 'nasty', 'naval', 'needs', 'nerve', 'never', 'newly',
  'night', 'noble', 'noise', 'noisy', 'north', 'noted', 'novel', 'nurse', 'nylon', 'oasis',
  'ocean', 'offer', 'often', 'olive', 'onion', 'onset', 'opera', 'orbit', 'order', 'organ',
  'other', 'otter', 'ought', 'ounce', 'outer', 'owner', 'oxide', 'ozone', 'paint', 'panel',
  'panic', 'paper', 'party', 'pasta', 'patch', 'patio', 'pause', 'peace', 'peach', 'pearl',
  'pedal', 'penny', 'perch', 'phase', 'phone', 'photo', 'piano', 'picky', 'piece', 'pilot',
  'pinch', 'pitch', 'pizza', 'place', 'plaid', 'plain', 'plane', 'plant', 'plate', 'plaza',
  'plead', 'pluck', 'plumb', 'plume', 'point', 'polar', 'polka', 'porch', 'pouch', 'pound',
  'power', 'press', 'price', 'pride', 'prime', 'print', 'prior', 'prize', 'probe', 'prone',
  'proof', 'proud', 'prove', 'proxy', 'pulse', 'punch', 'pupil', 'puppy', 'purse', 'queen',
  'query', 'quest', 'queue', 'quick', 'quiet', 'quilt', 'quota', 'quote', 'radar', 'radio',
  'raise', 'rally', 'ranch', 'range', 'rapid', 'ratio', 'reach', 'react', 'ready', 'realm',
  'rebel', 'refer', 'reign', 'relax', 'relay', 'renew', 'repay', 'reply', 'rider', 'ridge',
  'rifle', 'right', 'rigid', 'rinse', 'ripen', 'risen', 'risky', 'rival', 'river', 'roast',
  'robin', 'robot', 'rocky', 'rogue', 'roomy', 'rough', 'round', 'route', 'royal', 'rugby',
  'ruler', 'rural', 'sadly', 'saint', 'salad', 'sauce', 'scale', 'scalp', 'scare', 'scarf',
  'scene', 'scent', 'scoop', 'scope', 'score', 'scout', 'scrap', 'screw', 'scrub', 'seize',
  'sense', 'serve', 'seven', 'shade', 'shaft', 'shake', 'shall', 'shame', 'shape', 'share',
  'shark', 'sharp', 'shave', 'sheep', 'sheet', 'shelf', 'shell', 'shift', 'shine', 'shiny',
  'shirt', 'shock', 'shoot', 'shore', 'short', 'shout', 'shove', 'shown', 'shrub', 'shrug',
  'sight', 'sigma', 'silly', 'since', 'siren', 'sixth', 'sixty', 'skate', 'skill', 'skirt',
  'skull', 'slate', 'sleep', 'sleet', 'slice', 'slide', 'slope', 'small', 'smart', 'smash',
  'smell', 'smile', 'smoke', 'snake', 'sniff', 'solar', 'solid', 'solve', 'sorry', 'sound',
  'south', 'space', 'spare', 'spark', 'speak', 'spear', 'speed', 'spell', 'spend', 'spice',
  'spike', 'spine', 'spite', 'split', 'spoke', 'spoon', 'sport', 'spray', 'spree', 'squad',
  'stack', 'staff', 'stage', 'stain', 'stair', 'stake', 'stamp', 'stand', 'stare', 'start',
  'state', 'steak', 'steam', 'steel', 'steep', 'steer', 'stern', 'stick', 'still', 'sting',
  'stock', 'stoke', 'stole', 'stone', 'stood', 'stool', 'store', 'storm', 'story', 'stove',
  'strap', 'straw', 'stray', 'strip', 'stuck', 'study', 'stuff', 'style', 'sugar', 'suite',
  'sunny', 'super', 'surge', 'swamp', 'sweat', 'sweep', 'sweet', 'swell', 'swept', 'swift',
  'swing', 'sword', 'table', 'tango', 'taste', 'teach', 'teeth', 'tempo', 'tense', 'tenth',
  'thank', 'theft', 'their', 'theme', 'there', 'these', 'thick', 'thief', 'thigh', 'thing',
  'think', 'third', 'thorn', 'those', 'three', 'threw', 'throw', 'thumb', 'tiger', 'tight',
  'timer', 'tired', 'title', 'toast', 'today', 'token', 'tonic', 'tooth', 'topic', 'torch',
  'total', 'touch', 'tough', 'towel', 'tower', 'toxic', 'trace', 'track', 'trade', 'trail',
  'train', 'trait', 'treat', 'trend', 'trial', 'tribe', 'trick', 'tried', 'truck', 'truly',
  'trunk', 'trust', 'truth', 'tulip', 'tutor', 'twice', 'twist', 'ultra', 'uncle', 'under',
  'union', 'unite', 'unity', 'until', 'upper', 'upset', 'urban', 'usage', 'usual', 'vague',
  'valid', 'value', 'vapor', 'vault', 'vegan', 'venue', 'verse', 'video', 'vigor', 'villa',
  'vinyl', 'viral', 'virus', 'visit', 'vital', 'vivid', 'vocal', 'voice', 'voter', 'wagon',
  'waist', 'waste', 'watch', 'water', 'weary', 'whale', 'wheat', 'wheel', 'where', 'which',
  'while', 'white', 'whole', 'whose', 'widow', 'width', 'witty', 'woman', 'world', 'worry',
  'worse', 'worst', 'worth', 'would', 'wound', 'woven', 'write', 'wrong', 'wrote', 'yacht',
  'young', 'youth', 'zebra', 'zesty',
];

const SET = new Set(WORDS);

export function isWord(word) {
  return SET.has(String(word || '').toLowerCase());
}

/** Stable 32-bit hash so the daily answer is the same for everyone that day. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dailyWord(dateKey) {
  return WORDS[hash(`word-master:${dateKey}`) % WORDS.length];
}

export function randomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}
