/* Brain Battle question bank.
   Each item: id, subject, topic, difficulty, prompt, options, answer (index),
   explain, limitMs. Scoring is recalculated from the submitted correctness
   flags, never from this file. */

export const SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Computer Science',
  'General Knowledge',
  'Logical Reasoning',
];

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];

const q = (id, subject, topic, difficulty, prompt, options, answer, explain, limitMs = 20000) => ({
  id,
  subject,
  topic,
  difficulty,
  prompt,
  options,
  answer,
  explain,
  limitMs,
});

export const QUESTIONS = [
  /* ---------------- Mathematics ---------------- */
  q('ma1', 'Mathematics', 'Arithmetic', 'beginner', 'What is 7 × 8?', ['54', '56', '58', '64'], 1, '7 × 8 = 56.'),
  q('ma2', 'Mathematics', 'Percentage', 'beginner', 'What is 15% of 200?', ['15', '20', '30', '35'], 2, '0.15 × 200 = 30.'),
  q('ma3', 'Mathematics', 'Roots', 'beginner', 'What is √144?', ['10', '11', '12', '14'], 2, '12 × 12 = 144.'),
  q('ma4', 'Mathematics', 'Algebra', 'intermediate', 'Solve 3x + 7 = 22.', ['3', '5', '7', '15'], 1, '3x = 15, so x = 5.'),
  q('ma5', 'Mathematics', 'Powers', 'beginner', 'What is 2¹⁰?', ['256', '512', '1024', '2048'], 2, '2¹⁰ = 1024.'),
  q('ma6', 'Mathematics', 'Logarithms', 'advanced', 'What is log₂(32)?', ['4', '5', '6', '8'], 1, '2⁵ = 32.'),
  q('ma7', 'Mathematics', 'Geometry', 'advanced', 'What is the sum of the interior angles of a hexagon?', ['540°', '630°', '720°', '900°'], 2, '(6 − 2) × 180° = 720°.'),
  q('ma8', 'Mathematics', 'Number theory', 'intermediate', 'What is gcd(48, 60)?', ['6', '8', '12', '24'], 2, '12 divides both, and nothing larger does.'),
  q('ma9', 'Mathematics', 'Probability', 'intermediate', 'A fair coin is flipped twice. What is the chance of two heads?', ['1/2', '1/3', '1/4', '1/8'], 2, '1/2 × 1/2 = 1/4.'),
  q('ma10', 'Mathematics', 'Calculus', 'expert', 'What is the derivative of x³ with respect to x?', ['x²', '3x²', '3x', 'x⁴/4'], 1, 'Power rule: d/dx xⁿ = n·xⁿ⁻¹.', 30000),

  /* ---------------- Physics ---------------- */
  q('ph1', 'Physics', 'Units', 'beginner', 'What is the SI unit of force?', ['joule', 'newton', 'pascal', 'watt'], 1, 'Force is measured in newtons (N).'),
  q('ph2', 'Physics', 'Newton’s second law', 'intermediate', 'A 2 kg mass accelerates at 3 m/s². What force acts on it?', ['1.5 N', '5 N', '6 N', '9 N'], 2, 'F = ma = 2 × 3 = 6 N.'),
  q('ph3', 'Physics', 'Light', 'beginner', 'The speed of light in vacuum is about…', ['3 × 10⁶ m/s', '3 × 10⁸ m/s', '3 × 10¹⁰ m/s', '3 × 10⁵ m/s'], 1, 'About 299,792,458 m/s, i.e. 3 × 10⁸ m/s.'),
  q('ph4', 'Physics', 'Gravity', 'beginner', 'On Earth, g near the surface is about…', ['1.6 m/s²', '9.8 m/s²', '19.6 m/s²', '98 m/s²'], 1, 'About 9.8 m/s² downward.'),
  q('ph5', 'Physics', 'Energy', 'intermediate', 'Which expression gives kinetic energy?', ['mv', '½mv²', 'mgh', 'Fd'], 1, 'Kinetic energy is ½mv².'),
  q('ph6', 'Physics', 'Electricity', 'intermediate', 'Ohm’s law states that…', ['V = IR', 'V = I/R', 'I = VR', 'R = VI'], 0, 'Voltage equals current times resistance.'),
  q('ph7', 'Physics', 'Circuits', 'intermediate', 'Two resistors of 2 Ω and 3 Ω in series total…', ['1.2 Ω', '5 Ω', '6 Ω', '2.5 Ω'], 1, 'Series resistances add: 2 + 3 = 5 Ω.'),
  q('ph8', 'Physics', 'Momentum', 'advanced', 'Momentum is defined as…', ['m/v', 'mv', '½mv²', 'ma'], 1, 'p = mv.'),
  q('ph9', 'Physics', 'Work', 'advanced', 'Work done by a constant force along its displacement is…', ['F/d', 'F × d', 'F + d', 'F − d'], 1, 'W = F·d when force and displacement align.'),
  q('ph10', 'Physics', 'Power', 'beginner', 'The SI unit of power is the…', ['newton', 'joule', 'watt', 'ampere'], 2, 'One watt equals one joule per second.'),

  /* ---------------- Chemistry ---------------- */
  q('ch1', 'Chemistry', 'Symbols', 'beginner', 'Which symbol represents gold?', ['Ag', 'Au', 'Gd', 'Go'], 1, 'Au, from the Latin aurum.'),
  q('ch2', 'Chemistry', 'Moles', 'intermediate', 'The molar mass of water (H₂O) is about…', ['16 g/mol', '18 g/mol', '20 g/mol', '22 g/mol'], 1, '2(1) + 16 = 18 g/mol.'),
  q('ch3', 'Chemistry', 'Acids', 'beginner', 'Pure water at 25 °C has a pH of…', ['5', '7', '9', '14'], 1, 'Neutral water has pH 7.'),
  q('ch4', 'Chemistry', 'Atoms', 'beginner', 'How many protons does a carbon atom have?', ['4', '6', '8', '12'], 1, 'Carbon’s atomic number is 6.'),
  q('ch5', 'Chemistry', 'Compounds', 'beginner', 'NaCl is commonly known as…', ['baking soda', 'table salt', 'chalk', 'bleach'], 1, 'Sodium chloride is table salt.'),
  q('ch6', 'Chemistry', 'Atmosphere', 'intermediate', 'Which gas is most abundant in Earth’s atmosphere?', ['oxygen', 'carbon dioxide', 'nitrogen', 'argon'], 2, 'Nitrogen makes up about 78%.'),
  q('ch7', 'Chemistry', 'Atoms', 'intermediate', 'The atomic number of oxygen is…', ['6', '7', '8', '16'], 2, 'Oxygen has 8 protons.'),
  q('ch8', 'Chemistry', 'Reactions', 'intermediate', 'An acid reacting with a base typically produces…', ['a gas only', 'salt and water', 'a metal', 'only heat'], 1, 'This is neutralisation: salt plus water.'),
  q('ch9', 'Chemistry', 'Moles', 'advanced', 'Avogadro’s number is approximately…', ['6.02 × 10²¹', '6.02 × 10²³', '3.14 × 10²³', '1.60 × 10⁻¹⁹'], 1, 'About 6.022 × 10²³ particles per mole.'),
  q('ch10', 'Chemistry', 'Particles', 'beginner', 'An electron carries…', ['positive charge', 'negative charge', 'no charge', 'variable charge'], 1, 'Electrons are negatively charged.'),

  /* ---------------- Computer Science ---------------- */
  q('cs1', 'Computer Science', 'Binary', 'beginner', 'What is binary 1010 in decimal?', ['8', '9', '10', '12'], 2, '8 + 2 = 10.'),
  q('cs2', 'Computer Science', 'Complexity', 'intermediate', 'Which complexity grows slowest for large n?', ['O(n²)', 'O(n log n)', 'O(n)', 'O(1)'], 3, 'Constant time does not grow with n.'),
  q('cs3', 'Computer Science', 'Web', 'beginner', 'HTML is best described as a…', ['programming language', 'markup language', 'database', 'protocol'], 1, 'HTML structures content; it is not a programming language.'),
  q('cs4', 'Computer Science', 'Recursion', 'intermediate', 'Every recursive function needs…', ['a loop', 'a base case', 'global state', 'two parameters'], 1, 'Without a base case it never terminates.'),
  q('cs5', 'Computer Science', 'Databases', 'beginner', 'Which SQL keyword retrieves rows?', ['GET', 'SELECT', 'FETCH', 'READ'], 1, 'SELECT reads rows.'),
  q('cs6', 'Computer Science', 'Bits', 'beginner', 'One byte is…', ['4 bits', '8 bits', '16 bits', '1024 bits'], 1, 'A byte is 8 bits.'),
  q('cs7', 'Computer Science', 'Data structures', 'intermediate', 'A stack removes elements in which order?', ['FIFO', 'LIFO', 'random', 'sorted'], 1, 'Last in, first out.'),
  q('cs8', 'Computer Science', 'Python', 'beginner', 'In Python, list indexes start at…', ['−1', '0', '1', 'the list length'], 1, 'Indexing is zero-based.'),
  q('cs9', 'Computer Science', 'HTTP', 'beginner', 'HTTP status 404 means…', ['server error', 'not found', 'forbidden', 'moved'], 1, 'The resource could not be found.'),
  q('cs10', 'Computer Science', 'Algorithms', 'advanced', 'Binary search on a sorted array runs in…', ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], 1, 'Each step halves the search space.'),

  /* ---------------- General Knowledge ---------------- */
  q('gk1', 'General Knowledge', 'Capitals', 'beginner', 'What is the capital of India?', ['Mumbai', 'New Delhi', 'Kolkata', 'Chennai'], 1, 'New Delhi is the capital.'),
  q('gk2', 'General Knowledge', 'Oceans', 'beginner', 'Which is the largest ocean?', ['Atlantic', 'Indian', 'Pacific', 'Arctic'], 2, 'The Pacific is the largest and deepest.'),
  q('gk3', 'General Knowledge', 'Currency', 'beginner', 'Japan’s currency is the…', ['won', 'yuan', 'yen', 'ringgit'], 2, 'Japan uses the yen.'),
  q('gk4', 'General Knowledge', 'Literature', 'intermediate', 'Who wrote Hamlet?', ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Leo Tolstoy'], 1, 'Shakespeare wrote Hamlet around 1600.'),
  q('gk5', 'General Knowledge', 'Geography', 'beginner', 'Which river flows through Cairo?', ['Tigris', 'Nile', 'Danube', 'Ganges'], 1, 'Cairo sits on the Nile.'),
  q('gk6', 'General Knowledge', 'Geography', 'beginner', 'How many continents are usually counted?', ['5', '6', '7', '8'], 2, 'Seven is the common convention.'),
  q('gk7', 'General Knowledge', 'Sport', 'beginner', 'How many rings are on the Olympic flag?', ['4', '5', '6', '7'], 1, 'Five interlocking rings.'),
  q('gk8', 'General Knowledge', 'Astronomy', 'beginner', 'Which is the largest planet in the Solar System?', ['Saturn', 'Neptune', 'Jupiter', 'Earth'], 2, 'Jupiter is the largest.'),
  q('gk9', 'General Knowledge', 'Science', 'beginner', 'At sea level, water boils at…', ['90 °C', '100 °C', '110 °C', '120 °C'], 1, '100 °C at standard pressure.'),
  q('gk10', 'General Knowledge', 'History', 'intermediate', 'The United Nations was founded in…', ['1919', '1939', '1945', '1955'], 2, 'The UN charter took effect in 1945.'),

  /* ---------------- Logical Reasoning ---------------- */
  q('lr1', 'Logical Reasoning', 'Sequences', 'beginner', 'What comes next: 2, 4, 8, 16, …?', ['18', '24', '32', '64'], 2, 'Each term doubles.'),
  q('lr2', 'Logical Reasoning', 'Syllogism', 'advanced', 'All roses are flowers. Some flowers fade fast. Therefore…', ['all roses fade fast', 'some roses fade fast', 'no rose fades fast', 'nothing certain follows'], 3, 'The premises never connect roses to fading.'),
  q('lr3', 'Logical Reasoning', 'Odd one out', 'beginner', 'Which number does not belong: 3, 5, 7, 9?', ['3', '5', '7', '9'], 3, '9 is not prime.'),
  q('lr4', 'Logical Reasoning', 'Ordering', 'intermediate', 'If A > B and B > C, then…', ['C > A', 'A > C', 'A = C', 'cannot tell'], 1, 'Inequalities chain: A > C.'),
  q('lr5', 'Logical Reasoning', 'Sequences', 'intermediate', 'What comes next: 1, 1, 2, 3, 5, 8, …?', ['10', '11', '13', '15'], 2, 'Fibonacci: 5 + 8 = 13.'),
  q('lr6', 'Logical Reasoning', 'Rate puzzle', 'expert', '5 machines make 5 widgets in 5 minutes. How long do 100 machines need for 100 widgets?', ['5 minutes', '20 minutes', '100 minutes', '500 minutes'], 0, 'Each machine makes one widget per 5 minutes, so 100 machines still need 5 minutes.', 40000),
  q('lr7', 'Logical Reasoning', 'Directions', 'intermediate', 'You face north, turn right twice, then turn around. You now face…', ['north', 'south', 'east', 'west'], 0, 'North → east → south, and a half turn brings you back to north.', 25000),
  q('lr8', 'Logical Reasoning', 'Deduction', 'advanced', 'No reptiles are mammals. A gecko is a reptile. Therefore a gecko…', ['is a mammal', 'is not a mammal', 'may be a mammal', 'is a bird'], 1, 'It follows directly from the first premise.'),
  q('lr9', 'Logical Reasoning', 'Counting', 'intermediate', 'A bat and ball cost ₹110 together. The bat costs ₹100 more than the ball. The ball costs…', ['₹5', '₹10', '₹15', '₹20'], 0, 'Ball = ₹5 and bat = ₹105, which is ₹100 more.'),
  q('lr10', 'Logical Reasoning', 'Patterns', 'advanced', 'Complete the pattern: AZ, BY, CX, …', ['DV', 'DW', 'DX', 'EV'], 1, 'First letters advance, second letters retreat: D and W.'),
];

export function pickQuestions({ subject = 'mixed', difficulty = 'mixed', count = 10 } = {}) {
  let pool = QUESTIONS.slice();
  if (subject !== 'mixed') pool = pool.filter((item) => item.subject === subject);
  if (difficulty !== 'mixed') pool = pool.filter((item) => item.difficulty === difficulty);

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
