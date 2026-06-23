// ── Academic portfolio data ──────────────────────────────────
// Charles's UC Berkeley degree audit: Data Science B.A. (College of
// Computing, Data Science & Society). Sourced from his CalCentral Academic
// Summary (transcript) + the official CDSS major requirements
// (cdss.berkeley.edu/dsus/academics/majorrequirements + domain-emphasis).
//
// This is a static, hand-maintained module (no DB) — edit it here or via the
// vault (school/academics/) and redeploy. The /academics page reads it server-side.
//
// Last reconciled with transcript: 2026-06-18 (through Spring 2026; Fall 2026 planned).

export type ReqStatus = 'done' | 'in-progress' | 'planned' | 'remaining';

export interface Course {
  code: string;
  title: string;
  units: number;
  grade?: string;        // letter grade or 'P'; undefined = in progress / planned
  points?: number;       // grade points (for GPA); undefined for P/NP and in-progress
  term: string;          // e.g. 'Fall 2024'
  satisfies?: string;    // major/college requirement key this course fills
  countsForMajor?: boolean;
  note?: string;
}

export interface Requirement {
  key: string;
  area: 'lower' | 'upper';
  name: string;
  detail: string;
  status: ReqStatus;
  satisfiedBy?: string;  // course code(s)
  options?: string;      // acceptable courses if remaining
  note?: string;
}

export interface PlanTerm {
  term: string;
  courses: { code: string; title: string; units: number; req?: string }[];
}

export interface GradPath {
  id: '3yr' | '3.5yr' | '4yr';
  label: string;
  gradTerm: string;
  yearsTotal: string;
  feasibility: 'tight' | 'realistic' | 'comfortable' | 'not-realistic';
  unitsPerRemainingTerm: string;
  summary: string;
  tradeoffs: string;
}

// ── Student profile (from CalCentral) ─────────────────────────
export const PROFILE = {
  name: 'Charles Ethan Ow',
  studentId: '3040140431',
  major: 'Data Science B.A.',
  program: 'Computing, Data Science & Society (CDSS)',
  emphasis: 'Business & Industrial Analytics',
  level: 'Junior',
  termsInAttendance: 5,
  startTerm: 'Fall 2024',
  expectedGrad: 'Spring 2028',
  cumulativeUnits: 85.485,
  transferUnits: 30.485,   // AP 24.120 + De Anza College 6.365
  apUnits: 24.12,
  deAnzaUnits: 6.365,
  pnpPassed: 4,
  gpa: 3.185,
  unitsToGraduate: 120,
};

// ── Completed + in-progress coursework (transcript) ───────────
export const COURSES: Course[] = [
  // Fall 2024
  { code: 'ASAMST 121', title: 'Chinese American History', units: 4, grade: 'A', points: 16, term: 'Fall 2024', satisfies: 'breadth' },
  { code: 'CHINESE 98', title: 'Directed Group Study', units: 1, grade: 'P', term: 'Fall 2024' },
  { code: 'COMPSCI 61A', title: 'Structure & Interpretation of Computer Programs', units: 4, grade: 'A-', points: 14.8, term: 'Fall 2024', satisfies: 'program-structures', countsForMajor: true },
  { code: 'DATA C8', title: 'Foundations of Data Science', units: 4, grade: 'A+', points: 16, term: 'Fall 2024', satisfies: 'foundations', countsForMajor: true },
  { code: 'EPS C20', title: 'Earthquakes in Your Backyard', units: 3, grade: 'A+', points: 12, term: 'Fall 2024', satisfies: 'breadth' },
  // Spring 2025
  { code: 'COMPSCI 61B', title: 'Data Structures', units: 4, grade: 'B+', points: 13.2, term: 'Spring 2025', satisfies: 'data-structures', countsForMajor: true },
  { code: 'DESINV 98', title: 'Directed Group Study', units: 2, grade: 'P', term: 'Spring 2025' },
  { code: 'INTEGBI 35AC', title: 'Human Biological Variation', units: 4, grade: 'A+', points: 16, term: 'Spring 2025', satisfies: 'breadth', note: 'American Cultures' },
  { code: 'MATH 1B', title: 'Calculus', units: 4, grade: 'A-', points: 14.8, term: 'Spring 2025', satisfies: 'calc-2', countsForMajor: true },
  { code: 'THEATER R1A', title: 'Performance: Writing & Research', units: 4, grade: 'A', points: 16, term: 'Spring 2025', satisfies: 'reading-composition' },
  // Fall 2025
  { code: 'DATA C100', title: 'Principles & Techniques of Data Science', units: 4, grade: 'A+', points: 16, term: 'Fall 2025', satisfies: 'data100', countsForMajor: true },
  { code: 'DATA C104', title: 'Human Contexts & Ethics of Data', units: 4, grade: 'A-', points: 14.8, term: 'Fall 2025', satisfies: 'human-contexts-ethics', countsForMajor: true },
  { code: 'ENGIN 183A', title: 'A. Richard Newton Lecture Series', units: 1, grade: 'P', term: 'Fall 2025' },
  { code: 'MATH 56', title: 'Linear Algebra', units: 4, grade: 'A+', points: 16, term: 'Fall 2025', satisfies: 'linear-algebra', countsForMajor: true },
  // Spring 2026
  { code: 'COMPSCI 70', title: 'Discrete Mathematics & Probability Theory', units: 4, grade: 'C-', points: 6.8, term: 'Spring 2026', note: 'Counts for units; useful prep for C140 probability.' },
  { code: 'COMPSCI 168', title: 'Introduction to the Internet', units: 4, grade: 'F', points: 0, term: 'Spring 2026', note: 'No units earned (F). On the C&ID list, but C&ID is covered by C101+144 — not needed for the major. Repeat-for-GPA candidate.' },
  { code: 'COMPSCI 188', title: 'Introduction to Artificial Intelligence', units: 4, grade: 'D-', points: 2.8, term: 'Spring 2026', note: 'Below C- — does not count for the major. Not required (Modeling req met elsewhere). Repeat-for-GPA candidate.' },
  // Fall 2026 (planned / in progress)
  { code: 'DATA C101', title: 'Data Engineering', units: 4, term: 'Fall 2026', satisfies: 'cid', countsForMajor: true, note: 'Enrolled. C&ID (with DATA 144).' },
  { code: 'DATA 144', title: 'Data Mining & Analytics', units: 3, term: 'Fall 2026', satisfies: 'cid', countsForMajor: true, note: 'Enrolled. C&ID (with DATA C101).' },
  { code: 'DATA C140', title: 'Probability for Data Science', units: 4, term: 'Fall 2026', satisfies: 'probability', countsForMajor: true, note: 'Waitlisted #3 of 280 (likely to clear). Satisfies the Probability requirement.' },
];

// ── Major + lower-division requirement audit ──────────────────
export const REQUIREMENTS: Requirement[] = [
  // Lower division (7)
  { key: 'foundations', area: 'lower', name: 'Foundations of Data Science', detail: 'Data C8 or Stat 20', status: 'done', satisfiedBy: 'DATA C8' },
  { key: 'calc-1', area: 'lower', name: 'Calculus I', detail: 'Math 1A/N1A/51 or exam credit', status: 'done', satisfiedBy: 'AP credit', note: 'Confirm AP Calc satisfies Calc I on your degree audit.' },
  { key: 'calc-2', area: 'lower', name: 'Calculus II', detail: 'Math 1B/52/N1B or exam credit', status: 'done', satisfiedBy: 'MATH 1B' },
  { key: 'linear-algebra', area: 'lower', name: 'Linear Algebra', detail: 'Math 54/56/W54, EECS 16A+16B, or Physics 89', status: 'done', satisfiedBy: 'MATH 56' },
  { key: 'program-structures', area: 'lower', name: 'Program Structures', detail: 'CS 61A or Data C88C', status: 'done', satisfiedBy: 'COMPSCI 61A' },
  { key: 'data-structures', area: 'lower', name: 'Data Structures', detail: 'CS 61B or 61BL', status: 'done', satisfiedBy: 'COMPSCI 61B' },
  { key: 'domain-lower', area: 'lower', name: 'Domain Emphasis — lower div', detail: 'Business & Industrial Analytics root course', status: 'remaining', options: 'ECON 1, ECON 2, or MATH 53 (multivariable calc)' },
  // Upper division (8 courses / ≥28 ud units)
  { key: 'data100', area: 'upper', name: 'Data C100', detail: 'Principles & Techniques of Data Science', status: 'done', satisfiedBy: 'DATA C100' },
  { key: 'probability', area: 'upper', name: 'Probability', detail: 'DATA/STAT C140, STAT 134, EECS 126, MATH 106, or IND ENG 172', status: 'planned', satisfiedBy: 'DATA C140 (Fall 2026, waitlist)' },
  { key: 'cid', area: 'upper', name: 'Computational & Inferential Depth', detail: '2 courses, ≥7 units from the C&ID list', status: 'planned', satisfiedBy: 'DATA C101 (4u) + DATA 144 (3u) = 7u, Fall 2026' },
  { key: 'modeling', area: 'upper', name: 'Modeling, Learning & Decision-Making', detail: '1 course', status: 'remaining', options: 'DATA C102, CS 189, STAT 154, IND ENG 142A, or DATA 188' },
  { key: 'human-contexts-ethics', area: 'upper', name: 'Human Contexts & Ethics', detail: '1 course', status: 'done', satisfiedBy: 'DATA C104' },
  { key: 'domain-upper', area: 'upper', name: 'Domain Emphasis — upper div', detail: '2 courses from Business & Industrial Analytics list', status: 'remaining', options: 'UGBA 104, UGBA 142, IND ENG 115/120/166, LEGALST 122 (pick 2)' },
];

// ── Remaining courses to finish the major (post Fall 2026) ────
export const REMAINING_COURSES = [
  { code: 'ECON 1 / 2  or  MATH 53', title: 'Domain root (lower-div) — econ or multivariable calculus', units: 4, req: 'Domain Emphasis (lower)' },
  { code: 'DATA C102 / CS 189 / STAT 154', title: 'Modeling, Learning & Decision-Making', units: 4, req: 'Modeling requirement' },
  { code: 'UGBA 104', title: 'Introduction to Business Analytics', units: 3, req: 'Domain Emphasis (upper #1)' },
  { code: 'UGBA 142', title: 'Advanced Business Analytics', units: 3, req: 'Domain Emphasis (upper #2)' },
];

// ── Graduation paths ──────────────────────────────────────────
// After Fall 2026 (assuming C140 clears + all passed): ~96.5 of 120 units.
export const GRAD_PATHS: GradPath[] = [
  {
    id: '3yr', label: '3-year sprint', gradTerm: 'Spring 2027', yearsTotal: '3.0 yrs',
    feasibility: 'not-realistic', unitsPerRemainingTerm: '~23.5 in one term',
    summary: 'Only Spring 2027 remains after Fall 2026 — ~23.5 units in a single semester exceeds the unit cap (~20.5 even with a CDSS overload petition).',
    tradeoffs: 'Would require heavy Summer 2026 + Summer 2027 enrollment AND a petition, and still leaves no slack for waitlists or a domain course being full. High burnout / GPA risk. Not advised.',
  },
  {
    id: '3.5yr', label: '3.5-year (1 sem early)', gradTerm: 'Fall 2027', yearsTotal: '3.5 yrs',
    feasibility: 'realistic', unitsPerRemainingTerm: '~12 / term over 2 terms',
    summary: 'Spring 2027 + Fall 2027 → ~23.5 units split ~12/12. All four remaining major courses plus electives fit comfortably.',
    tradeoffs: 'The realistic acceleration. Sequence Probability (Fall 2026) → Modeling (Spring 2027, needs probability prereq). Optional Summer 2027 lightens either term. Leaves room to repeat one low Spring-2026 grade.',
  },
  {
    id: '4yr', label: '4-year (official)', gradTerm: 'Spring 2028', yearsTotal: '4.0 yrs',
    feasibility: 'comfortable', unitsPerRemainingTerm: '~8 / term over 3 terms',
    summary: 'Spring 2027 + Fall 2027 + Spring 2028 → ~8 units/term. The CalCentral default.',
    tradeoffs: 'Most slack: repeat CS 168 and/or CS 188 for GPA repair, take research/internship load, and keep a light major schedule. Latest finish.',
  },
];

// ── Clubs & on-campus orgs (Charles to populate) ──────────────
export interface Org {
  name: string;
  role?: string;
  category?: string;
  since?: string;
  note?: string;
  placeholder?: boolean;
}
export const ORGS: Org[] = [
  {
    name: 'SAAS — Data Science Consulting',
    role: 'Data Science Consultant → Internal Team',
    category: 'Data Science Consulting',
    since: '2024 · 2 yrs',
    note: 'Student Association for Applied Statistics consulting arm. Consultant for 2 years, now on the Internal team. Ties to the saas-redcross-sp26 project.',
  },
  {
    name: 'Redline @ Berkeley',
    role: 'CTO',
    category: 'Startup / Venture',
    note: 'Chief Technology Officer. Owns the technical org; ties to the `redline` repo.',
  },
];

// ── Derived helpers ───────────────────────────────────────────
// Authoritative earned-units figure is the transcript's cumulative total
// (includes 30.485 transfer units not represented as course rows). The
// Berkeley-graded subtotal is available via unitsGradedAtBerkeley().
export function unitsEarned(): number {
  return PROFILE.cumulativeUnits;
}
export function unitsGradedAtBerkeley(): number {
  return COURSES
    .filter(c => c.grade && c.grade !== 'F')
    .reduce((s, c) => s + c.units, 0);
}
export function unitsInProgress(): number {
  return COURSES.filter(c => !c.grade).reduce((s, c) => s + c.units, 0);
}
export function reqCounts() {
  const all = REQUIREMENTS.length;
  const done = REQUIREMENTS.filter(r => r.status === 'done').length;
  const planned = REQUIREMENTS.filter(r => r.status === 'planned' || r.status === 'in-progress').length;
  const remaining = REQUIREMENTS.filter(r => r.status === 'remaining').length;
  return { all, done, planned, remaining };
}
export function projectedUnitsAfterFall2026(): number {
  return PROFILE.cumulativeUnits + unitsInProgress();
}
