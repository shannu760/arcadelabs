/* Sudoku generation with guaranteed unique solutions.
   0 means empty. Boards are flat arrays of 81 cells, row-major. */

export const SIZE = 9;
export const HOLES = { easy: 40, medium: 48, hard: 54 };

export function emptyBoard() {
  return new Array(81).fill(0);
}

export function cloneBoard(board) {
  return board.slice();
}

function candidates(board, index) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const used = new Set();
  for (let i = 0; i < 9; i++) {
    used.add(board[row * 9 + i]);
    used.add(board[i * 9 + col]);
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) used.add(board[r * 9 + c]);
  const out = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Fill an empty board with a random complete solution. */
function fill(board) {
  const index = board.indexOf(0);
  if (index === -1) return true;
  for (const value of shuffle(candidates(board, index))) {
    board[index] = value;
    if (fill(board)) return true;
    board[index] = 0;
  }
  return false;
}

/** Count solutions, stopping as soon as `limit` is reached. */
export function countSolutions(board, limit = 2) {
  const work = board.slice();
  let found = 0;

  const recurse = () => {
    if (found >= limit) return;
    // choose the most constrained empty cell to keep the search small
    let best = -1;
    let bestOptions = null;
    for (let i = 0; i < 81; i++) {
      if (work[i] !== 0) continue;
      const options = candidates(work, i);
      if (!options.length) return;
      if (!bestOptions || options.length < bestOptions.length) {
        best = i;
        bestOptions = options;
        if (options.length === 1) break;
      }
    }
    if (best === -1) {
      found += 1;
      return;
    }
    for (const value of bestOptions) {
      work[best] = value;
      recurse();
      work[best] = 0;
      if (found >= limit) return;
    }
  };

  recurse();
  return found;
}

export function generate(difficulty = 'easy') {
  const holes = HOLES[difficulty] || HOLES.easy;
  const solution = emptyBoard();
  fill(solution);

  const puzzle = solution.slice();
  const order = shuffle([...Array(81).keys()]);
  let removed = 0;

  for (const index of order) {
    if (removed >= holes) break;
    const backup = puzzle[index];
    puzzle[index] = 0;
    // keep the puzzle solvable and unambiguous; the solution itself proves solvability
    if (countSolutions(puzzle, 2) === 1) removed += 1;
    else puzzle[index] = backup;
  }

  return { puzzle, solution, holes: removed, difficulty };
}

export function conflicts(board, index, value) {
  if (!value) return false;
  const row = Math.floor(index / 9);
  const col = index % 9;
  for (let i = 0; i < 9; i++) {
    if (i !== col && board[row * 9 + i] === value) return true;
    if (i !== row && board[i * 9 + col] === value) return true;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      const i = r * 9 + c;
      if (i !== index && board[i] === value) return true;
    }
  }
  return false;
}

export function isComplete(board) {
  return board.every((v) => v >= 1 && v <= 9) && board.every((v, i) => !conflicts(board, i, v));
}
