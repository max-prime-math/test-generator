export interface ParsedRosterStudent {
  sisId?: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  sourceSection?: string;
  sourceTerm?: string;
}

export interface RosterImportParseResult {
  students: ParsedRosterStudent[];
  skippedRows: number;
  warnings: string[];
}

type ColumnMap = {
  sisId?: number;
  firstName?: number;
  lastName?: number;
  displayName?: number;
  email?: number;
  section?: number;
  term?: number;
  active?: number;
};

const HEADER_ALIASES: Record<keyof ColumnMap, Set<string>> = {
  sisId: aliasSet([
    'student number',
    'student_number',
    'student no',
    'student_number',
    'student id',
    'studentid',
    'studentidnumber',
    'student_number',
    'studentnumber',
    'id number',
    'local id',
    'sis id',
    'sisid',
    'number',
  ]),
  firstName: aliasSet([
    'first',
    'first name',
    'first_name',
    'firstname',
    'given name',
    'preferred first name',
    'preferred_first_name',
  ]),
  lastName: aliasSet([
    'last',
    'last name',
    'last_name',
    'lastname',
    'surname',
    'family name',
  ]),
  displayName: aliasSet([
    'name',
    'student',
    'student name',
    'student_name',
    'full name',
    'full_name',
    'lastfirst',
    'last first',
    'lastfirstmiddle',
  ]),
  email: aliasSet([
    'email',
    'e-mail',
    'email address',
    'email_address',
    'student email',
    'student_email',
    'student e-mail',
    'web id',
    'student web id',
    'student_web_id',
  ]),
  section: aliasSet([
    'section',
    'section number',
    'section_number',
    'course section',
    'course_section',
    'class',
    'class name',
    'course',
    'course name',
    'course_name',
    'expression',
    'period',
  ]),
  term: aliasSet([
    'term',
    'term name',
    'term_name',
    'school year',
    'school_year',
    'year',
  ]),
  active: aliasSet([
    'active',
    'enrolled',
    'enrollment status',
    'enrollment_status',
    'status',
  ]),
};

export function parseRosterImport(text: string): RosterImportParseResult {
  const normalized = text.replace(/^\uFEFF/, '').trim();
  if (!normalized) {
    return { students: [], skippedRows: 0, warnings: ['The import file was empty.'] };
  }

  const delimiter = detectDelimiter(normalized);
  const rows = parseDelimitedRows(normalized, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  if (rows.length === 0) {
    return { students: [], skippedRows: 0, warnings: ['No roster rows were found.'] };
  }

  const header = rows[0];
  const map = mapHeaders(header);
  const recognized = Object.values(map).filter((index) => index !== undefined).length;
  const dataRows = recognized > 0 ? rows.slice(1) : rows;
  const warnings: string[] = [];
  if (recognized === 0) {
    warnings.push('No recognizable header row was found; imported each row as a name where possible.');
  }

  const students: ParsedRosterStudent[] = [];
  let skippedRows = 0;
  for (const row of dataRows) {
    if (shouldSkipByStatus(valueAt(row, map.active))) {
      skippedRows += 1;
      continue;
    }

    const parsedName = parseStudentName(
      valueAt(row, map.firstName),
      valueAt(row, map.lastName),
      valueAt(row, map.displayName) || (recognized === 0 ? row[0] : ''),
    );
    if (!parsedName.displayName) {
      skippedRows += 1;
      continue;
    }

    students.push({
      sisId: cleanOptional(valueAt(row, map.sisId) || (recognized === 0 ? row[1] : '')),
      firstName: parsedName.firstName,
      lastName: parsedName.lastName,
      displayName: parsedName.displayName,
      email: cleanEmail(valueAt(row, map.email)),
      sourceSection: cleanOptional(valueAt(row, map.section)),
      sourceTerm: cleanOptional(valueAt(row, map.term)),
    });
  }

  return { students, skippedRows, warnings };
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = ['\t', ',', ';'];
  return candidates
    .map((delimiter) => ({ delimiter, count: countDelimiter(firstLine, delimiter) }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ',';
}

function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === delimiter) count += 1;
  }
  return count;
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (char === '\r' && next === '\n') index += 1;
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function mapHeaders(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    for (const field of Object.keys(HEADER_ALIASES) as Array<keyof ColumnMap>) {
      if (map[field] === undefined && HEADER_ALIASES[field].has(key)) {
        map[field] = index;
      }
    }
  });
  return map;
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[#()]/g, ' ')
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStudentName(first: string, last: string, display: string): { firstName: string; lastName: string; displayName: string } {
  const firstName = first.trim();
  const lastName = last.trim();
  if (firstName || lastName) {
    return {
      firstName,
      lastName,
      displayName: cleanOptional(display) || `${firstName} ${lastName}`.trim(),
    };
  }

  const displayName = display.trim();
  if (!displayName) return { firstName: '', lastName: '', displayName: '' };
  const commaParts = displayName.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      firstName: commaParts.slice(1).join(' '),
      lastName: commaParts[0],
      displayName: `${commaParts.slice(1).join(' ')} ${commaParts[0]}`.trim(),
    };
  }

  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '', displayName: parts[0] };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
    displayName,
  };
}

function valueAt(row: string[], index: number | undefined): string {
  return index === undefined ? '' : row[index] ?? '';
}

function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function cleanEmail(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : undefined;
}

function shouldSkipByStatus(value: string): boolean {
  const status = value.trim().toLowerCase();
  return ['inactive', 'dropped', 'withdrawn', 'transferred', 'no', 'false'].includes(status);
}

function aliasSet(values: string[]): Set<string> {
  return new Set(values.map(normalizeHeader));
}
