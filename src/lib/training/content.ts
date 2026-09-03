import type { TrainingModule } from './types'

/**
 * Bumped whenever the course content changes materially. Stamped onto a
 * trainee record at sign-off so an old completion still says which version
 * of the course was actually signed.
 */
export const CONTENT_VERSION = '2026-09-03'

/** Every quiz question in a module must be answered correctly to pass it. */
export const PASS_REQUIRES_FULL_MARKS = true

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'welcome',
    icon: '👋',
    title: 'Welcome to The Cafe',
    tag: 'Flip cards',
    blurb: 'Our story, your role and the Cafe mindset.',
    slides: [
      {
        type: 'content',
        kicker: 'Our story',
        blocks: [
          { kind: 'stat', label: 'Established', value: '2010' },
          {
            kind: 'para',
            text: [
              'The Cafe is a community café that prides itself on being ',
              { hl: 'fast, funky and fresh' },
              '.',
            ],
          },
          {
            kind: 'para',
            text: [
              'Founder ',
              { strong: 'Cafe Founder' },
              " has spent 16 years building a café loved by its community — and you're now part of the magic that makes it happen.",
            ],
          },
        ],
      },
      {
        type: 'reveal',
        kicker: 'More than coffee',
        heading: '“Cafe” is a feeling, not just a place',
        intro: [
          'A warm, energetic space where ',
          { strong: 'customers feel welcome' },
          ' and ',
          { strong: 'regulars feel remembered' },
          '.',
        ],
        items: [
          {
            icon: '🏃',
            title: 'The regular',
            body: 'In every day — remembering their name and order keeps them coming back.',
          },
          {
            icon: '⏱️',
            title: 'The commuter',
            body: 'Rushing to work — fast and friendly makes their morning.',
          },
          {
            icon: '🍽️',
            title: 'The visitor',
            body: 'Here for a good meal, a chat and a friendly face.',
          },
        ],
      },
      {
        type: 'content',
        kicker: 'Your role',
        blocks: [
          { kind: 'heading', text: 'Every small act matters' },
          {
            kind: 'para',
            text: [
              "Whatever you're doing — coffee, food, service, tables or behind the scenes — ",
              { hl: 'your role matters' },
              '. Every smile, every conversation and every coffee helps create the Cafe experience.',
            ],
          },
          {
            kind: 'para',
            text: [
              "You don't need to know everything on day one — just ",
              { strong: 'learn, ask questions, and take pride in your work' },
              '.',
            ],
          },
        ],
      },
      {
        type: 'content',
        kicker: 'What we care about',
        blocks: [
          { kind: 'heading', text: 'Our priorities, in order' },
          {
            kind: 'rank',
            items: [
              { marker: '1', title: 'Customers', note: 'first — always the priority' },
              { marker: '2', title: 'Coffee', note: "second — what we're known for" },
              { marker: '3', title: 'Food', note: 'third — fresh, done right' },
              { marker: '∞', title: 'Efficiency & proactivity', note: 'always — underpins it all' },
            ],
          },
        ],
      },
      {
        type: 'reveal',
        kicker: 'The Cafe mindset',
        quote: '“See It, Own It, Act.”',
        emphasised: true,
        items: [
          {
            icon: '',
            title: 'See It',
            body: "Notice what's happening: the customer who needs a hand, the table to clear, the thing out of place.",
          },
          {
            icon: '',
            title: 'Own It',
            body: "Treat it like it's yours. Don't wait to be asked or assume someone else will.",
          },
          {
            icon: '',
            title: 'Act',
            body: 'Do something about it. Step in, follow through, make it right.',
          },
        ],
      },
    ],
    quiz: [
      {
        question: 'What year was The Cafe established?',
        answers: ['2016', '2010', '2019'],
        correct: 1,
      },
      {
        question: 'Who founded The Cafe?',
        answers: ['Cafe Founder', 'Nathan Norris', 'Nico Bianchi'],
        correct: 0,
      },
      {
        question: 'What order do our priorities come in?',
        answers: [
          'Customers, coffee, food',
          'Coffee, customers, food',
          'Food, coffee, customers',
        ],
        correct: 0,
      },
    ],
  },

  {
    id: 'customers',
    icon: '🤝',
    title: 'Customers First',
    tag: 'Commitment checklist',
    blurb: 'Be the nicest person they meet all day.',
    slides: [
      {
        type: 'content',
        kicker: 'Why it matters',
        blocks: [
          { kind: 'heading', text: "Customers are the reason we're here" },
          {
            kind: 'para',
            text: [
              'Every person who walks in needs to be ',
              { strong: 'noticed, acknowledged and valued' },
              ' — greet them on arrival, say goodbye when they leave.',
            ],
          },
          {
            kind: 'para',
            text: [
              'The bar we set: ',
              { hl: 'be the nicest person that customer has met all day.' },
              ' Not polite. Not fine. The nicest. Customers can get coffee anywhere — they come back for how we make them feel.',
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'In the moment',
        heading: 'Service vs focus',
        intro: [
          'Service is handing someone their order. ',
          { strong: 'Focus' },
          ' is engaging with them, remembering them, and matching what they need with what we offer. We do focus.',
        ],
        groups: [
          {
            prompt:
              "You're chatting with a coworker when a customer walks up to the counter. What do you do?",
            options: [
              {
                text: 'Finish your conversation first, then serve them',
                correct: false,
                feedback:
                  "Team chats pause the moment a customer is near. Nobody at Cafe should ever feel like they're waiting.",
              },
              {
                text: 'Pause, make eye contact and greet them warmly',
                correct: true,
                feedback: 'Exactly. The customer in front of you is always the priority.',
              },
            ],
          },
        ],
      },
      {
        type: 'content',
        kicker: 'Anticipation',
        blocks: [
          { kind: 'heading', text: 'Know your regulars' },
          {
            kind: 'para',
            text: [
              'If you know their order, get it moving ',
              { strong: 'before they reach the counter' },
              '. There’s no better feeling for a customer than being known — and no better compliment than ',
              { hl: '“wow, that was quick!”' },
            ],
          },
        ],
      },
      {
        type: 'checklist',
        kicker: 'Your commitments',
        heading: "Tick each one you'll bring every shift",
        items: [
          'Greet every customer, every time, with warmth',
          'Pause team chats when customers are nearby',
          'Make eye contact when serving',
          'Learn regulars’ names and orders, and anticipate them',
          'Be mindful of children, pets, prams and older customers',
          'Make people feel welcome, even when it’s busy',
        ],
      },
      {
        type: 'content',
        kicker: 'Remember',
        blocks: [
          {
            kind: 'oneline',
            text: 'Be the nicest person they meet today, and never let anyone feel like they’re waiting.',
          },
        ],
      },
    ],
    quiz: [
      {
        question: 'What’s the bar we set for every customer?',
        answers: [
          'Be polite and efficient',
          'Be the nicest person they’ve met all day',
          'Serve them within two minutes',
        ],
        correct: 1,
      },
      {
        question: 'What is customer “focus”?',
        answers: [
          'Handing over the order quickly',
          'Engaging, remembering and matching their needs',
          'Keeping the queue short',
        ],
        correct: 1,
      },
      {
        question: 'A customer is waiting and trying to get your attention. They become…',
        answers: [
          'The priority, right now',
          'Someone to get to after your task',
          'The next person in line',
        ],
        correct: 0,
      },
    ],
  },

  {
    id: 'neverno',
    icon: '🙌',
    title: 'Never a Flat “No”',
    tag: 'Pick the response',
    blurb: 'If the answer is no, offer a better yes.',
    slides: [
      {
        type: 'content',
        kicker: 'The rule',
        blocks: [
          { kind: 'heading', text: 'We don’t do flat no’s' },
          {
            kind: 'para',
            text: [
              '“No” ends a conversation. At Cafe, we always offer a ',
              { hl: 'path to “yes.”' },
              ' If we don’t have exactly what a customer asks for, our job is to help them find something they’ll love instead.',
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'Same café, different result',
        heading: 'Choose the Cafe response',
        groups: [
          {
            prompt: 'Customer: “Do you do eggs benedict?” — we don’t. What do you say?',
            options: [
              {
                text: '“Nooo…” (awkward pause, vague gesture at the cabinet)',
                correct: false,
                feedback:
                  'That’s a flat no — the customer walks out and spends their money somewhere else.',
              },
              {
                text: '“Not benedict, but our ham & cheese toastie is a favourite, and the quiche just came out — coffee with that?”',
                correct: true,
                feedback: 'That’s the Cafe way. They stay, eat, love it, and come back tomorrow.',
              },
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'Always suggest',
        heading: 'A little extra',
        intro:
          '“Would you like a coffee with that?” and “anything to nibble on?” aren’t pushy — they’re helpful, and customers appreciate them.',
        groups: [
          {
            prompt: 'You’ve just taken a food order. What do you add?',
            options: [
              {
                text: 'Nothing — just put it through',
                correct: false,
                feedback: 'A gentle suggestion is helpful, not pushy. Always offer.',
              },
              {
                text: '“Would you like a coffee with that?”',
                correct: true,
                feedback: 'Perfect — genuine, helpful suggestion. That’s the Cafe way.',
              },
            ],
          },
        ],
      },
      {
        type: 'content',
        kicker: 'Remember',
        blocks: [{ kind: 'oneline', text: 'If the answer is no, offer a better yes.' }],
      },
    ],
    quiz: [
      {
        question: 'What does a flat “no” do?',
        answers: [
          'Keeps things simple',
          'Ends the conversation and loses the customer',
          'Saves time in a rush',
        ],
        correct: 1,
      },
      {
        question: 'When we don’t have what a customer asks for, we…',
        answers: [
          'Apologise and move on',
          'Offer something they’ll love instead',
          'Send them to a nearby café',
        ],
        correct: 1,
      },
    ],
  },

  {
    id: 'coffee',
    icon: '☕',
    title: 'Coffee',
    tag: 'Match the role',
    blurb: 'Great coffee, made right now.',
    slides: [
      {
        type: 'content',
        kicker: 'What we’re known for',
        blocks: [
          { kind: 'heading', text: 'Coffee is a massive part of Cafe' },
          {
            kind: 'para',
            text: 'Customers expect their coffee made well, handled carefully and delivered quickly. It’s our reputation in a cup.',
          },
        ],
      },
      {
        type: 'reveal',
        kicker: 'The two golden rules',
        intro: 'These sit above everything else.',
        items: [
          {
            icon: '✅',
            title: 'Quality',
            body: 'If in doubt, throw it out and make it again. No excuses. One bad coffee is one lost customer.',
          },
          {
            icon: '⚡',
            title: 'Speed',
            body: 'When a coffee is ordered, it gets made now. Aim to hear “gee, that was quick!” If you never hear it, you’re not going fast enough.',
          },
        ],
      },
      {
        type: 'content',
        kicker: 'The coffee station',
        blocks: [
          { kind: 'heading', text: 'Who does what' },
          {
            kind: 'para',
            text: 'Three roles keep the coffee station flowing. On any shift you might do any of them — here’s what each one does.',
          },
          {
            kind: 'roles',
            items: [
              {
                icon: '☕',
                title: 'Barista',
                body: 'Pulls the shots — makes coffee that’s fresh and made promptly. The engine of the station.',
              },
              {
                icon: '🥛',
                title: 'Pourer',
                body: [
                  'Steams the milk and prepares the coffees, and acts as the ',
                  { strong: 'eyes, ears and mouthpiece' },
                  ' of the station — calling orders and keeping things moving.',
                ],
              },
              {
                icon: '🏃',
                title: 'Runner',
                body: 'When they hear “coffee up”, they get that coffee into the customer’s hands quickly and safely.',
              },
            ],
          },
        ],
      },
      {
        type: 'sort',
        kicker: 'Check yourself',
        heading: 'Match each job to the role',
        intro: 'Now that you’ve met the three roles, tap the role each job belongs to.',
        buckets: ['Barista', 'Pourer', 'Runner'],
        items: [
          { text: 'Make coffee that’s fresh and made promptly', bucket: 0 },
          {
            text: 'Steam milk, prep coffees, be the eyes, ears and mouthpiece of the station',
            bucket: 1,
          },
          { text: 'On “coffee up”, get it into the customer’s hands quickly', bucket: 2 },
        ],
      },
      {
        type: 'content',
        kicker: 'Remember',
        blocks: [
          { kind: 'oneline', text: 'Great coffee, made right now. If in doubt, throw it out.' },
        ],
      },
    ],
    quiz: [
      {
        question: 'What are the two golden rules of coffee?',
        answers: ['Quality and speed', 'Foam and temperature', 'Beans and milk'],
        correct: 0,
      },
      {
        question: 'You’re not proud of a coffee you just made. You…',
        answers: [
          'Send it — it’s probably fine',
          'Throw it out and remake it, without being asked',
          'Ask a manager first',
        ],
        correct: 1,
      },
      {
        question: 'What should you aim to hear when you hand over a coffee?',
        answers: ['“Thanks”', '“Gee, that was quick!”', '“Smells great”'],
        correct: 1,
      },
    ],
  },

  {
    id: 'etiquette',
    icon: '🔥',
    title: 'Coffee Etiquette',
    tag: 'Safety scenarios',
    blurb: 'Hot drinks demand cool heads.',
    slides: [
      {
        type: 'content',
        kicker: 'Handle with care',
        blocks: [
          { kind: 'heading', text: 'Hot drinks, cool heads' },
          {
            kind: 'para',
            text: [
              'There’s no room for cutting corners with coffee. Hot drinks can be dangerous, so every cup is ',
              { hl: 'carried, placed and served with care.' },
            ],
          },
        ],
      },
      {
        type: 'reveal',
        kicker: 'Think ahead',
        heading: 'Before it leaves your hands, ask…',
        items: [
          {
            icon: '👶',
            title: 'Could this be going near a child?',
            body: 'Never place a hot drink directly in front of a child. Communicate with the adult and set it further away.',
          },
          {
            icon: '♨️',
            title: 'Is this too hot to hold comfortably?',
            body: 'If it may be too hot to hold for long, use a cup sleeve. Small actions like this show care and prevent accidents.',
          },
          {
            icon: '⚖️',
            title: 'Is this tray balanced and safe to carry?',
            body: 'Place heavier drinks in the centre of the tray, in line with your forearm. Before lifting a cup off, check the tray won’t tip.',
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'On the floor',
        heading: 'What’s the Cafe move?',
        groups: [
          {
            prompt:
              'A child is sitting on a parent’s lap and you’re bringing a very hot latte. What do you do?',
            options: [
              {
                text: 'Place it on the table right in front of them',
                correct: false,
                feedback:
                  'Never place a hot drink in front of a child. Set it further away and let the adult know.',
              },
              {
                text: '“I’ll pop this a little further from the little one — it’s very hot.” Then place it safely.',
                correct: true,
                feedback: 'Exactly right. Customers notice this and appreciate it.',
              },
            ],
          },
          {
            prompt: 'Before lifting a cup off a loaded tray, what do you do?',
            options: [
              {
                text: 'Just grab it — you’ve got it',
                correct: false,
                feedback:
                  'Ask first: “will the tray tip if I take this off?” If yes, pause and adjust.',
              },
              {
                text: 'Check: “will the tray tip if I take this off?” — adjust if needed',
                correct: true,
                feedback: 'Perfect. Think about balance every time.',
              },
            ],
          },
        ],
      },
      {
        type: 'content',
        kicker: 'Remember',
        blocks: [
          { kind: 'oneline', text: 'Hot drinks demand cool heads. Think ahead, every single cup.' },
        ],
      },
    ],
    quiz: [
      {
        question: 'A drink is too hot to hold comfortably. You…',
        answers: ['Serve it quickly before it burns', 'Use a cup sleeve', 'Add cold water'],
        correct: 1,
      },
      {
        question: 'Where should a hot drink never be placed?',
        answers: ['On a tray', 'Directly in front of a child', 'Near the window'],
        correct: 1,
      },
      {
        question: 'Heavier drinks on a tray go…',
        answers: [
          'Wherever they fit',
          'In the centre, in line with your forearm',
          'At the edge for easy reach',
        ],
        correct: 1,
      },
    ],
  },

  {
    id: 'food',
    icon: '🍽️',
    title: 'Food',
    tag: 'Spot the fix',
    blurb: 'Right order, right table, handled safely.',
    slides: [
      {
        type: 'content',
        kicker: 'The goal',
        blocks: [
          { kind: 'heading', text: 'Right order, right table' },
          {
            kind: 'para',
            text: [
              'Food is delivered ',
              { strong: 'safely, quickly and correctly' },
              ' — the right order, to the right table, in the best possible condition, using safe food handling at all times.',
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'Presentation',
        heading: 'Every plate is your responsibility',
        intro:
          'Every plate must look good before it leaves the pass (the counter where the kitchen hands finished food to the floor) — that’s everyone’s job, not just the kitchen’s.',
        groups: [
          {
            prompt: 'A plate comes up to the pass looking messy. What do you do?',
            options: [
              {
                text: 'Take it out as-is — the customer’s waiting',
                correct: false,
                feedback: 'If a plate doesn’t look right, fix it before the customer sees it.',
              },
              {
                text: 'Fix the presentation before it goes out',
                correct: true,
                feedback: 'Yes — sort it at the pass, before the customer ever sees it.',
              },
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'Hygiene',
        heading: 'Safe hands',
        groups: [
          {
            prompt:
              'You’ve just cleared some dirty dishes and a toastie is ready to plate. What first?',
            options: [
              {
                text: 'Plate it quickly with your hands',
                correct: false,
                feedback:
                  'Never touch ready-to-eat food with bare hands — and wash up after handling dishes or bins.',
              },
              {
                text: 'Wash your hands, then use tongs or gloves',
                correct: true,
                feedback:
                  'Correct. Wash after dishes/bins, and never bare-hand ready-to-eat food.',
              },
            ],
          },
        ],
      },
      {
        type: 'content',
        kicker: 'What great food service looks like',
        blocks: [
          {
            kind: 'list',
            items: [
              'Check table numbers before leaving the pass',
              'Check presentation before the plate goes out',
              'Carry plates safely',
              'Never touch ready-to-eat food with bare hands',
              'Communicate clearly with kitchen and floor',
              'Bring dishes back on the return trip',
            ],
          },
          { kind: 'oneline', text: 'Right order, right table, looking great, handled safely.' },
        ],
      },
    ],
    quiz: [
      {
        question: 'Whose job is it to make sure a plate looks good?',
        answers: [
          'Only the kitchen’s',
          'Everyone’s — fix it before it leaves the pass',
          'The manager’s',
        ],
        correct: 1,
      },
      {
        question: 'Touching ready-to-eat food with bare hands is…',
        answers: [
          'Fine if your hands look clean',
          'Never okay — use gloves, tongs or utensils',
          'Okay in a rush',
        ],
        correct: 1,
      },
      {
        question: 'What should you check before leaving the pass?',
        answers: [
          'Table number and presentation',
          'Just the table number',
          'Nothing — the kitchen checks',
        ],
        correct: 0,
      },
    ],
  },

  {
    id: 'efficiency',
    icon: '⚡',
    title: 'Efficiency',
    tag: 'Decision + habits',
    blurb: 'Work with purpose. Never walk empty-handed.',
    slides: [
      {
        type: 'content',
        kicker: 'What it means',
        blocks: [
          { kind: 'heading', text: 'Work with purpose' },
          {
            kind: 'para',
            text: [
              'Efficiency means using your time well and keeping the café moving. It does ',
              { strong: 'not' },
              ' mean rushing carelessly — it means working with purpose, staying aware, and doing the small jobs before they become big jobs.',
            ],
          },
        ],
      },
      {
        type: 'content',
        kicker: 'Clean as you go',
        blocks: [
          { kind: 'heading', text: 'Clean as you go' },
          {
            kind: 'para',
            text: [
              'If you use it, put it away. If you spill it, wipe it. ',
              { hl: 'Don’t leave anything lying around for someone else.' },
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'Quiet moment',
        heading: 'Trade goes quiet…',
        groups: [
          {
            prompt: 'Trade goes quiet. Is it break time?',
            options: [
              {
                text: 'Yes — sit down and relax',
                correct: false,
                feedback:
                  'Not yet. Scan the café first: clear tables, restock, wipe benches, help a teammate. Then take your break properly.',
              },
              {
                text: 'Not yet — scan the café first, then break',
                correct: true,
                feedback:
                  'Exactly. Get it ready for the next rush, then enjoy your break knowing it’s sorted.',
              },
            ],
          },
        ],
      },
      {
        type: 'checklist',
        kicker: 'Your habits',
        heading: 'Tick the habits you’ll build',
        items: [
          'Never walk empty-handed — grab finished plates and cups',
          'Clean as you go, all shift, every shift',
          'Restock before supplies run out',
          'Clear and reset tables quickly',
          'Scrape and stack dishes properly',
          'Help teammates without waiting to be asked',
          'Ask: “what needs doing right now?”',
        ],
      },
      {
        type: 'content',
        kicker: 'Remember',
        blocks: [
          {
            kind: 'oneline',
            text: 'Work with purpose, clean as you go, and never walk empty-handed.',
          },
        ],
      },
    ],
    quiz: [
      {
        question: 'Efficiency means…',
        answers: [
          'Rushing to clear the queue',
          'Working with purpose and doing small jobs early',
          'Doing only your own tasks',
        ],
        correct: 1,
      },
      {
        question: 'Trade goes quiet. What do you do?',
        answers: [
          'Take your break straight away',
          'Scan the café and get it ready, then break',
          'Wait to be told',
        ],
        correct: 1,
      },
      {
        question: 'The rule when moving around the café: never walk…',
        answers: ['Empty-handed', 'Too fast', 'Behind the barista'],
        correct: 0,
      },
    ],
  },

  {
    id: 'seeitownit',
    icon: '🎯',
    title: 'See It. Own It. Act.',
    tag: 'Real scenarios',
    blurb: 'Notice it, own it, fix it. Mistakes included.',
    slides: [
      {
        type: 'content',
        kicker: 'Core behaviour',
        blocks: [
          { kind: 'heading', text: 'See It. Own It. Act.' },
          {
            kind: 'para',
            text: [
              'This is our core team behaviour. We ',
              { hl: 'don’t walk past problems' },
              ', ignore mess, or wait for someone else to fix it. If you can fix it safely, do it. If you can’t fix it alone, start the process or ask for help.',
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'Owning mistakes',
        heading: 'When you stuff up',
        intro:
          'We’re all human and things go wrong. Nobody at Cafe is ever in trouble for an honest mistake fixed fast — hiding it is a different story.',
        groups: [
          {
            prompt: 'You make a mistake on an order mid-shift. What’s the Cafe move?',
            options: [
              {
                text: 'Quietly hope nobody notices',
                correct: false,
                feedback:
                  'Hiding it is the only real problem. Own it and fix it immediately — no blame, just a fix.',
              },
              {
                text: 'Own it and fix it immediately',
                correct: true,
                feedback: 'Exactly. Own it, fix it fast. That’s the Cafe way.',
              },
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'Complaints',
        heading: 'The customer is always right',
        intro: '…even when they’re not. Never argue about who ordered what.',
        groups: [
          {
            prompt: 'A customer insists they ordered something they didn’t. What do you say?',
            options: [
              {
                text: '“Actually, you ordered the other one…”',
                correct: false,
                feedback:
                  'Never argue who ordered what. The customer should walk away with the right order and a good feeling.',
              },
              {
                text: '“Oh, sorry about that — I’ll fix that for you straight away.” 🙂',
                correct: true,
                feedback: 'Perfect. Fix it with a smile. If it’s tricky, bring in the manager.',
              },
            ],
          },
        ],
      },
      {
        type: 'content',
        kicker: 'Remember',
        blocks: [{ kind: 'oneline', text: 'Notice it, own it, fix it. Mistakes included.' }],
      },
    ],
    quiz: [
      {
        question: 'You make an honest mistake. You should…',
        answers: ['Own it and fix it immediately', 'Hope nobody noticed', 'Blame the rush'],
        correct: 0,
      },
      {
        question: 'The only thing you’ll get in trouble for is…',
        answers: ['Making a mistake', 'Hiding a mistake', 'Asking for help'],
        correct: 1,
      },
      {
        question: 'A customer complains about their order. The Cafe response is…',
        answers: [
          'Work out whose fault it was',
          'Apologise and fix it, without arguing',
          'Explain what they actually ordered',
        ],
        correct: 1,
      },
    ],
  },

  {
    id: 'teamwork',
    icon: '🧑‍🤝‍🧑',
    title: 'Teamwork',
    tag: 'Rush-hour scenarios',
    blurb: 'Say yes, say please, say good job.',
    slides: [
      {
        type: 'content',
        kicker: 'Together',
        blocks: [
          { kind: 'heading', text: 'We win as a team' },
          {
            kind: 'para',
            text: [
              'A café only works when the team works together. Teamwork means ',
              { hl: 'never saying “that’s not my job.”' },
              ' It means noticing pressure points and stepping in.',
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'In the rush',
        heading: 'When a teammate asks',
        intro:
          'When a teammate asks you to do something during a rush, it’s only ever because it needs doing and they can’t do it themselves.',
        groups: [
          {
            prompt:
              'It’s a brutal rush and a teammate asks you to run table 6’s coffees. What do you say?',
            options: [
              {
                text: '“That’s not really my job right now”',
                correct: false,
                feedback:
                  'The answer is a quick, cheerful “yes!”, not a debate. They only ask because it needs doing.',
              },
              {
                text: 'A quick, cheerful “Yes!”',
                correct: true,
                feedback: 'Exactly. Say yes fast — the debate wastes the time you’re trying to save.',
              },
            ],
          },
        ],
      },
      {
        type: 'choice',
        kicker: 'Don’t take it personally',
        heading: 'Rush-hour shorthand',
        intro: 'During busy periods, communication gets short and direct — and that’s okay.',
        groups: [
          {
            prompt: 'Mid-rush, a teammate is curt with you. What does it mean?',
            options: [
              {
                text: 'They’re upset with you',
                correct: false,
                feedback:
                  'It’s the clock, not you. Real issues wait until after the shift, then get talked through calmly.',
              },
              {
                text: 'Time’s tight — it’s not personal',
                correct: true,
                feedback:
                  'Right. Don’t take it personally, and don’t dish out more than the moment needs.',
              },
            ],
          },
        ],
      },
      {
        type: 'content',
        kicker: 'Back each other',
        blocks: [
          {
            kind: 'list',
            items: [
              'Say please when you ask, and don’t delegate what you could do yourself',
              'Celebrate wins — tell teammates “good job!”, even the boss',
              'Save disagreements for after the shift, then talk them through openly',
              'No gossip. Leave personal baggage at the door and walk in with a smile',
            ],
          },
          {
            kind: 'oneline',
            text: 'Say yes, say please, say good job. Sort issues after the shift.',
          },
        ],
      },
    ],
    quiz: [
      {
        question: 'A teammate asks for help during a rush. You…',
        answers: [
          'Explain why you’re busy',
          'Say “yes!” quickly and cheerfully',
          'Finish your task first',
        ],
        correct: 1,
      },
      {
        question: 'A teammate is short with you mid-rush. It means…',
        answers: [
          'They’re annoyed at you',
          'Time is tight — it’s not personal',
          'You did something wrong',
        ],
        correct: 1,
      },
      {
        question: 'When do you air a real disagreement?',
        answers: [
          'Right away, on the floor',
          'After the shift, calmly and openly',
          'In the group chat',
        ],
        correct: 1,
      },
    ],
  },

  {
    id: 'learn',
    icon: '📈',
    title: 'Learn, Ask & Improve',
    tag: 'Reveal + commit',
    blurb: 'Ask, listen, practise, improve. Every shift.',
    slides: [
      {
        type: 'content',
        kicker: 'Day one',
        blocks: [
          { kind: 'heading', text: 'Nobody expects day-one perfection' },
          {
            kind: 'para',
            text: [
              'We don’t expect new team members to know everything immediately. What matters is your ',
              { hl: 'willingness to learn and improve.' },
            ],
          },
        ],
      },
      {
        type: 'reveal',
        kicker: 'The mindset',
        intro: 'Tap each to unpack it.',
        items: [
          {
            icon: '❓',
            title: 'Questions are good',
            body: 'Asking questions shows you care about doing the job properly. It’s exactly what we want.',
          },
          {
            icon: '🗣️',
            title: 'Feedback is training',
            body: 'Feedback is part of training, not criticism. It’s how you get better.',
          },
          {
            icon: '📅',
            title: 'Every shift counts',
            body: 'Every shift is a chance to get quicker, more confident and more aware.',
          },
        ],
      },
      {
        type: 'checklist',
        kicker: 'Your commitment',
        heading: 'Tick what you’ll bring every shift',
        items: [
          'Ask questions when unsure',
          'Listen carefully during training',
          'Practise skills properly',
          'Take feedback positively',
          'Learn from mistakes',
          'Try to improve each shift',
        ],
      },
      {
        type: 'content',
        kicker: 'Remember',
        blocks: [{ kind: 'oneline', text: 'Ask, listen, practise, improve. Every shift.' }],
      },
    ],
    quiz: [
      {
        question: 'Asking questions at Cafe is…',
        answers: [
          'A sign you’re struggling',
          'A good thing — it shows you care',
          'Best kept to a minimum',
        ],
        correct: 1,
      },
      {
        question: 'Feedback is…',
        answers: [
          'Criticism to worry about',
          'Part of training, and how you improve',
          'Only for new starters',
        ],
        correct: 1,
      },
    ],
  },
]

/** The sign-off statement shown once every module is complete. */
export const SIGNOFF_STANDARD =
  'A strong team member notices, cares, acts and keeps learning.'

export const SIGNOFF_STANDARD_BOLD =
  'Customers first. Be the nicest person they meet today. Never a flat no. If in doubt, throw it out. Clean as you go. Own your mistakes. Back the team. See It, Own It, Act.'

export const SIGNOFF_DECLARATION =
  'I have read and understand what’s required to be an effective member of The Cafe team, and I know this guide is a reference tool I can always come back to.'
