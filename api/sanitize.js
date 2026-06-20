const MAX_GRADES_KEYS = 50;
const MAX_BODY_JSON_BYTES = 1024 * 1024;

function str(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function bool(value) {
  return !!value;
}

function capArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function capStringArray(arr, maxItems, maxLen) {
  return capArray(arr, maxItems).map(x => str(x, maxLen)).filter(Boolean);
}

function sanitizeGrades(grades) {
  if (!grades || typeof grades !== 'object' || Array.isArray(grades)) return {};
  const out = {};
  let count = 0;
  for (const [key, val] of Object.entries(grades)) {
    if (count >= MAX_GRADES_KEYS) break;
    const k = str(key, 64);
    if (!k) continue;
    out[k] = str(val, 4);
    count++;
  }
  return out;
}

function sanitizeHomework(list) {
  return capArray(list, 1000).map(item => {
    if (!item || typeof item !== 'object') return null;
    const title = str(item.title, 500);
    if (!title) return null;
    return {
      id: str(item.id, 64),
      subj: str(item.subj, 64),
      title,
      due: str(item.due, 64),
      urgent: bool(item.urgent),
      done: bool(item.done),
      est: str(item.est, 32),
    };
  }).filter(Boolean);
}

function sanitizeNotes(list) {
  return capArray(list, 1000).map(item => {
    if (!item || typeof item !== 'object') return null;
    const title = str(item.title, 500);
    if (!title) return null;
    return {
      id: str(item.id, 64),
      subj: str(item.subj, 64),
      title,
      body: str(item.body, 50000),
      preview: str(item.preview, 500),
      date: str(item.date, 64),
      createdAt: num(item.createdAt, 0),
      updatedAt: num(item.updatedAt, 0),
    };
  }).filter(Boolean);
}

function sanitizeQuizzes(list) {
  return capArray(list, 500).map(item => {
    if (!item || typeof item !== 'object') return null;
    const title = str(item.title, 500);
    if (!title) return null;
    return {
      subj: str(item.subj, 64),
      title,
      date: str(item.date, 64),
      confidence: Math.min(1, Math.max(0, num(item.confidence, 0))),
      topics: capStringArray(item.topics, 20, 80),
    };
  }).filter(Boolean);
}

function sanitizeSchedule(list) {
  return capArray(list, 200).map(item => {
    if (!item || typeof item !== 'object') return null;
    const row = {
      period: str(item.period, 32),
      subj: str(item.subj, 64),
      room: str(item.room, 64),
      current: bool(item.current),
      time: str(item.time, 32),
    };
    return row.period || row.subj || row.room ? row : null;
  }).filter(Boolean);
}

function sanitizeFlashcards(list) {
  return capArray(list, 500).map(item => {
    if (!item || typeof item !== 'object') return null;
    const q = str(item.q, 2000);
    const a = str(item.a, 2000);
    if (!q && !a) return null;
    return {
      id: str(item.id, 64),
      q,
      a,
      subj: str(item.subj, 64),
      createdAt: num(item.createdAt, 0),
      updatedAt: num(item.updatedAt, 0),
    };
  }).filter(Boolean);
}

function sanitizeGradeHistory(list) {
  return capArray(list, 200).map(item => {
    if (!item || typeof item !== 'object') return null;
    const subjectId = str(item.subjectId, 64);
    const grade = str(item.grade, 4);
    if (!subjectId || !grade) return null;
    return {
      id: str(item.id, 64),
      subjectId,
      grade,
      at: num(item.at, 0),
    };
  });
}

function sanitizeToolOpens(list) {
  return capArray(list, 200).map(item => {
    if (!item || typeof item !== 'object') return null;
    const toolId = str(item.toolId, 64);
    const at = num(item.at, 0);
    if (!toolId || at <= 0) return null;
    return {
      id: str(item.id, 64),
      toolId,
      at,
    };
  });
}

const VALID_TOOL_CATS = new Set(['AI', 'DESIGN', 'PRODUCTIVITY']);

function sanitizeCustomTools(list) {
  return capArray(list, 50).map(item => {
    if (!item || typeof item !== 'object') return null;
    const name = str(item.name, 48);
    let url = str(item.url, 512);
    if (!name || !url) return null;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { return null; }
    const cat = VALID_TOOL_CATS.has(item.cat) ? item.cat : 'PRODUCTIVITY';
    return {
      id: str(item.id, 64),
      name,
      cat,
      color: str(item.color, 16) || '#9a9080',
      url,
      desc: str(item.desc, 160) || `Open ${name} in a new tab.`,
      custom: true,
    };
  });
}

function sanitizeDashboardPrefs(prefs) {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return { stats: true, week: true, period: true, gamePlan: true, bottomRow: true };
  }
  return {
    stats: prefs.stats !== false,
    week: prefs.week !== false,
    period: prefs.period !== false,
    gamePlan: prefs.gamePlan !== false,
    bottomRow: prefs.bottomRow !== false,
  };
}

function sanitizePictureUrl(value) {
  const s = str(value, 512);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return '';
    return s;
  } catch {
    return '';
  }
}

function sanitizeUserData(body, email) {
  return {
    email,
    homework: sanitizeHomework(body.homework),
    quizzes: sanitizeQuizzes(body.quizzes),
    notes: sanitizeNotes(body.notes),
    schedule: sanitizeSchedule(body.schedule),
    flashcards: sanitizeFlashcards(body.flashcards),
    grades: sanitizeGrades(body.grades),
    gradeHistory: sanitizeGradeHistory(body.gradeHistory),
    toolOpens: sanitizeToolOpens(body.toolOpens),
    customTools: sanitizeCustomTools(body.customTools),
    focusSessions: Number.isFinite(body.focusSessions) ? Math.max(0, body.focusSessions) : 0,
    dashboardPrefs: sanitizeDashboardPrefs(body.dashboardPrefs),
    streak: Number.isFinite(body.streak) ? body.streak : 0,
    updatedAt: Number.isFinite(body.updatedAt) ? body.updatedAt : Date.now(),
    savedAt: Date.now(),
  };
}

function sanitizeProfile(body, email) {
  const rawSubjects = Array.isArray(body.subjects) ? body.subjects.slice(0, 20) : [];
  const subjects = rawSubjects.map(s => ({
    id: str(s && s.id, 64),
    name: str(s && s.name, 80),
    short: str(s && s.short, 24),
    color: str(s && s.color, 16),
    grade: str(s && s.grade, 4),
    gpa: num(s && s.gpa, 0),
    pct: num(s && s.pct, 0),
  }));
  return {
    email,
    name: str(body.name, 120),
    picture: sanitizePictureUrl(body.picture),
    grade: str(body.grade, 32),
    school: str(body.school, 120),
    subjects,
    completedAt: num(body.completedAt, Date.now()),
    updatedAt: Date.now(),
  };
}

function bodyTooLarge(body) {
  try {
    return JSON.stringify(body || {}).length > MAX_BODY_JSON_BYTES;
  } catch {
    return true;
  }
}

module.exports = {
  sanitizeUserData,
  sanitizeProfile,
  bodyTooLarge,
  MAX_BODY_JSON_BYTES,
};
