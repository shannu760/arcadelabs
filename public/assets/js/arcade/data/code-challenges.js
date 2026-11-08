/* Code Escape challenge bank.

   Five levels, eight challenges each. Every item is an original problem:
   `source: 'hackerrank'` marks the ones written in the style of a classic
   HackerRank track exercise (array sums, Caesar cipher, Davis' staircase …),
   `source: 'original'` marks puzzles written for this arcade. No problem text
   is copied; only the shape of the exercise is borrowed.

   Nothing here is executed. The player reads the snippet and answers, and
   scoring counts correctness only (see codeEscape in ../rules.js).

   Item shape:
     id        stable slug, also the primary key in Postgres
     level     1–5
     language  python | c | java
     kind      predict | debug | complete
     title     short label for the run header
     prompt    the question
     code      snippet, drawn with line numbers by the UI
     options   four answers
     answer    index of the correct option
     explain   shown after answering
     source    hackerrank | original
*/

export const LANGUAGES = ['python', 'c', 'java'];

export const LANGUAGE_LABEL = { python: 'PYTHON', c: 'C', java: 'JAVA' };

export const KIND_LABEL = {
  predict: 'PREDICT THE OUTPUT',
  debug: 'FIND THE BUG',
  complete: 'FILL THE BLANK',
};

/* `unlockAt` is how many challenges must be solved in the PREVIOUS level
   before this one opens. Level 1 is always open. */
export const LEVELS = [
  { level: 1, name: 'Warm-up', difficulty: 'basic', unlockAt: 0, blurb: 'Printing, arithmetic and one loop.' },
  { level: 2, name: 'Arrays', difficulty: 'basic', unlockAt: 5, blurb: 'Indexing, totals and array bounds.' },
  { level: 3, name: 'Strings & maps', difficulty: 'intermediate', unlockAt: 5, blurb: 'Characters, sets and equality.' },
  { level: 4, name: 'Algorithms', difficulty: 'intermediate', unlockAt: 5, blurb: 'Search, recursion and sorting.' },
  { level: 5, name: 'Boss tier', difficulty: 'advanced', unlockAt: 5, blurb: 'DP, bits and two pointers.' },
];

const DIFFICULTY = { 1: 'basic', 2: 'basic', 3: 'intermediate', 4: 'intermediate', 5: 'advanced' };

const c = (item) => ({ difficulty: DIFFICULTY[item.level], ...item });

export const CHALLENGES = [
  /* ---------------------------------------------------------------- level 1 */
  c({
    id: 'l1-add',
    level: 1,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Add two numbers',
    prompt: 'What does this print?',
    code: `a = 7
b = 5
print(a + b)`,
    options: ['12', '75', '35', '57'],
    answer: 0,
    explain: '7 + 5 = 12. Inside print(), a + b adds the two numbers; it does not glue the digits together.',
  }),
  c({
    id: 'l1-range-sum',
    level: 1,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Range sum',
    prompt: 'What is printed?',
    code: `total = 0
for i in range(1, 6):
    total += i
print(total)`,
    options: ['15', '10', '14', '21'],
    answer: 0,
    explain: 'range(1, 6) stops before 6, so the loop adds 1 + 2 + 3 + 4 + 5 = 15.',
  }),
  c({
    id: 'l1-digits',
    level: 1,
    language: 'c',
    kind: 'predict',
    source: 'original',
    title: 'Digit loop',
    prompt: 'What appears on one line?',
    code: `for (int i = 0; i < 3; i++)
    printf("%d", i);`,
    options: ['012', '123', '0123', '0 1 2'],
    answer: 0,
    explain: '%d prints the number with no separator, so 0, 1 and 2 run together as 012.',
  }),
  c({
    id: 'l1-integer-division',
    level: 1,
    language: 'java',
    kind: 'predict',
    source: 'original',
    title: 'Whole numbers',
    prompt: 'What does this print?',
    code: `int a = 7;
int b = 2;
System.out.println(a / b);`,
    options: ['3', '3.5', '4', '2'],
    answer: 0,
    explain: 'Both operands are int, so Java divides as integers and drops the remainder: 3, not 3.5.',
  }),
  c({
    id: 'l1-range-bug',
    level: 1,
    language: 'python',
    kind: 'debug',
    source: 'hackerrank',
    title: 'One short',
    prompt: 'The loop should print 1 through 5 inclusive. Which line must change?',
    code: `for i in range(1, 5):
    print(i)`,
    options: [
      'Line 1 — the range must end at 6',
      'Line 2 — it should print i + 1',
      'Both lines',
      'No change needed',
    ],
    answer: 0,
    explain: 'range(1, 5) yields 1, 2, 3, 4. The stop value is exclusive, so use range(1, 6).',
  }),
  c({
    id: 'l1-accumulate',
    level: 1,
    language: 'python',
    kind: 'complete',
    source: 'original',
    title: 'Fill the accumulator',
    prompt: 'Which line makes the loop total every number from 1 to 10?',
    code: `total = 0
for i in range(1, 11):
    ___
print(total)`,
    options: ['total += i', 'total = i', 'total += 1', 'i += total'],
    answer: 0,
    explain: 'total += i adds each value to the running total. Assigning would keep only the last value.',
  }),
  c({
    id: 'l1-length',
    level: 1,
    language: 'python',
    kind: 'predict',
    source: 'original',
    title: 'Length twice',
    prompt: 'What is printed?',
    code: `word = "arcade"
print(len(word) * 2)`,
    options: ['12', '6', 'arcadearcade', '14'],
    answer: 0,
    explain: 'len("arcade") is 6. Multiplying a number works normally: 6 × 2 = 12. Only strings repeat with *.',
  }),
  c({
    id: 'l1-last-digit',
    level: 1,
    language: 'java',
    kind: 'complete',
    source: 'original',
    title: 'Last digit',
    prompt: 'Which expression puts the last digit of n into lastDigit?',
    code: `int n = 10;
int lastDigit = ___ ;
System.out.println(lastDigit);`,
    options: ['n % 10', 'n / 10', 'n - 10', 'n % 100'],
    answer: 0,
    explain: 'n % 10 keeps the remainder after removing whole tens — the final digit.',
  }),

  /* ---------------------------------------------------------------- level 2 */
  c({
    id: 'l2-array-sum',
    level: 2,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Array sum',
    prompt: 'What is printed?',
    code: `nums = [5, 2, 8]
print(sum(nums))`,
    options: ['15', '10', '3', '528'],
    answer: 0,
    explain: 'sum() adds every element: 5 + 2 + 8 = 15.',
  }),
  c({
    id: 'l2-triplets',
    level: 2,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Compare the pairs',
    prompt: 'How many points does the first list score?',
    code: `a = [1, 2, 3]
b = [3, 2, 1]
score = 0
for x, y in zip(a, b):
    if x > y:
        score += 1
print(score)`,
    options: ['1', '2', '3', '0'],
    answer: 0,
    explain: 'Only the first pair wins (1 < 3 loses, 2 = 2 ties, 3 > 1 wins). Ties score nothing, so the total is 1.',
  }),
  c({
    id: 'l2-bounds-bug',
    level: 2,
    language: 'java',
    kind: 'debug',
    source: 'original',
    title: 'One past the end',
    prompt: 'This should sum all three elements. Which line breaks it?',
    code: `int[] a = {1, 2, 3};
int sum = 0;
for (int i = 0; i <= a.length; i++) {
    sum += a[i];
}
System.out.println(sum);`,
    options: [
      'Line 3 — i <= a.length runs one index too far',
      'Line 1 — the array is declared wrong',
      'Line 4 — it must be sum += i',
      'Line 6 — it should print a',
    ],
    answer: 0,
    explain: 'Valid indexes are 0, 1 and 2. i <= a.length lets i reach 3, and a[3] throws ArrayIndexOutOfBoundsException.',
  }),
  c({
    id: 'l2-index',
    level: 2,
    language: 'c',
    kind: 'predict',
    source: 'original',
    title: 'Fourth element',
    prompt: 'What does this print?',
    code: `int a[4] = {10, 20, 30, 40};
printf("%d", a[3]);`,
    options: ['40', '30', '10', '4'],
    answer: 0,
    explain: 'C arrays start at index 0, so a[3] is the fourth element: 40.',
  }),
  c({
    id: 'l2-minimum',
    level: 2,
    language: 'python',
    kind: 'complete',
    source: 'original',
    title: 'Track the minimum',
    prompt: 'Which condition keeps the smallest value in best?',
    code: `nums = [8, 3, 11]
best = nums[0]
for n in nums:
    if ___:
        best = n
print(best)`,
    options: ['n < best', 'n > best', 'n == best', 'best < n'],
    answer: 0,
    explain: 'Replace the best only when the new value is smaller. Otherwise the answer becomes the maximum.',
  }),
  c({
    id: 'l2-evens',
    level: 2,
    language: 'python',
    kind: 'predict',
    source: 'original',
    title: 'Count the evens',
    prompt: 'What is printed?',
    code: `nums = [2, 5, 8, 9, 10]
count = 0
for n in nums:
    if n % 2 == 0:
        count += 1
print(count)`,
    options: ['3', '2', '5', '4'],
    answer: 0,
    explain: '2, 8 and 10 are even, so the counter ends at 3.',
  }),
  c({
    id: 'l2-grid-shape',
    level: 2,
    language: 'java',
    kind: 'predict',
    source: 'original',
    title: 'Grid shape',
    prompt: 'What is printed?',
    code: `int[][] grid = {{1, 2}, {3, 4}, {5, 6}};
System.out.println(grid.length + ":" + grid[0].length);`,
    options: ['3:2', '2:3', '6', '3'],
    answer: 0,
    explain: 'grid.length counts rows (3) and grid[0].length counts the first row (2).',
  }),
  c({
    id: 'l2-reverse-bug',
    level: 2,
    language: 'python',
    kind: 'debug',
    source: 'hackerrank',
    title: 'Reverse out of range',
    prompt: 'It should print the list backwards, starting with 3. Which line is wrong?',
    code: `nums = [1, 2, 3]
for i in range(len(nums)):
    print(nums[len(nums) - i])`,
    options: [
      'Line 3 — the index must be len(nums) - 1 - i',
      'Line 1 — the list must be reversed first',
      'Line 2 — range must start at 1',
      'No bug: it prints 3, 2, 1',
    ],
    answer: 0,
    explain: 'On the first pass len(nums) - i is 3, which is past the last index. Subtracting one more gives 2, 1, 0.',
  }),

  /* ---------------------------------------------------------------- level 3 */
  c({
    id: 'l3-caesar',
    level: 3,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Shift a letter',
    prompt: 'What letter does this print?',
    code: `def shift(ch, k):
    return chr((ord(ch) - ord('A') + k) % 26 + ord('A'))

print(shift('Y', 3))`,
    options: ['B', 'Z', 'A', 'C'],
    answer: 0,
    explain: 'Y is the 25th letter (index 24). 24 + 3 wraps past Z back to index 1, which is B.',
  }),
  c({
    id: 'l3-sock-pairs',
    level: 3,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Pair them up',
    prompt: 'How many complete pairs are found?',
    code: `seen = set()
pairs = 0
for sock in [1, 2, 1, 2, 1]:
    if sock in seen:
        pairs += 1
        seen.remove(sock)
    else:
        seen.add(sock)
print(pairs)`,
    options: ['2', '1', '3', '0'],
    answer: 0,
    explain: 'The first 1 and 2 are stored, then matched into two pairs. The final 1 is left without a partner.',
  }),
  c({
    id: 'l3-palindrome-java',
    level: 3,
    language: 'java',
    kind: 'predict',
    source: 'original',
    title: 'Same both ways',
    prompt: 'What is printed?',
    code: `String s = "level";
String r = new StringBuilder(s).reverse().toString();
System.out.println(s.equals(r));`,
    options: ['true', 'false', 'level', '0'],
    answer: 0,
    explain: '"level" reads the same backwards, so equals() returns true.',
  }),
  c({
    id: 'l3-equals-bug',
    level: 3,
    language: 'java',
    kind: 'debug',
    source: 'original',
    title: 'Comparing text',
    prompt: 'This should print match. Which line is the bug?',
    code: `String a = new String("yes");
String b = "yes";
if (a == b) {
    System.out.println("match");
}`,
    options: [
      'Line 3 — it must be a.equals(b)',
      'Line 1 — new String is not allowed',
      'Line 2 — b must also use new String',
      'Line 4 — the text needs single quotes',
    ],
    answer: 0,
    explain: '== compares object references. Two separate String objects with the same text need .equals() to compare content.',
  }),
  c({
    id: 'l3-camel-words',
    level: 3,
    language: 'python',
    kind: 'complete',
    source: 'hackerrank',
    title: 'Count the words',
    prompt: 'Which test counts a new word in saveChangesInTheEditor?',
    code: `s = "saveChangesInTheEditor"
words = 1
for ch in s:
    if ___:
        words += 1
print(words)`,
    options: ['ch.isupper()', 'ch.islower()', 'ch == " "', 'ch.isdigit()'],
    answer: 0,
    explain: 'CamelCase marks each new word with a capital letter, so the five words yield 5.',
  }),
  c({
    id: 'l3-strlen',
    level: 3,
    language: 'c',
    kind: 'predict',
    source: 'original',
    title: 'String length',
    prompt: 'What is printed?',
    code: `char s[] = "code";
printf("%d", (int)strlen(s));`,
    options: ['4', '5', 'code', '0'],
    answer: 0,
    explain: 'strlen counts characters before the terminating null byte, so "code" is 4.',
  }),
  c({
    id: 'l3-slice',
    level: 3,
    language: 'python',
    kind: 'predict',
    source: 'original',
    title: 'Reverse, then slice',
    prompt: 'What is printed?',
    code: `s = "arcade"
print(s[::-1][:3])`,
    options: ['eda', 'arc', 'ade', 'edac'],
    answer: 0,
    explain: 's[::-1] reverses to "edacra", and [:3] keeps the first three characters: "eda".',
  }),
  c({
    id: 'l3-first-repeat',
    level: 3,
    language: 'python',
    kind: 'complete',
    source: 'original',
    title: 'Remember what you saw',
    prompt: 'Which line makes first_repeat return the first repeated character?',
    code: `def first_repeat(s):
    seen = set()
    for ch in s:
        if ch in seen:
            return ch
        ___
    return ""`,
    options: ['seen.add(ch)', 'seen.remove(ch)', 'ch += 1', 'seen = ch'],
    answer: 0,
    explain: 'Each character has to be recorded once so a later duplicate can be detected.',
  }),

  /* ---------------------------------------------------------------- level 4 */
  c({
    id: 'l4-binary-steps',
    level: 4,
    language: 'python',
    kind: 'predict',
    source: 'original',
    title: 'Halving the range',
    prompt: 'How many loop passes run before the range empties?',
    code: `lo, hi = 0, 15
steps = 0
while lo <= hi:
    mid = (lo + hi) // 2
    steps += 1
    lo = mid + 1
print(steps)`,
    options: ['5', '4', '6', '3'],
    answer: 0,
    explain: 'The range is cut to 8–15, 12–15, 14–15, 15, then empty: five passes in total.',
  }),
  c({
    id: 'l4-fib',
    level: 4,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Recursive Fibonacci',
    prompt: 'What is printed?',
    code: `def f(n):
    if n <= 1:
        return n
    return f(n - 1) + f(n - 2)

print(f(7))`,
    options: ['13', '8', '21', '12'],
    answer: 0,
    explain: 'The sequence is 0, 1, 1, 2, 3, 5, 8, 13 — the seventh term is 13.',
  }),
  c({
    id: 'l4-bubble-bug',
    level: 4,
    language: 'c',
    kind: 'debug',
    source: 'original',
    title: 'Backwards bubble',
    prompt: 'This should sort the array in ascending order. Which line is wrong?',
    code: `for (int i = 0; i < n - 1; i++)
    for (int j = 0; j < n - 1 - i; j++)
        if (a[j] < a[j + 1]) {
            int t = a[j];
            a[j] = a[j + 1];
            a[j + 1] = t;
        }`,
    options: [
      'Line 3 — the comparison is reversed',
      'Line 1 — the outer loop must run to n',
      'Line 4 — t must be a float',
      'No bug: it already sorts ascending',
    ],
    answer: 0,
    explain: 'Swapping when the left value is smaller pushes large values left, sorting descending. Use a[j] > a[j + 1].',
  }),
  c({
    id: 'l4-gcd-java',
    level: 4,
    language: 'java',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Euclid’s algorithm',
    prompt: 'What is printed?',
    code: `static int gcd(int a, int b) {
    while (b != 0) {
        int t = b;
        b = a % b;
        a = t;
    }
    return a;
}
System.out.println(gcd(48, 18));`,
    options: ['6', '3', '12', '18'],
    answer: 0,
    explain: '48 % 18 = 12, 18 % 12 = 6, 12 % 6 = 0, so the last non-zero value is 6.',
  }),
  c({
    id: 'l4-power',
    level: 4,
    language: 'python',
    kind: 'complete',
    source: 'original',
    title: 'Base case',
    prompt: 'Which base case makes power(2, 5) return 32?',
    code: `def power(base, exp):
    if ___:
        return 1
    return base * power(base, exp - 1)

print(power(2, 5))`,
    options: ['exp == 0', 'exp == 1', 'base == 0', 'exp < 0'],
    answer: 0,
    explain: 'Any number to the power 0 is 1, so the recursion stops when exp reaches 0.',
  }),
  c({
    id: 'l4-two-pointer',
    level: 4,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Pair up to nine',
    prompt: 'What does this print?',
    code: `a = [1, 3, 5, 8]
target = 9
i, j = 0, len(a) - 1
while i < j:
    s = a[i] + a[j]
    if s == target:
        break
    if s < target:
        i += 1
    else:
        j -= 1
print(i, j)`,
    options: ['0 3', '1 3', '0 2', '3 0'],
    answer: 0,
    explain: '1 + 8 is 9 on the very first pass, so the pointers never move: i is 0 and j is 3.',
  }),
  c({
    id: 'l4-primes-java',
    level: 4,
    language: 'java',
    kind: 'predict',
    source: 'original',
    title: 'Divisor count',
    prompt: 'What is printed?',
    code: `int n = 29;
int count = 0;
for (int i = 2; i * i <= n; i++)
    if (n % i == 0)
        count++;
System.out.println(count);`,
    options: ['0', '1', '2', '29'],
    answer: 0,
    explain: '29 is prime, so the loop finds no divisor at all and count stays 0.',
  }),
  c({
    id: 'l4-search-bug',
    level: 4,
    language: 'python',
    kind: 'debug',
    source: 'original',
    title: 'Searching the wrong half',
    prompt: 'This binary search never finds values bigger than the middle. Which line is wrong?',
    code: `def search(a, target):
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] == target:
            return mid
        if a[mid] < target:
            hi = mid
        else:
            lo = mid + 1
    return -1`,
    options: [
      'Line 8 — a larger target means lo = mid + 1',
      'Line 2 — hi must be len(a) - 1',
      'Line 10 — it must be lo = mid',
      'Line 5 — the equality test comes too early',
    ],
    answer: 0,
    explain: 'If a[mid] is too small the answer is to the RIGHT, so move lo. Moving hi searches the wrong half and misses it.',
  }),

  /* ---------------------------------------------------------------- level 5 */
  c({
    id: 'l5-staircase',
    level: 5,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Staircase ways',
    prompt: 'How many ways are there to climb 5 steps, one to three at a time?',
    code: `ways = [0] * 6
ways[0] = 1
for i in range(1, 6):
    ways[i] = sum(ways[max(0, i - 3):i])
print(ways[5])`,
    options: ['13', '7', '11', '8'],
    answer: 0,
    explain: 'Each step is the sum of the previous three: 1, 1, 2, 4, 7, 13. There are 13 routes to step 5.',
  }),
  c({
    id: 'l5-xor',
    level: 5,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'The lonely number',
    prompt: 'Every value appears twice except one. What is printed?',
    code: `nums = [4, 1, 2, 1, 2]
x = 0
for n in nums:
    x ^= n
print(x)`,
    options: ['4', '10', '0', '1'],
    answer: 0,
    explain: 'XOR cancels equal pairs (a ^ a = 0) and 0 ^ 4 leaves 4, the value without a partner.',
  }),
  c({
    id: 'l5-lcs',
    level: 5,
    language: 'python',
    kind: 'predict',
    source: 'hackerrank',
    title: 'Longest common subsequence',
    prompt: 'What length does the table end on?',
    code: `a, b = "ABCBDAB", "BDCABA"
dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
for i in range(1, len(a) + 1):
    for j in range(1, len(b) + 1):
        if a[i - 1] == b[j - 1]:
            dp[i][j] = dp[i - 1][j - 1] + 1
        else:
            dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
print(dp[-1][-1])`,
    options: ['4', '3', '5', '6'],
    answer: 0,
    explain: 'The longest shared subsequence is BCBA, so the final cell holds 4.',
  }),
  c({
    id: 'l5-complexity',
    level: 5,
    language: 'java',
    kind: 'predict',
    source: 'original',
    title: 'Counting the work',
    prompt: 'What is the time complexity of this nested loop?',
    code: `for (int i = 0; i < n; i++)
    for (int j = i; j < n; j++)
        work();`,
    options: ['O(n²)', 'O(n)', 'O(n log n)', 'O(2ⁿ)'],
    answer: 0,
    explain: 'The inner loop runs n + (n − 1) + … + 1 times, which is n(n + 1)/2 — quadratic.',
  }),
  c({
    id: 'l5-binary-bug',
    level: 5,
    language: 'c',
    kind: 'debug',
    source: 'original',
    title: 'The loop that never ends',
    prompt: 'This can hang forever when the key sits above the middle. Which line is wrong?',
    code: `int lo = 0, hi = n - 1;
while (lo < hi) {
    int mid = (lo + hi) / 2;
    if (a[mid] < key)
        lo = mid;
    else
        hi = mid;
}`,
    options: [
      'Line 5 — it must be lo = mid + 1',
      'Line 2 — the loop must use lo <= hi',
      'Line 3 — add one to the midpoint',
      'Line 7 — it must be hi = mid - 1',
    ],
    answer: 0,
    explain: 'Setting lo to mid leaves the range unchanged when the key is above it, so the loop never shrinks. Move past mid.',
  }),
  c({
    id: 'l5-lis',
    level: 5,
    language: 'python',
    kind: 'complete',
    source: 'hackerrank',
    title: 'Longest increasing run',
    prompt: 'Which transition builds the LIS table correctly?',
    code: `def lis(a):
    dp = [1] * len(a)
    for i in range(len(a)):
        for j in range(i):
            if a[j] < a[i]:
                dp[i] = ___
    return max(dp)`,
    options: ['max(dp[i], dp[j] + 1)', 'dp[j] + 1', 'dp[i] + 1', 'max(dp)'],
    answer: 0,
    explain: 'Extending the best subsequence ending at j is an option, not a certainty, so keep the larger of the two.',
  }),
  c({
    id: 'l5-bitcount',
    level: 5,
    language: 'java',
    kind: 'predict',
    source: 'original',
    title: 'Counting set bits',
    prompt: 'What is printed?',
    code: `System.out.println(Integer.bitCount(13));`,
    options: ['3', '2', '13', '4'],
    answer: 0,
    explain: '13 is 1101 in binary, which has three 1 bits.',
  }),
  c({
    id: 'l5-window',
    level: 5,
    language: 'python',
    kind: 'predict',
    source: 'original',
    title: 'Best window',
    prompt: 'What is the largest sum of three consecutive values?',
    code: `nums = [2, 1, 5, 1, 3, 2]
k = 3
window = sum(nums[:k])
best = window
for i in range(k, len(nums)):
    window += nums[i] - nums[i - k]
    best = max(best, window)
print(best)`,
    options: ['9', '8', '11', '7'],
    answer: 0,
    explain: 'The windows total 8, 7, 9 and 6. The third window (5 + 1 + 3) is the best at 9.',
  }),
];

export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((item) => [item.id, item]));

export const LEVEL_BY_NUMBER = Object.fromEntries(LEVELS.map((lvl) => [lvl.level, lvl]));

/* ------------------------------------------------------------------ */
/* bank queries. `items` defaults to the bundled bank, but the game passes  */
/* the live bank from code-bank.js so a database update changes the ladder. */
/* ------------------------------------------------------------------ */

/** Challenges in a level, optionally filtered by language. */
export function challengesFor(level, language = 'all', items = CHALLENGES) {
  return items.filter(
    (item) => item.level === level && (language === 'all' || item.language === language),
  );
}

/** How many challenges of `level` appear in the solved set. */
export function solvedInLevel(level, solvedIds, items = CHALLENGES) {
  const solved = solvedIds instanceof Set ? solvedIds : new Set(solvedIds || []);
  return challengesFor(level, 'all', items).filter((item) => solved.has(item.id)).length;
}

/** Highest level the player may open, given everything they have solved. */
export function unlockedLevel(solvedIds, items = CHALLENGES) {
  const solved = solvedIds instanceof Set ? solvedIds : new Set(solvedIds || []);
  let unlocked = 1;
  for (const lvl of LEVELS) {
    if (lvl.level === 1) continue;
    if (solvedInLevel(lvl.level - 1, solved, items) >= lvl.unlockAt) unlocked = lvl.level;
    else break;
  }
  return unlocked;
}

/** Everything the ladder needs to draw one level row. */
export function levelProgress(level, solvedIds, items = CHALLENGES) {
  const meta = LEVEL_BY_NUMBER[level];
  const solved = solvedInLevel(level, solvedIds, items);
  const total = challengesFor(level, 'all', items).length;
  const unlocked = level === 1 || solvedInLevel(level - 1, solvedIds, items) >= meta.unlockAt;
  return {
    ...meta,
    solved,
    total,
    unlocked,
    need: meta.unlockAt,
    previousSolved: level === 1 ? 0 : solvedInLevel(level - 1, solvedIds, items),
    cleared: total > 0 && solved >= total,
  };
}
