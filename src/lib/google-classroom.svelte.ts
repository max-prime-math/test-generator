import type {
  GradebookAssessment,
  GradebookScore,
  GradebookStudent,
} from './types';

const CLIENT_ID_KEY = 'tg-google-classroom-client-id-v1';
const LINKS_KEY = 'tg-google-classroom-links-v1';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLASSROOM_API_ROOT = 'https://classroom.googleapis.com/v1';

const ENV_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_CLASSROOM_CLIENT_ID?.trim()
  || import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  || ''
);

const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.profile.emails',
].join(' ');

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type GoogleTokenClient = {
  callback: ((response: GoogleTokenResponse) => void) | null;
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type GoogleIdentityWindow = Window & typeof globalThis & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: GoogleTokenResponse) => void;
        }) => GoogleTokenClient;
        revoke: (token: string, callback?: () => void) => void;
      };
    };
  };
};

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  courseState?: string;
  alternateLink?: string;
}

export interface ClassroomCourseWork {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  state?: string;
  alternateLink?: string;
  dueDate?: ClassroomDate;
  maxPoints?: number;
  workType?: string;
  associatedWithDeveloper?: boolean;
}

export interface ClassroomStudent {
  userId: string;
  profile?: {
    id?: string;
    name?: {
      fullName?: string;
      givenName?: string;
      familyName?: string;
    };
    emailAddress?: string;
  };
}

export interface ClassroomStudentSubmission {
  id: string;
  userId: string;
  draftGrade?: number;
  assignedGrade?: number;
}

export interface ClassroomDate {
  year: number;
  month: number;
  day: number;
}

export interface GoogleClassroomLink {
  localKind: 'assessment' | 'saved-test';
  localId: string;
  courseId: string;
  courseName: string;
  courseWorkId: string;
  courseWorkTitle: string;
  alternateLink?: string;
  maxPoints?: number;
  associatedWithDeveloper?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ClassroomGradePushResult {
  updated: number;
  skipped: number;
  failed: number;
  details: string[];
}

let gisPromise: Promise<void> | null = null;

function requireBrowser(): void {
  if (typeof window === 'undefined') {
    throw new Error('Google Classroom requires a browser environment');
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadGoogleIdentityScript(): Promise<void> {
  requireBrowser();
  if ((window as GoogleIdentityWindow).google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) gisPromise = loadScript(GIS_SRC);
  return gisPromise;
}

function loadLinks(): GoogleClassroomLink[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LINKS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isClassroomLink);
  } catch {
    return [];
  }
}

function isClassroomLink(value: unknown): value is GoogleClassroomLink {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<GoogleClassroomLink>;
  return (
    (item.localKind === 'assessment' || item.localKind === 'saved-test')
    && typeof item.localId === 'string'
    && typeof item.courseId === 'string'
    && typeof item.courseName === 'string'
    && typeof item.courseWorkId === 'string'
    && typeof item.courseWorkTitle === 'string'
  );
}

async function parseClassroomError(response: Response): Promise<Error> {
  try {
    const payload = await response.json() as { error?: { message?: string; status?: string } };
    const message = payload.error?.message?.trim();
    const status = payload.error?.status?.trim();
    if (message) return new Error(status ? `${message} (${status})` : message);
  } catch {
    // Fall through to status text.
  }
  return new Error(`Google Classroom request failed (${response.status} ${response.statusText})`);
}

function pageParams(base: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({ pageSize: '100', ...base });
}

function classroomDateFromInput(value: string): ClassroomDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function scoreByStudent(scores: GradebookScore[]): Map<string, GradebookScore> {
  return new Map(scores.map((score) => [score.studentId, score]));
}

function normalizeEmail(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function submissionForUserId(submissions: ClassroomStudentSubmission[]): Map<string, ClassroomStudentSubmission> {
  return new Map(submissions.map((submission) => [submission.userId, submission]));
}

function studentUserIdByEmail(students: ClassroomStudent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const student of students) {
    const email = normalizeEmail(student.profile?.emailAddress);
    if (email) map.set(email, student.userId || student.profile?.id || '');
  }
  return map;
}

export class GoogleClassroomService {
  clientId = $state(ENV_CLIENT_ID || localStorage.getItem(CLIENT_ID_KEY) || '');
  accessToken = $state<string | null>(null);
  tokenExpiresAt = $state(0);
  links = $state<GoogleClassroomLink[]>(loadLinks());

  get envConfigured(): boolean {
    return Boolean(ENV_CLIENT_ID);
  }

  get configured(): boolean {
    return Boolean(this.clientId.trim());
  }

  get authenticated(): boolean {
    return Boolean(this.accessToken && Date.now() < this.tokenExpiresAt);
  }

  async connect(input: { clientId?: string } = {}): Promise<void> {
    const providedClientId = input.clientId?.trim() ?? '';
    if (providedClientId) {
      this.clientId = providedClientId;
      localStorage.setItem(CLIENT_ID_KEY, providedClientId);
    }

    const clientId = this.clientId.trim();
    if (!clientId) throw new Error('Google OAuth client ID required');

    await loadGoogleIdentityScript();
    const token = await this.#requestAccessToken(clientId, false)
      .catch(() => this.#requestAccessToken(clientId, true));
    this.accessToken = token.access_token ?? null;
    this.tokenExpiresAt = Date.now() + Math.max((token.expires_in ?? 0) - 30, 0) * 1000;
  }

  disconnect(): void {
    if (this.accessToken) {
      try {
        (window as GoogleIdentityWindow).google?.accounts?.oauth2?.revoke(this.accessToken);
      } catch {
        // Clear local state even if revoke fails.
      }
    }
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  async listCourses(): Promise<ClassroomCourse[]> {
    const courses: ClassroomCourse[] = [];
    let pageToken = '';

    do {
      const params = pageParams({ teacherId: 'me', courseStates: 'ACTIVE' });
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await this.#classroomJson<{ courses?: ClassroomCourse[]; nextPageToken?: string }>(`/courses?${params.toString()}`);
      courses.push(...(payload.courses ?? []));
      pageToken = payload.nextPageToken ?? '';
    } while (pageToken);

    return courses.sort((left, right) => left.name.localeCompare(right.name));
  }

  async listStudents(courseId: string): Promise<ClassroomStudent[]> {
    const students: ClassroomStudent[] = [];
    let pageToken = '';

    do {
      const params = pageParams();
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await this.#classroomJson<{ students?: ClassroomStudent[]; nextPageToken?: string }>(
        `/courses/${encodeURIComponent(courseId)}/students?${params.toString()}`,
      );
      students.push(...(payload.students ?? []));
      pageToken = payload.nextPageToken ?? '';
    } while (pageToken);

    return students;
  }

  async listCourseWork(courseId: string): Promise<ClassroomCourseWork[]> {
    const work: ClassroomCourseWork[] = [];
    let pageToken = '';

    do {
      const params = pageParams();
      params.append('courseWorkStates', 'PUBLISHED');
      params.append('courseWorkStates', 'DRAFT');
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await this.#classroomJson<{ courseWork?: ClassroomCourseWork[]; nextPageToken?: string }>(
        `/courses/${encodeURIComponent(courseId)}/courseWork?${params.toString()}`,
      );
      work.push(...(payload.courseWork ?? []));
      pageToken = payload.nextPageToken ?? '';
    } while (pageToken);

    return work.sort((left, right) => left.title.localeCompare(right.title));
  }

  async createCourseWork(input: {
    course: ClassroomCourse;
    assessment: GradebookAssessment;
    dueDate: string;
  }): Promise<ClassroomCourseWork> {
    const dueDate = classroomDateFromInput(input.dueDate);
    const body: Record<string, unknown> = {
      title: input.assessment.savedTestName || input.assessment.title || 'TestGen assessment',
      description: [
        'Created from TestGen.',
        'The test paper is not attached by default.',
        `Local assessment ID: ${input.assessment.id}`,
      ].join('\n'),
      state: 'PUBLISHED',
      workType: 'ASSIGNMENT',
      maxPoints: Math.max(0, Math.round(input.assessment.totalPoints)),
    };
    if (dueDate) body.dueDate = dueDate;

    const work = await this.#classroomJson<ClassroomCourseWork>(
      `/courses/${encodeURIComponent(input.course.id)}/courseWork`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(body),
      },
    );
    this.linkCourseWork('assessment', input.assessment.id, input.course, work);
    this.linkCourseWork('saved-test', input.assessment.savedTestId, input.course, work);
    return work;
  }

  linkCourseWork(
    localKind: GoogleClassroomLink['localKind'],
    localId: string,
    course: ClassroomCourse,
    work: ClassroomCourseWork,
  ): GoogleClassroomLink {
    const now = Date.now();
    const existing = this.links.find((link) => link.localKind === localKind && link.localId === localId);
    const next: GoogleClassroomLink = {
      localKind,
      localId,
      courseId: course.id,
      courseName: course.name,
      courseWorkId: work.id,
      courseWorkTitle: work.title,
      alternateLink: work.alternateLink,
      maxPoints: work.maxPoints,
      associatedWithDeveloper: work.associatedWithDeveloper,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.links = existing
      ? this.links.map((link) => (link.localKind === localKind && link.localId === localId ? next : link))
      : [...this.links, next];
    localStorage.setItem(LINKS_KEY, JSON.stringify(this.links));
    return next;
  }

  findLink(localKind: GoogleClassroomLink['localKind'], localId: string): GoogleClassroomLink | null {
    return this.links.find((link) => link.localKind === localKind && link.localId === localId) ?? null;
  }

  async listSubmissions(courseId: string, courseWorkId: string): Promise<ClassroomStudentSubmission[]> {
    const submissions: ClassroomStudentSubmission[] = [];
    let pageToken = '';

    do {
      const params = pageParams();
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await this.#classroomJson<{ studentSubmissions?: ClassroomStudentSubmission[]; nextPageToken?: string }>(
        `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/studentSubmissions?${params.toString()}`,
      );
      submissions.push(...(payload.studentSubmissions ?? []));
      pageToken = payload.nextPageToken ?? '';
    } while (pageToken);

    return submissions;
  }

  async pushGrades(input: {
    assessment: GradebookAssessment;
    students: GradebookStudent[];
    scores: GradebookScore[];
    courseId: string;
    courseWorkId: string;
  }): Promise<ClassroomGradePushResult> {
    const classroomStudents = await this.listStudents(input.courseId);
    const submissions = await this.listSubmissions(input.courseId, input.courseWorkId);
    const userIdByEmail = studentUserIdByEmail(classroomStudents);
    const submissionByUserId = submissionForUserId(submissions);
    const scoresByStudent = scoreByStudent(input.scores);
    const result: ClassroomGradePushResult = {
      updated: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };

    for (const student of input.students) {
      if (!student.active) {
        result.skipped += 1;
        continue;
      }

      const email = normalizeEmail(student.email);
      if (!email) {
        result.skipped += 1;
        result.details.push(`${student.displayName}: no local email to match Classroom roster.`);
        continue;
      }

      const userId = userIdByEmail.get(email);
      if (!userId) {
        result.skipped += 1;
        result.details.push(`${student.displayName}: no Classroom student matched ${student.email}.`);
        continue;
      }

      const submission = submissionByUserId.get(userId);
      if (!submission) {
        result.skipped += 1;
        result.details.push(`${student.displayName}: no Classroom submission found.`);
        continue;
      }

      const score = scoresByStudent.get(student.id);
      if (!score || score.state !== 'normal' || score.points === null) {
        result.skipped += 1;
        result.details.push(`${student.displayName}: no normal numeric score to push.`);
        continue;
      }

      try {
        await this.#classroomJson<ClassroomStudentSubmission>(
          `/courses/${encodeURIComponent(input.courseId)}/courseWork/${encodeURIComponent(input.courseWorkId)}/studentSubmissions/${encodeURIComponent(submission.id)}?updateMask=draftGrade,assignedGrade`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({
              draftGrade: score.points,
              assignedGrade: score.points,
            }),
          },
        );
        result.updated += 1;
      } catch (error) {
        result.failed += 1;
        result.details.push(`${student.displayName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  async #requestAccessToken(clientId: string, interactive: boolean): Promise<GoogleTokenResponse> {
    const oauth2 = (window as GoogleIdentityWindow).google?.accounts?.oauth2;
    if (!oauth2) throw new Error('Google Identity Services is unavailable');

    return new Promise<GoogleTokenResponse>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: CLASSROOM_SCOPES,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          if (!response.access_token) {
            reject(new Error('Google Classroom did not return an access token'));
            return;
          }
          resolve(response);
        },
      });

      client.callback = (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google Classroom did not return an access token'));
          return;
        }
        resolve(response);
      };

      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  async #classroomJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.#requireToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${CLASSROOM_API_ROOT}${path}`, { ...init, headers });
    if (!response.ok) throw await parseClassroomError(response);
    return await response.json() as T;
  }

  #requireToken(): string {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      throw new Error('Google Classroom needs to be reconnected');
    }
    return this.accessToken;
  }
}

export const googleClassroom = new GoogleClassroomService();
