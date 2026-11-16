import fs from 'node:fs';
import path from 'node:path';

const workspace = process.argv[2] ?? '/home/max/TestGen';
const catalogPath = path.join(workspace, 'curriculum/catalog.json');
const languagePath = path.join(workspace, 'curriculum/comment-language.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const language = JSON.parse(fs.readFileSync(languagePath, 'utf8'));
const now = Date.now();
const outcomeKey = (classId, unitId, sectionId, indicatorId) => JSON.stringify([classId, unitId, sectionId, indicatorId]);
const excluded = (course) => /cemc|comc/i.test(`${course.id} ${course.name}`);

const officialReplacements = new Map([
  ['Explain the behavior of a function on an interval using the Intermediate Value Theorem.', 'use the Intermediate Value Theorem to explain function behavior'],
  ['Identify a re-expression of mathematical information presented in a given representation.', 'identify equivalent representations of mathematical information'],
  ['Represent the derivative of a function as the limit of a difference quotient.', 'represent a derivative as a limit of a difference quotient'],
  ['Justify conclusions about functions by applying the Mean Value Theorem over an interval.', 'apply the Mean Value Theorem to justify conclusions about functions'],
  ['Calculate minimum and maximum values in applied contexts or analysis of functions.', 'find minimum and maximum values in applied contexts'],
  ['Interpret the meaning of areas associated with the graph of a rate of change in context.', 'interpret areas under a rate-of-change graph'],
  ['Calculate a definite integral using areas and properties of definite integrals.', 'calculate definite integrals using areas and integral properties'],
  ['Evaluate definite integrals analytically using the Fundamental Theorem of Calculus.', 'evaluate definite integrals using the Fundamental Theorem of Calculus'],
  ['Interpret the meaning of a differential equation and its variables in context.', 'interpret a differential equation and its variables in context'],
  ['Calculate volumes of solids with known cross sections using definite integrals.', 'calculate volumes from cross sections using definite integrals'],
  ['Determine values for positions and rates of change in problems involving planar motion.', 'determine positions and rates of change in planar motion'],
  ['Calculate areas of regions defined by polar curves using definite integrals.', 'calculate areas enclosed by polar curves'],
  ['Determine the error bound associated with a Taylor polynomial approximation.', 'determine the error bound for a Taylor polynomial'],
  ['Determine the radius of convergence and interval of convergence for a power series.', 'determine the radius and interval of convergence of a power series'],
  ['Demonstrate in a variety of ways that a⁰ is equal to 1 for any value of a (a ≠ 0).', 'explain why a nonzero number raised to the zero power equals 1'],
  ['Determine the sum of two powers such as 5² + 5³ or 3² + 2³, and record the process.', 'calculate and explain the sum of two powers'],
  ['Determine the difference of two powers such as 4³ − 4², and record the process.', 'calculate and explain the difference of two powers'],
]);

const prerequisiteActions = new Set(['compare', 'generalize', 'graph', 'solve', 'approximate', 'multiply', 'draw', 'experiment']);
let changedNicknames = 0;
let removedIndicatorLinks = 0;

function setNickname(entry, nickname) {
  if (!nickname || entry.nickname === nickname) return;
  entry.nickname = nickname;
  entry.nicknameUpdatedAt = now;
  entry.updatedAt = Math.max(entry.updatedAt ?? 0, now);
  changedNicknames++;
}

function apSentenceCase(value) {
  return value.toLowerCase()
    .replace(/fundamental theorem of calculus/gu, 'Fundamental Theorem of Calculus')
    .replace(/intermediate value theorem/gu, 'Intermediate Value Theorem')
    .replace(/mean value theorem/gu, 'Mean Value Theorem')
    .replace(/l'hospital's rule/gu, "L'Hospital's rule")
    .replace(/taylor/gu, 'Taylor').replace(/maclaurin/gu, 'Maclaurin')
    .replace(/euler/gu, 'Euler').replace(/cartesian/gu, 'Cartesian')
    .replace(/riemann/gu, 'Riemann');
}

for (const course of catalog.courses) {
  if (excluded(course)) continue;
  for (const unit of course.units) for (const section of unit.sections) {
    const sectionEntry = language.outcomes[outcomeKey(course.id, unit.id, section.id, null)];
    if (!sectionEntry) throw new Error(`Missing language for ${course.id}/${unit.id}/${section.id}`);

    if (/Surface area of composite three-dimensional objects/i.test(section.name)) {
      setNickname(sectionEntry, 'calculating the surface area of composite objects');
    } else if (/Solve basic linear equations with rational coefficients/i.test(section.name)) {
      setNickname(sectionEntry, 'solve linear equations with rational coefficients');
    } else if (section.name.startsWith('Prerequisite for ')) {
      const skill = section.name.split(/\s+—\s+/u).slice(1).join(' — ').trim();
      const first = skill.match(/^([A-Za-z]+)/)?.[1]?.toLowerCase() ?? '';
      const phrase = skill ? skill[0].toLowerCase() + skill.slice(1) : skill;
      setNickname(sectionEntry, prerequisiteActions.has(first) ? phrase : `work with ${phrase}`);
    }
    if (/^ap-calculus(?:-|$)/u.test(course.id)) setNickname(sectionEntry, apSentenceCase(sectionEntry.nickname));

    for (const indicator of section.indicators ?? []) {
      const entry = language.outcomes[outcomeKey(course.id, unit.id, section.id, indicator.id)];
      if (!entry) throw new Error(`Missing language for ${course.id}/${unit.id}/${section.id}/${indicator.id}`);
      const replacement = officialReplacements.get(indicator.text);
      if (replacement) setNickname(entry, replacement);
      if (indicator.id === 'FUN-3.A' && section.id === 'ap-topic-2-5') {
        setNickname(entry, 'apply the power rule to differentiate a familiar function');
      } else if (indicator.id === 'FUN-3.A' && section.id === 'ap-topic-2-6') {
        setNickname(entry, 'apply sum, difference, and constant-multiple rules term by term');
      } else if (indicator.id === 'LIM-2.D' && section.id === 'ap-topic-1-14') {
        setNickname(entry, 'determine limits that indicate vertical asymptotes');
      } else if (indicator.id === 'LIM-2.D' && section.id === 'ap-topic-1-15') {
        setNickname(entry, 'determine end-behavior limits that indicate horizontal asymptotes');
      } else if (indicator.id === 'LIM-1.E' && section.id === 'ap-topic-1-6') {
        setNickname(entry, 'factor or rationalize an expression before evaluating its limit');
      } else if (indicator.id === 'LIM-1.E' && section.id === 'ap-topic-1-8') {
        setNickname(entry, 'bound a function between two functions with the same limit');
      } else if (indicator.id === 'FUN-3.B' && section.id === 'ap-topic-2-8') {
        setNickname(entry, 'identify both factors before applying the product rule');
      } else if (indicator.id === 'FUN-3.B' && section.id === 'ap-topic-2-9') {
        setNickname(entry, 'identify the numerator and denominator before applying the quotient rule');
      } else if (indicator.id === 'AP-MP-1.C' && section.id === 'ap-topic-3-5') {
        setNickname(entry, 'compare derivative rules before choosing a procedure');
      } else if (/Determine the surface area of a concrete composite 3-D object/i.test(indicator.text)) {
        setNickname(entry, 'calculate the surface area of the individual solids in a composite object');
      } else if (/Determine the area of overlap in a concrete composite 3-D object/i.test(indicator.text)) {
        setNickname(entry, 'calculate the area of overlap between joined solids');
      } else if (/Solve a problem involving surface area/i.test(indicator.text)) {
        setNickname(entry, 'solve surface-area problems involving composite objects');
      } else if (/Determine and verify the solution of a system of linear equations graphically/i.test(indicator.text)) {
        setNickname(entry, 'solve a linear system graphically and verify the solution');
      } else if (/Determine and verify the solution of a system of linear equations algebraically/i.test(indicator.text)) {
        setNickname(entry, 'solve a linear system algebraically and verify the solution');
      } else if (/Describe a strategy to solve a system of linear equations/i.test(indicator.text)) {
        setNickname(entry, 'select a solution method and explain why it fits the linear system');
      }

      // Indicator-level links were all self-links in the reviewed live file. Dynamic report
      // selection now uses the indicator attached to each weak question instead.
      if (entry.nextStepIndicator) {
        delete entry.nextStepIndicator;
        entry.nextStepIndicatorUpdatedAt = now;
        entry.updatedAt = Math.max(entry.updatedAt ?? 0, now);
        removedIndicatorLinks++;
      }
    }
  }
}

for (const entry of Object.values(language.outcomes)) {
  const legacy = Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0;
  entry.nicknameUpdatedAt ??= legacy;
  entry.nextStepUpdatedAt ??= legacy;
  entry.nextStepIndicatorUpdatedAt ??= legacy;
}
language.schemaVersion = 3;
language.updatedAt = now;
fs.writeFileSync(languagePath, `${JSON.stringify(language, null, 2)}\n`);
console.log(JSON.stringify({ schemaVersion: language.schemaVersion, changedNicknames, removedIndicatorLinks, updatedAt: now }));
