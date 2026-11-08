import { collapse, move, canMove, highestOn, blankBoard } from '../public/assets/js/arcade/games/2048-core.js';
import {
  levelFromXp,
  streakKp,
  speedBonus,
  scoreGuess,
  computeReward,
  levelUpKp,
  kolkataDate,
} from '../public/assets/js/arcade/rules.js';

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  }
};

/* ---------------- 2048 ---------------- */
eq('collapse plain pair', collapse([2, 2, 4, 4]), { line: [4, 8, 0, 0], gained: 12, merges: 2 });
eq('each tile merges once', collapse([2, 2, 2, 2]), { line: [4, 4, 0, 0], gained: 8, merges: 2 });
eq('no chain merge in one move', collapse([4, 4, 8, 0]), { line: [8, 8, 0, 0], gained: 8, merges: 1 });
eq('gap closes before merging', collapse([2, 0, 2, 4]), { line: [4, 4, 0, 0], gained: 4, merges: 1 });
eq('no merge when separated by another tile', collapse([4, 2, 2, 4]), { line: [4, 4, 4, 0], gained: 4, merges: 1 });
eq('single tile moves left', collapse([0, 0, 0, 2]), { line: [2, 0, 0, 0], gained: 0, merges: 0 });
eq('triple merges only once', collapse([2, 2, 2, 0]), { line: [4, 2, 0, 0], gained: 4, merges: 1 });

const rowBoard = [
  [2, 0, 0, 2],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];
eq('move right merges at the right edge', move(rowBoard, 'right').board[0], [0, 0, 0, 4]);
eq('move left merges at the left edge', move(rowBoard, 'left').board[0], [4, 0, 0, 0]);
eq('score from merge', move(rowBoard, 'right').gained, 4);

const colBoard = [
  [2, 0, 0, 0],
  [2, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];
eq('move up', move(colBoard, 'up').board.map((r) => r[0]), [4, 0, 0, 0]);
eq('move down', move(colBoard, 'down').board.map((r) => r[0]), [0, 0, 0, 4]);

const stuck = [
  [2, 4, 2, 4],
  [4, 2, 4, 2],
  [2, 4, 2, 4],
  [4, 2, 4, 2],
];
eq('unchanged move reports no change', move(stuck, 'left').changed, false);
eq('dead board detects no moves', canMove(stuck), false);

const nearlyStuck = [
  [2, 4, 2, 4],
  [4, 2, 4, 2],
  [2, 4, 2, 4],
  [4, 2, 4, 4],
];
eq('adjacent equal tile is still playable', canMove(nearlyStuck), true);
eq('blank board has moves', canMove(blankBoard()), true);
eq('highest tile', highestOn(stuck), 4);

/* ---------------- levels ---------------- */
eq('level at 0 xp', levelFromXp(0).level, 1);
eq('level at 99 xp', levelFromXp(99).level, 1);
eq('level at 100 xp', levelFromXp(100).level, 2);
eq('level at 300 xp', levelFromXp(300).level, 3);
eq('level at 1000 xp', levelFromXp(1000).level, 5);
eq('xp progress inside level', levelFromXp(150).intoLevel, 50);
eq('multi level jump', levelFromXp(1500).level, 6);
eq('level up reward 10', levelUpKp(7), 10);
eq('every fifth level 25 extra', levelUpKp(5), 35);

/* ---------------- streaks ---------------- */
eq('day 1 pays 0', streakKp(1), 0);
eq('day 2 pays 2', streakKp(2), 2);
eq('day 7 pays 15', streakKp(7), 15);
eq('day 8 restarts cycle', streakKp(8), 0);
eq('day 9 pays 2', streakKp(9), 2);
eq('day 14 pays 15', streakKp(14), 15);

/* ---------------- speed bonus ---------------- */
eq('within 25% = 20', speedBonus(1000, 20000), 20);
eq('within 50% = 15', speedBonus(9000, 20000), 15);
eq('within 75% = 10', speedBonus(14000, 20000), 10);
eq('last quarter = 5', speedBonus(19000, 20000), 5);

/* ---------------- word scoring ---------------- */
eq('exact word marks all correct', scoreGuess('crane', 'crane').marks, ['correct', 'correct', 'correct', 'correct', 'correct']);
eq('misplaced letter', scoreGuess('crane', 'nacre').score, 5 + 5 + 5 + 5 + 10);
eq('duplicate guess letter not double counted', scoreGuess('crane', 'eerie').score, 15);
eq('absent letters score zero', scoreGuess('crane', 'ghost').score, 0);

/* ---------------- reward minimums ---------------- */
eq('brain battle below minimum rejected', computeReward('brain-battle', { answers: [{ correct: true }] }).xp, 0);
eq(
  'typing needs accuracy-friendly minimum',
  computeReward('typing-ninja', { durationSec: 60, correctChars: 3, incorrectChars: 1 }).kp,
  0,
);
eq('2048 needs 10 moves', computeReward('2048-challenge', { score: 5000, highestTile: 512, moves: 3 }).xp, 0);
eq('unknown game throws', (() => { try { computeReward('nope', {}); return 'no'; } catch { return 'yes'; } })(), 'yes');
eq('geo perfect kp', computeReward('geo-genius', { answers: Array(5).fill({ correct: true }) }).kp, 4);
eq('sudoku hard no hints', computeReward('sudoku-master', { solved: true, difficulty: 'hard', hints: 0 }).score, 200);
eq('startup tycoon sub-70 kp', computeReward('startup-tycoon', { completed: true, profitability: 20, satisfaction: 10, resources: 10, decisions: 10 }).kp, 0);
eq('kolkata date format', /^\d{4}-\d{2}-\d{2}$/.test(kolkataDate()), true);

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
