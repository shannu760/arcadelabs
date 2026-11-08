/* Pure 2048 rules — no DOM, no storage, so it can be unit tested in Node. */

export const SIZE = 4;
export const WIN = 2048;

export function blankBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function cloneBoard(b) {
  return b.map((row) => [...row]);
}

export function emptyCells(b) {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!b[r][c]) out.push([r, c]);
  return out;
}

export function spawn(b) {
  const cells = emptyCells(b);
  if (!cells.length) return false;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  b[r][c] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

/** Compress + merge one line towards index 0. Each tile merges at most once. */
export function collapse(line) {
  const tiles = line.filter((v) => v !== 0);
  const out = [];
  let gained = 0;
  let merges = 0;

  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2;
      out.push(merged);
      gained += merged;
      merges += 1;
      i += 1;
    } else {
      out.push(tiles[i]);
    }
  }

  while (out.length < SIZE) out.push(0);
  return { line: out, gained, merges };
}

function readLine(b, index, dir) {
  const line = [];
  for (let i = 0; i < SIZE; i++) {
    if (dir === 'left') line.push(b[index][i]);
    if (dir === 'right') line.push(b[index][SIZE - 1 - i]);
    if (dir === 'up') line.push(b[i][index]);
    if (dir === 'down') line.push(b[SIZE - 1 - i][index]);
  }
  return line;
}

function writeLine(b, index, dir, line) {
  for (let i = 0; i < SIZE; i++) {
    if (dir === 'left') b[index][i] = line[i];
    if (dir === 'right') b[index][SIZE - 1 - i] = line[i];
    if (dir === 'up') b[i][index] = line[i];
    if (dir === 'down') b[SIZE - 1 - i][index] = line[i];
  }
}

export function move(board, dir) {
  const next = cloneBoard(board);
  let gained = 0;
  let merges = 0;

  for (let i = 0; i < SIZE; i++) {
    const res = collapse(readLine(board, i, dir));
    writeLine(next, i, dir, res.line);
    gained += res.gained;
    merges += res.merges;
  }

  const changed = JSON.stringify(next) !== JSON.stringify(board);
  return { board: next, gained, merges, changed };
}

export function canMove(b) {
  if (emptyCells(b).length) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = b[r][c];
      if (c + 1 < SIZE && b[r][c + 1] === v) return true;
      if (r + 1 < SIZE && b[r + 1][c] === v) return true;
    }
  }
  return false;
}

export function highestOn(b) {
  let max = 0;
  for (const row of b) for (const v of row) if (v > max) max = v;
  return max || 2;
}
