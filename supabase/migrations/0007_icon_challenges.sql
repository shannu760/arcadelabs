-- STUDENT ICON — F4 learning seed: the first challenge set
--
-- Design notes
--   * ids are fixed literals so tests and links can address a challenge
--     without depending on insertion order.
--   * answer_key never leaves the server: the API omits it entirely and
--     scoring happens in icon_submit_challenge().
--   * every challenge names a skill, so passing one moves that skill's XP and,
--     every three XP, its level (capped at skills.max_level).
--   * 'choice' compares answer exactly against answer_key->>'answer';
--     'number' compares answer_key->>'value' (send it as a string or number,
--     it is string-compared); 'text' compares lowercased, trimmed text.

insert into public.learning_challenges
  (id, category_slug, tier, difficulty, title, objective, brief, tasks, kind, payload, answer_key, explanation, xp_reward, skill_slug)
values
  ('c0000000-0000-4000-8000-000000000001', 'computer-science', 1, 'basic',
   'Binary to decimal',
   'Read a binary literal the way a machine does.',
   'Every bit doubles the value to its left. Add the bits that are set.',
   '["Write out the place values: 8, 4, 2, 1", "Add the values of the bits that are 1"]',
   'number',
   '{"question": "What is 1011 in decimal?", "placeholder": "11"}',
   '{"value": "11"}',
   '1011 = 8 + 0 + 2 + 1 = 11.',
   10, 'programming'),

  ('c0000000-0000-4000-8000-000000000002', 'programming', 1, 'basic',
   'The off-by-one',
   'Spot the loop bound that skips the last element.',
   'An array has n items, indexed 0 to n-1. The loop must visit every one exactly once.',
   '["Count how many iterations each condition runs", "Check the last index"]',
   'choice',
   '{"question": "Which loop visits every element of an array of length n?", "options": ["i < n", "i <= n", "i > n"]}',
   '{"answer": "i < n"}',
   'Starting at 0, `i < n` runs for 0..n-1 — every element, no overflow.',
   10, 'programming'),

  ('c0000000-0000-4000-8000-000000000003', 'artificial-intelligence', 1, 'basic',
   'What a model learns from',
   'Separate training data from the thing you want it to do.',
   'A model can only be as good as the examples it is shown. Nothing else teaches it.',
   '["Ask what the model sees during training", "Ignore what you hope it learned"]',
   'choice',
   '{"question": "What decides what a model actually learns?", "options": ["The prompt you write", "The training examples it is shown", "The name of the model"]}',
   '{"answer": "The training examples it is shown"}',
   'Weights are fitted to the training examples; prompting steers behaviour, it does not add knowledge.',
   15, 'ai-dev'),

  ('c0000000-0000-4000-8000-000000000004', 'finance', 1, 'basic',
   'Gross margin',
   'Turn revenue and cost of goods into a margin percentage.',
   'Revenue is 200. Cost of goods sold is 120. Gross margin = (revenue - COGS) / revenue, as a percentage.',
   '["Subtract COGS from revenue", "Divide by revenue", "Multiply by 100"]',
   'number',
   '{"question": "Gross margin as a percentage, no percent sign:", "placeholder": "40"}',
   '{"value": "40"}',
   '(200 - 120) / 200 = 0.4, so 40%.',
   15, 'finance'),

  ('c0000000-0000-4000-8000-000000000005', 'finance', 1, 'basic',
   'Runway',
   'Work out how many months of cash are left.',
   'You hold 90,000 in cash and lose 15,000 a month. Ignore revenue for this one.',
   '["Runway is cash divided by monthly burn", "Round down — you cannot spend a fraction of a month you do not have"]',
   'number',
   '{"question": "Months of runway:", "placeholder": "6"}',
   '{"value": "6"}',
   '90,000 / 15,000 = 6 months. At month six you are out.',
   15, 'finance'),

  ('c0000000-0000-4000-8000-000000000006', 'economics', 1, 'basic',
   'The road not taken',
   'Name the cost of the option you gave up.',
   'You spend Saturday building a feature. The alternative was a paid freelance shift.',
   '["The cost is not money spent", "It is the value of the best alternative you skipped"]',
   'text',
   '{"question": "What is the value of the best alternative you gave up called?", "placeholder": "two words"}',
   '{"value": "opportunity cost"}',
   'Opportunity cost is the value of the best alternative forgone — it is invisible on a ledger, which is why it is missed.',
   10, 'strategy'),

  ('c0000000-0000-4000-8000-000000000007', 'communication', 1, 'basic',
   'Say it shorter',
   'Pick the sentence that survives a busy reader.',
   'A teammate has ten seconds. One of these sentences respects that.',
   '["Look for the subject and the verb", "Cut the throat-clearing"]',
   'choice',
   '{"question": "Which sentence is clearest?", "options": ["We cut the launch to one feature", "It was decided that, in light of timelines, the launch would potentially be reduced", "There are considerations being made regarding launch scope"]}',
   '{"answer": "We cut the launch to one feature"}',
   'Subject, verb, object, and the decision is unmistakable. The others hide who decided what.',
   10, 'storytelling'),

  ('c0000000-0000-4000-8000-000000000008', 'design', 1, 'basic',
   'Contrast first',
   'Fix the most common readability problem.',
   'Pale grey text on white at 12px is nearly unreadable on a laptop in daylight.',
   '["Contrast is about difference in luminance", "Test it squinting at arm''s length"]',
   'choice',
   '{"question": "What fixes unreadable body text most directly?", "options": ["Increase contrast between text and background", "Add a drop shadow to the text", "Underline every word"]}',
   '{"answer": "Increase contrast between text and background"}',
   'Contrast is the lever. Shadows and underlines add noise without making the glyphs easier to resolve.',
   10, 'design'),

  ('c0000000-0000-4000-8000-000000000009', 'marketing', 1, 'basic',
   'First channel',
   'Choose the cheapest way to learn whether anyone wants it.',
   'You have no audience, no budget for ads, and one week.',
   '["Ads test the message, not the problem", "Conversations test the problem"]',
   'choice',
   '{"question": "Best use of the week?", "options": ["Run a small ad test", "Talk to ten people who already have the problem", "Build the landing page first"]}',
   '{"answer": "Talk to ten people who already have the problem"}',
   'Ten conversations tell you whether the problem is real and what people call it. Ads only tell you whether your wording can buy attention.',
   15, 'marketing')
on conflict (id) do nothing;
