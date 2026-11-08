/* Pixel sprite engine — tiny character grids rendered as crisp SVG.
   "X" = main colour, "o" = shade, "." = empty. */

export const SPRITES = {
  heart: {
    c: ['#ff4d7e', '#a81f4d'],
    rows: [
      '.XX.XX.',
      'XXXXXXX',
      'XXXXXXX',
      '.XXXXX.',
      '..XXX..',
      '...X...',
    ],
  },
  star: {
    c: ['#ffcf3d', '#b98610'],
    rows: [
      '...X...',
      '..XXX..',
      'XXXXXXX',
      '.XXXXX.',
      '..XXX..',
      '.X...X.',
    ],
  },
  skull: {
    c: ['#eae7ff', '#7a729e'],
    rows: [
      '.XXXXX.',
      'XXXXXXX',
      'XooXooX',
      'XXXXXXX',
      'XoXoXoX',
      '.XXXXX.',
    ],
  },
  ghost: {
    c: ['#a06bff', '#4d2b96'],
    rows: [
      '..XXX..',
      '.XXXXX.',
      'XXXXXXX',
      'XoXXXoX',
      'XXXXXXX',
      'XXXXXXX',
      'X.X.X.X',
    ],
  },
  sword: {
    c: ['#38f2ff', '#1b7d8c'],
    rows: [
      '.....XX',
      '....XX.',
      '...XX..',
      '..XX...',
      '.XX....',
      'XX.....',
      'X......',
    ],
  },
  potion: {
    c: ['#3ddc6b', '#1a7a3a'],
    rows: [
      '..XXX..',
      '...X...',
      '..XXX..',
      '.XXXXX.',
      'XoooooX',
      'XoooooX',
      '.XXXXX.',
    ],
  },
  coin: {
    c: ['#ffcf3d', '#a8760c'],
    rows: [
      '.XXXXX.',
      'XoooooX',
      'XoXXXoX',
      'XoX.XoX',
      'XoXXXoX',
      'XoooooX',
      '.XXXXX.',
    ],
  },
  key: {
    c: ['#ffb03d', '#9c5d10'],
    rows: [
      '.XXXX..',
      'Xo..oX.',
      'Xo..oX.',
      '.XXXX..',
      '..XX...',
      '..XX...',
      '..XXX..',
    ],
  },
  mushroom: {
    c: ['#ff3f8e', '#8c1449'],
    rows: [
      '.XXXXX.',
      'XXXXXXX',
      'XoXXXoX',
      'XXXXXXX',
      '.ooooo.',
      '..ooo..',
      '..o.o..',
    ],
  },
  cherry: {
    c: ['#ff2d55', '#8f0b28'],
    rows: [
      '..X..X.',
      '..X.X..',
      '..X.X..',
      '.X...X.',
      'XoooXoo',
      'XoooXoo',
      '.XXX.XX',
    ],
  },
  gem: {
    c: ['#38f2ff', '#16758c'],
    rows: [
      '..XXX..',
      '.XoooX.',
      'XoXXXoX',
      'XoooooX',
      '.XoooX.',
      '..XoX..',
      '...X...',
    ],
  },
  crown: {
    c: ['#c8ff3d', '#6b8c0c'],
    rows: [
      'X..X..X',
      'Xo.X.oX',
      'XXXXXXX',
      'XoooooX',
      'XXXXXXX',
      '.XXXXX.',
    ],
  },
};

export const SPRITE_NAMES = Object.keys(SPRITES);

/** Render one sprite as an inline SVG string. */
export function spriteSVG(name) {
  const sprite = SPRITES[name];
  if (!sprite) return '';
  const rows = sprite.rows;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const [main, shade] = sprite.c;

  let rects = '';
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      const fill = ch === 'X' ? main : shade;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`;
      x += run;
    }
  }

  return `<svg class="sprite-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
}

/** Fill every element carrying a data-sprite attribute. */
export function mountSprites(root = document) {
  root.querySelectorAll('[data-sprite]').forEach((el) => {
    el.innerHTML = spriteSVG(el.dataset.sprite);
  });
}

mountSprites();
