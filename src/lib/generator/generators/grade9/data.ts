import { math, mb10f } from '../pc40s/common.ts';
import { dec, distinct, others } from '../grade10/shared.ts';

// ── Data collection ───────────────────────────────────────────────────────

const FACTORS: Array<[string, string]> = [
  ['A survey about the school cafeteria asks only students who eat lunch there every day.', 'Bias'],
  ['A survey asks, "Don\'t you agree that the new skate park is a waste of money?"', 'Use of language'],
  ['A company collects students\' home addresses in a survey without saying how they will be used.', 'Privacy'],
  ['Researchers record students\' conversations without asking permission.', 'Ethics'],
  ['A student wants to interview every person in Winnipeg but has only a small budget.', 'Cost'],
  ['A survey about winter sports is done in July.', 'Time and timing'],
  ['A survey about holiday traditions assumes that every family celebrates the same holidays.', 'Cultural sensitivity'],
  ['A survey on a new bus route is done only at 2 a.m.', 'Time and timing'],
  ['A survey about favourite sports is handed out only at a hockey game.', 'Bias'],
  ['A class survey asks each student to write their name next to their income question.', 'Privacy'],
];
const FACTOR_NAMES = ['Bias', 'Use of language', 'Ethics', 'Cost', 'Time and timing', 'Privacy', 'Cultural sensitivity'];

export const dataFactor = mb10f('10f-data-factor', {
  points: 1,
  levels: { 1: 'Bias, language, and timing', 2: 'Any factor', 3: 'Choose the best improvement' },
  generate(rng, difficulty) {
    const pool = difficulty === 1 ? FACTORS.filter(([, f]) => ['Bias', 'Use of language', 'Time and timing'].includes(f)) : FACTORS;
    const [scenario, factor] = rng.pick(pool);
    if (difficulty === 3) {
      const fixes: Record<string, string> = {
        'Bias': 'Survey a random sample of all students, not just one group.',
        'Use of language': 'Reword the question neutrally, e.g. "What is your opinion of the new skate park?"',
        'Privacy': 'Collect only the information needed and keep responses anonymous.',
        'Ethics': 'Ask for informed consent before collecting any data.',
        'Cost': 'Survey a representative sample instead of the whole population.',
        'Time and timing': 'Collect the data at a time when the question is relevant to people.',
        'Cultural sensitivity': 'Write questions that respect the different traditions of respondents.',
      };
      return {
        body: `${scenario} Which change would best improve the data collection?`,
        answer: fixes[factor],
        distractors: others(rng, Object.values(fixes), fixes[factor]),
        solution: `The problem is ${factor.toLowerCase()}. ${fixes[factor]}`,
      };
    }
    return {
      body: `${scenario} Which factor most affects this data collection?`,
      answer: factor,
      distractors: others(rng, FACTOR_NAMES, factor),
      solution: `This is an issue of ${factor.toLowerCase()}.`,
    };
  },
});

const QUESTIONS: Array<[string, string[]]> = [
  ['How many hours of sleep do you usually get on a school night?', ['You get enough sleep like most healthy teens, right?', 'Since experts say teens need 9 hours of sleep, how much do you get?', 'Do you, like most lazy students, stay up too late?']],
  ['Which do you prefer: cats, dogs, or neither?', ['Don\'t you agree that dogs make the best pets?', 'Cats are selfish; do you prefer dogs?', 'Most smart people prefer cats. Do you?']],
  ['How do you usually get to school?', ['You don\'t pollute the air by driving to school, do you?', 'Do you walk to school like responsible students do?', 'Why don\'t you take the bus to school?']],
  ['What is your opinion of the new school start time?', ['Isn\'t the terrible new start time unfair to students?', 'Do you agree the new start time is a great improvement?', 'The new start time is too early. Do you agree?']],
];

export const dataQuestion = mb10f('10f-data-question', {
  points: 1,
  levels: { 1: 'Which question is neutral?', 2: 'Which question is biased?', 3: 'Why is the question biased?' },
  generate(rng, difficulty) {
    const [neutral, biased] = rng.pick(QUESTIONS);
    if (difficulty === 1) {
      return {
        body: 'Which survey question is neutral (not leading)?',
        answer: `"${neutral}"`,
        distractors: biased.map((q) => `"${q}"`),
        solution: `"${neutral}" does not suggest an answer. The others use loaded words or tell the respondent what to think.`,
      };
    }
    const q = rng.pick(biased);
    if (difficulty === 2) {
      const other = QUESTIONS.filter(([n]) => n !== neutral).map(([n]) => n);
      return {
        body: 'Which survey question is biased?',
        answer: `"${q}"`,
        distractors: [`"${neutral}"`, ...others(rng, other, '', 2).map((n) => `"${n}"`)],
        solution: `"${q}" leads the respondent toward an answer.`,
      };
    }
    return {
      body: `Why is this survey question biased? "${q}"`,
      answer: 'Its wording suggests which answer the respondent should give.',
      distractors: ['It is too short to be answered.', 'It asks about a topic students care about.', 'It can be answered with a number.'],
      solution: `The wording is leading: it pushes the respondent toward one answer. A neutral version: "${neutral}"`,
    };
  },
});

const SITUATIONS: Array<[string, 'sample' | 'population', string]> = [
  ['A teacher records the test marks of every student in her class to find the class average.', 'population', 'the class is small, so every student can be included'],
  ['A factory tests 50 light bulbs from each day\'s production to check their lifespan.', 'sample', 'testing destroys the bulbs, so they cannot all be tested'],
  ['Statistics Canada asks every household to complete the census.', 'population', 'the census is meant to count everyone'],
  ['A polling company phones 1000 Manitobans to predict an election.', 'sample', 'calling every voter would cost too much and take too long'],
  ['A coach asks all 15 players on the team which jersey colour they prefer.', 'population', 'the team is small and every player is affected'],
  ['A biologist tags 40 fish in a lake to study the fish population.', 'sample', 'it is impossible to catch every fish'],
  ['A chef tastes a spoonful of soup to check the seasoning.', 'sample', 'tasting the whole pot would use it all up'],
  ['A student council asks every student in the school to vote on a dance theme.', 'population', 'every student has a say in the decision'],
];

export const dataSamplePopulation = mb10f('10f-data-sample-population', {
  points: 1,
  levels: { 1: 'Sample or population?', 2: 'With a reason', 3: 'Identify the population' },
  generate(rng, difficulty) {
    const [text, kind, why] = rng.pick(SITUATIONS);
    if (difficulty === 1) {
      return {
        body: `${text} Does this use a sample or a population?`,
        answer: kind === 'sample' ? 'A sample' : 'A population',
        distractors: [kind === 'sample' ? 'A population' : 'A sample', 'Neither: no data is collected', 'Both at once'],
        solution: `It uses ${kind === 'sample' ? 'a sample' : 'the whole population'}: ${why}.`,
      };
    }
    if (difficulty === 2) {
      const answer = `${kind === 'sample' ? 'A sample' : 'A population'}, because ${why}`;
      const wrong = SITUATIONS.filter(([t, k]) => t !== text && k !== kind).map(([, k, w]) => `${k === 'sample' ? 'A sample' : 'A population'}, because ${w}`);
      return {
        body: `${text} Does this use a sample or a population, and why?`,
        answer,
        distractors: [`${kind === 'sample' ? 'A population' : 'A sample'}, because ${why}`, ...others(rng, wrong, answer, 2)],
        solution: `${answer}.`,
      };
    }
    const pops: Array<[string, string, string[]]> = [
      ['A school wants to know how its Grade 9 students feel about a new timetable, and surveys 30 of them.', 'All Grade 9 students at the school', ['The 30 students surveyed', 'All students at the school', 'All Grade 9 students in Manitoba']],
      ['A city surveys 200 drivers to learn how residents feel about a new bridge.', 'All residents of the city', ['The 200 drivers', 'All drivers in Canada', 'Only people who use the bridge daily']],
    ];
    const [t, pop, wrongs] = rng.pick(pops);
    return {
      body: `${t} What is the population?`,
      answer: pop,
      distractors: wrongs,
      solution: `The population is the whole group the question is about: ${pop.toLowerCase()}. The people actually surveyed are the sample.`,
    };
  },
});

export const dataChoose = mb10f('10f-data-choose', {
  points: 1,
  levels: { 1: 'When to use a population', 2: 'When to use a sample', 3: 'The limitation that requires a sample' },
  generate(rng, difficulty) {
    const wantPop = difficulty === 1;
    const pool = SITUATIONS.filter(([, k]) => k === (wantPop ? 'population' : 'sample'));
    const [text, , why] = rng.pick(pool);
    if (difficulty === 3) {
      const limitation = why.includes('destroys') || why.includes('use it all') ? 'The testing destroys what is tested' : why.includes('impossible') ? 'It is impossible to reach every member' : 'It would cost too much or take too long';
      return {
        body: `${text} What limitation makes a sample necessary?`,
        answer: limitation,
        distractors: ['The population is too small', 'Samples are always more accurate than populations', 'Nobody would answer the question'].filter((d) => d !== limitation),
        solution: `A sample is used because ${why}.`,
      };
    }
    const all = SITUATIONS.filter(([, k]) => k !== (wantPop ? 'population' : 'sample')).map(([t]) => t);
    return {
      body: `Which situation should use ${wantPop ? 'the whole population' : 'a sample'}?`,
      answer: text,
      distractors: others(rng, all, text),
      solution: `${text} ${wantPop ? 'A population works' : 'A sample is better'} because ${why}.`,
    };
  },
});

export const dataGeneralize = mb10f('10f-data-generalize', {
  points: 1,
  levels: { 1: 'Is the sample representative?', 2: 'Is the conclusion valid?', 3: 'Choose the best sample' },
  generate(rng, difficulty) {
    const cases: Array<[string, boolean, string]> = [
      ['To find the favourite sport of Grade 9 students in Manitoba, 20 students at a basketball camp are surveyed.', false, 'students at a basketball camp are likely to prefer basketball'],
      ['To find how much time Winnipeg teens spend online, 500 randomly chosen Winnipeg teens are surveyed.', true, 'a large random sample from the population is likely to be representative'],
      ['To predict a provincial election, only people in one small town are called.', false, 'one town does not represent the whole province'],
      ['To find the favourite lunch at a school, every tenth student on the class list is surveyed.', true, 'a systematic sample from the whole school represents it fairly'],
      ['To find the most popular music, listeners who call a country music radio station are surveyed.', false, 'people who call a country station likely prefer country music'],
    ];
    if (difficulty === 3) {
      const answer = 'A random sample of 100 students from every grade in the school';
      return {
        body: 'A school wants to know how students feel about a new cafeteria menu. Which sample is best?',
        answer,
        distractors: ['The 25 students in the principal\'s math class', 'The first 100 students in the lunch line on pizza day', 'Students who volunteer to answer online'],
        solution: 'A random sample drawn from the whole school is most likely to represent all students; the others favour particular groups.',
      };
    }
    const [text, valid, why] = rng.pick(cases);
    const q = difficulty === 1 ? 'Is the sample likely to be representative?' : 'Can the result be generalized to the whole population?';
    const answer = `${valid ? 'Yes' : 'No'}: ${why}`;
    return {
      body: `${text} ${q}`,
      answer,
      distractors: distinct(answer, [`${valid ? 'No' : 'Yes'}: ${why}`, `${valid ? 'No' : 'Yes'}: any sample of more than 10 people is representative`, `${valid ? 'No' : 'Yes'}: the sample size is exactly right`]),
      solution: `${valid ? 'Yes' : 'No'}. ${why[0].toUpperCase()}${why.slice(1)}.`,
    };
  },
});

// ── Project planning ──────────────────────────────────────────────────────

const DISPLAYS: Array<[string, string]> = [
  ['how the temperature in Brandon changed each hour over one day', 'Line graph'],
  ['the percent of students choosing each lunch option', 'Circle graph'],
  ['the number of students in each grade who play a sport', 'Bar graph'],
  ['the relationship between hours studied and test marks', 'Scatter plot'],
  ['the heights of all the students in a class, grouped in intervals', 'Histogram'],
];
const METHODS: Array<[string, string]> = [
  ['how students feel about a new school rule', 'A survey or questionnaire'],
  ['how many cars pass the school each hour', 'Observation'],
  ['whether a new fertilizer makes plants grow taller', 'An experiment'],
  ['the population of Manitoba over the last 50 years', 'Existing data from a database, such as Statistics Canada'],
];

export const dataPlan = mb10f('10f-data-plan', {
  points: 1,
  levels: { 1: 'Choose a display', 2: 'Choose a collection method', 3: 'Choose a good question for investigation' },
  generate(rng, difficulty) {
    if (difficulty === 1) {
      const [what, display] = rng.pick(DISPLAYS);
      return {
        body: `Which display is most appropriate to show ${what}?`,
        answer: display,
        distractors: others(rng, DISPLAYS.map(([, d]) => d), display),
        solution: `${display}s suit this kind of data: ${display === 'Line graph' ? 'change over time' : display === 'Circle graph' ? 'parts of a whole' : display === 'Bar graph' ? 'comparing categories' : display === 'Scatter plot' ? 'the relationship between two variables' : 'grouped numerical data'}.`,
      };
    }
    if (difficulty === 2) {
      const [what, method] = rng.pick(METHODS);
      return {
        body: `A student wants to find out ${what}. Which data collection method fits best?`,
        answer: method,
        distractors: others(rng, METHODS.map(([, m]) => m), method),
        solution: `${method} is the most direct way to collect this data.`,
      };
    }
    const answer = 'How many hours per week do Grade 9 students at our school spend on homework?';
    return {
      body: 'Which question is best for a data investigation?',
      answer,
      distractors: ['Is homework bad?', 'Why does everyone hate homework?', 'What is the answer to question 5 on tonight\'s homework?'],
      solution: 'A good investigation question is specific, neutral, and can be answered by collecting data from a clear population.',
    };
  },
});

export const dataConclusion = mb10f('10f-data-conclusion', {
  levels: { 1: 'Read a percent from a table', 2: 'Compare groups', 3: 'Judge a claim' },
  generate(rng, difficulty) {
    const opts = ['Walk', 'Bus', 'Car', 'Bike'];
    const counts = opts.map(() => rng.int(5, 40));
    const total = counts.reduce((a, b) => a + b, 0);
    const table = `#table(columns: 5, inset: 5pt, align: center, [Method], ${opts.map((o) => `[${o}]`).join(', ')}, [Students], ${counts.map((c) => `[${c}]`).join(', ')})`;
    const i = rng.int(0, 3);
    if (difficulty === 1) {
      const pct = (100 * counts[i]) / total;
      return {
        body: `The table shows how ${total} surveyed students get to school. What percent ${opts[i] === 'Car' ? 'come by car' : opts[i] === 'Bus' ? 'take the bus' : opts[i] === 'Walk' ? 'walk' : 'bike'}, to the nearest tenth?\n\n${table}`,
        answer: `${dec(pct, 1)}%`,
        distractors: distinct(`${dec(pct, 1)}%`, [`${counts[i]}%`, `${dec((100 * counts[i]) / (total - counts[i]), 1)}%`, `${dec(100 / 4, 1)}%`]),
        solution: `${math(`${counts[i]} / ${total} times 100 approx ${dec(pct, 1)}`)}%.`,
      };
    }
    const max = counts.indexOf(Math.max(...counts)), min = counts.indexOf(Math.min(...counts));
    if (difficulty === 2) {
      if (max === min) return dataConclusion.generate(rng, difficulty);
      const answer = `${opts[max]} is the most common way and ${opts[min]} the least common.`;
      return {
        body: `The table shows how ${total} surveyed students get to school. Which conclusion is supported?\n\n${table}`,
        answer,
        distractors: distinct(answer, [`${opts[min]} is the most common way and ${opts[max]} the least common.`, `Every method is used by about the same number of students.`, `More than half the students use ${opts[min].toLowerCase()}.`]),
        solution: `${opts[max]}: ${counts[max]} students (most); ${opts[min]}: ${counts[min]} (least).`,
      };
    }
    const half = counts[max] > total / 2;
    const answer = half ? `Yes: ${counts[max]} of ${total} is more than half.` : `No: ${counts[max]} of ${total} is less than half.`;
    return {
      body: `A student claims that most (more than half) of the surveyed students ${opts[max] === 'Car' ? 'come by car' : opts[max] === 'Bus' ? 'take the bus' : opts[max] === 'Walk' ? 'walk' : 'bike'}. Is the claim supported?\n\n${table}`,
      answer,
      distractors: distinct(answer, [half ? `No: ${counts[max]} of ${total} is less than half.` : `Yes: ${counts[max]} of ${total} is more than half.`, `Yes: it is the largest group, so it is most students.`, 'No: a survey can never support a claim.']),
      solution: `${math(`${counts[max]} / ${total} approx ${dec(counts[max] / total, 2)}`)}, which is ${half ? 'more' : 'less'} than 0.5. Being the largest group does not by itself mean more than half.`,
    };
  },
});

// ── Probability in society ────────────────────────────────────────────────

const PROB_TYPES: Array<[string, string]> = [
  ['The probability of rolling a 6 on a fair die is 1/6.', 'Theoretical'],
  ['A coin landed heads 27 times in 50 flips, so P(heads) = 27/50.', 'Experimental'],
  ['A coach says the team has an 80% chance of winning because the players look confident.', 'Subjective judgment'],
  ['The probability of drawing a heart from a standard deck is 13/52.', 'Theoretical'],
  ['A basketball player made 42 of 60 free throws this season, so P(make) = 0.7.', 'Experimental'],
  ['A student feels there is a 90% chance the test will be easy.', 'Subjective judgment'],
  ['Records show it rained on 12 of the last 30 days in May.', 'Experimental'],
];

export const probType = mb10f('10f-prob-type', {
  points: 1,
  levels: { 1: 'Theoretical or experimental', 2: 'Including subjective judgment', 3: 'Why the probabilities differ' },
  generate(rng, difficulty) {
    if (difficulty === 3) {
      const answer = 'Experimental results vary, especially with few trials; they approach the theoretical probability as trials increase.';
      return {
        body: `A fair coin has a theoretical probability of heads of ${math('1/2')}, but in 20 flips a student got 13 heads. Why do the probabilities differ?`,
        answer,
        distractors: ['The coin must be unfair.', 'Theoretical probability is always wrong.', 'The student must have counted incorrectly.'],
        solution: 'Experimental probability is based on actual trials and varies by chance. With more trials it tends to get closer to the theoretical value.',
      };
    }
    const pool = difficulty === 1 ? PROB_TYPES.filter(([, t]) => t !== 'Subjective judgment') : PROB_TYPES;
    const [text, type] = rng.pick(pool);
    return {
      body: `What kind of probability is this? ${text}`,
      answer: type,
      distractors: ['Theoretical', 'Experimental', 'Subjective judgment', 'Not a probability'].filter((t) => t !== type),
      solution: type === 'Theoretical' ? 'It comes from equally likely outcomes, not from trials.' : type === 'Experimental' ? 'It comes from the results of actual trials.' : 'It is based on personal opinion or feeling rather than data.',
    };
  },
});

export const probAssumption = mb10f('10f-prob-assumption', {
  points: 1,
  levels: { 1: 'Games of chance', 2: 'Forecasts and predictions', 3: 'The limitation of an assumption' },
  generate(rng, difficulty) {
    const cases: Array<[string, string, string[]]> = [
      ['The probability of rolling a 3 is 1/6.', 'The die is fair: each face is equally likely.', ['The die has been rolled before.', 'Three is a lucky number.', 'The die is rolled on a table.']],
      ['The probability of spinning red on a spinner with 4 sections, one of them red, is 1/4.', 'The four sections are the same size.', ['The spinner has been used before.', 'Red is the most popular colour.', 'The spinner is spun gently.']],
      ['There is a 70% chance of rain tomorrow, based on past days with similar weather.', 'Tomorrow will behave like the past days with similar conditions.', ['It rained yesterday.', 'Weather forecasts are always correct.', 'It will rain for exactly 70% of the day.']],
      ['A player with a 0.300 batting average has a 30% chance of a hit at her next at-bat.', 'Her past performance predicts her next at-bat.', ['She will get exactly 3 hits in her next 10 at-bats.', 'The pitcher does not matter at all.', 'She will never strike out.']],
    ];
    const [claim, assumption, wrongs] = difficulty === 1 ? rng.pick(cases.slice(0, 2)) : rng.pick(cases.slice(2));
    if (difficulty === 3) {
      const answer = 'Conditions can change, so the past may not predict the future exactly.';
      return {
        body: `${claim} What is a limitation of the assumption behind this probability?`,
        answer,
        distractors: ['There is no limitation: probabilities are exact.', 'The probability must be 50% instead.', 'Probabilities cannot be written as percents.'],
        solution: `The probability assumes: ${assumption.toLowerCase()} ${answer}`,
      };
    }
    return {
      body: `${claim} What assumption is being made?`,
      answer: assumption,
      distractors: wrongs,
      solution: assumption,
    };
  },
});

export const probOpposing = mb10f('10f-prob-opposing', {
  points: 1,
  levels: { 1: 'The complement', 2: 'Two readings of one probability', 3: 'Decisions from probability' },
  generate(rng, difficulty) {
    const p = rng.pick([10, 20, 25, 30, 40, 60, 70, 75]);
    if (difficulty === 1) {
      return {
        body: `The forecast says there is a ${p}% chance of rain. What is the chance it does not rain?`,
        answer: `${100 - p}%`,
        distractors: distinct(`${100 - p}%`, [`${p}%`, '50%', `${Math.max(0, p - 10)}%`, `${100 - p / 2}%`]),
        solution: `The probabilities of rain and no rain add to 100%: ${math(`100% - ${p}% = ${100 - p}%`)}.`,
      };
    }
    if (difficulty === 2) {
      const answer = `A supporter says "${100 - p}% of patients have no side effects"; a critic says "${p}% of patients do."`;
      return {
        body: `A medicine causes side effects in ${p}% of patients. How can this one probability support opposing positions?`,
        answer,
        distractors: [`Both sides must say "${p}% of patients have side effects."`, `A supporter says "${p}% have no side effects"; a critic says "${100 - p}% do."`, 'A single probability can support only one position.'],
        solution: `The same fact can be stated as ${p}% with side effects or ${100 - p}% without, depending on which side is making the argument.`,
      };
    }
    const answer = `${p >= 50 ? 'Bring an umbrella' : 'An umbrella is probably not needed, but some may still bring one'}: decisions combine the probability with judgment about the cost of being wrong.`;
    return {
      body: `The chance of rain during an outdoor graduation is ${p}%. What is a reasonable decision, and why?`,
      answer,
      distractors: [`${p >= 50 ? 'Do not bring an umbrella' : 'Cancel the event'}: probability always tells you exactly what will happen.`, 'Ignore the forecast: probabilities are never useful.', `Wait until exactly ${p}% of the event is over.`],
      solution: `A ${p}% chance is ${p >= 50 ? 'more' : 'less'} likely than not. Decisions often combine theoretical or experimental probability with subjective judgment about consequences.`,
    };
  },
});

export const probCompute = mb10f('10f-prob-compute', {
  levels: { 1: 'Theoretical probability', 2: 'Experimental probability', 3: 'Compare and predict' },
  generate(rng, difficulty) {
    const red = rng.int(2, 8), blue = rng.int(2, 8), green = rng.int(1, 6), total = red + blue + green;
    if (difficulty === 1) {
      return {
        body: `A bag has ${red} red, ${blue} blue, and ${green} green marbles. What is the theoretical probability of drawing a blue marble?`,
        answer: math(`${blue}/${total}`),
        distractors: distinct(math(`${blue}/${total}`), [`${blue}/${total - blue}`, `1/3`, `${red}/${total}`].map(math)),
        solution: `${math(`P("blue") = "blue marbles"/"total" = ${blue}/${total}`)}.`,
      };
    }
    const trials = rng.pick([20, 40, 50, 60]), hits = rng.int(Math.round(trials * 0.15), Math.round(trials * 0.5));
    if (difficulty === 2) {
      return {
        body: `A student drew a marble and replaced it ${trials} times, getting blue ${hits} times. What is the experimental probability of blue, as a percent?`,
        answer: `${dec((100 * hits) / trials, 1)}%`,
        distractors: distinct(`${dec((100 * hits) / trials, 1)}%`, [`${hits}%`, `${dec((100 * hits) / (trials - hits), 1)}%`, `${dec((100 * blue) / total, 1)}%`]),
        solution: `${math(`${hits} / ${trials} = ${dec(hits / trials, 3)}`)} = ${dec((100 * hits) / trials, 1)}%.`,
      };
    }
    const n = rng.pick([100, 200, 300]);
    const expected = (n * blue) / total;
    return {
      body: `A bag has ${red} red, ${blue} blue, and ${green} green marbles. If a marble is drawn and replaced ${n} times, about how many blue marbles would you expect?`,
      answer: `About ${Math.round(expected)}`,
      distractors: distinct(`About ${Math.round(expected)}`, [`About ${blue * 10}`, `About ${Math.round(n / 3)}`, `About ${Math.round((n * red) / total)}`, `Exactly ${Math.round(expected)}`]),
      solution: `${math(`${n} times ${blue}/${total} approx ${dec(expected, 1)}`)}. Actual results will vary a little, since the draws are random.`,
    };
  },
});

export const DATA_10F = [dataFactor, dataQuestion, dataSamplePopulation, dataChoose, dataGeneralize, dataPlan, dataConclusion, probType, probAssumption, probOpposing, probCompute];
