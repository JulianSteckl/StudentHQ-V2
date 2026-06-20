import { GPA_MAP, TOOLS_DATA } from './data.js';

const TOOL_IDS = new Set(TOOLS_DATA.map(t => t.id));

const newGradeHistoryId = () => 'gh-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const newToolOpenId = () => 'to-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const normalizeGradeHistory = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map((item, i) => ({
    id: item?.id ? String(item.id) : `gh-${i}`,
    subjectId: String(item?.subjectId || ''),
    grade: String(item?.grade || ''),
    at: Number(item?.at) || 0,
  })).filter(x => x.subjectId && x.grade && GPA_MAP[x.grade] != null);
};

const backfillGradeHistoryFromGrades = (grades, history) => {
  const hist = normalizeGradeHistory(history);
  const seen = new Set(hist.map(h => h.subjectId));
  const seeded = [];
  Object.entries(grades && typeof grades === 'object' ? grades : {}).forEach(([subjectId, grade]) => {
    if (!subjectId || GPA_MAP[grade] == null || seen.has(subjectId)) return;
    seeded.push({ id: newGradeHistoryId(), subjectId, grade: String(grade), at: Date.now() });
  });
  return seeded.length ? [...seeded, ...hist].slice(0, 200) : hist;
};

const appendGradeHistory = (history, subjectId, grade) => {
  if (!subjectId || !grade || GPA_MAP[grade] == null) return normalizeGradeHistory(history);
  return [{ id: newGradeHistoryId(), subjectId, grade, at: Date.now() }, ...normalizeGradeHistory(history)].slice(0, 200);
};

const gradeSparklinePoints = (history, subjectId, width = 108, height = 18) => {
  const entries = normalizeGradeHistory(history).filter(h => h.subjectId === subjectId).sort((a, b) => a.at - b.at).slice(-8);
  if (!entries.length) return null;
  const vals = entries.map(e => GPA_MAP[e.grade] || 0);
  const min = entries.length === 1 ? 0 : Math.min(...vals);
  const max = entries.length === 1 ? 4 : Math.max(...vals);
  const range = max - min || 1;
  if (entries.length === 1) {
    const y = height - 4 - ((vals[0] - min) / range) * (height - 8);
    return `${4},${y} ${width - 4},${y}`;
  }
  return vals.map((v, i) => {
    const x = 4 + (i / (vals.length - 1)) * (width - 8);
    const y = height - 4 - ((v - min) / range) * (height - 8);
    return `${x},${y}`;
  }).join(' ');
};

const normalizeToolOpens = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map((item, i) => ({
    id: item?.id ? String(item.id) : `to-${i}`,
    toolId: String(item?.toolId || ''),
    at: Number(item?.at) || 0,
  })).filter(x => x.toolId && TOOL_IDS.has(x.toolId) && x.at > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 200);
};

const appendToolOpen = (opens, toolId) => {
  if (!toolId || !TOOL_IDS.has(toolId)) return normalizeToolOpens(opens);
  return [{ id: newToolOpenId(), toolId, at: Date.now() }, ...normalizeToolOpens(opens)].slice(0, 200);
};

const startOfWeekMs = () => {
  const d = new Date();
  const diff = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
};

const toolOpensThisWeek = (opens) => normalizeToolOpens(opens).filter(o => o.at >= startOfWeekMs()).length;

const toolOpenCounts = (opens) => {
  const counts = {};
  normalizeToolOpens(opens).forEach(o => { counts[o.toolId] = (counts[o.toolId] || 0) + 1; });
  return counts;
};

const toolById = (id) => TOOLS_DATA.find(t => t.id === id) || null;

const formatToolWhen = (at) => {
  if (!at) return '—';
  const diff = Date.now() - at;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const buildToolUsageInsight = (opens) => {
  const counts = toolOpenCounts(opens);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [topId, topCount] = ranked[0];
  const tool = toolById(topId);
  if (!tool) return null;
  if (ranked.length === 1 && topCount === 1) return `${tool.name} was your first tracked open.`;
  return `${tool.name} is your most-used tool (${topCount} open${topCount === 1 ? '' : 's'}).`;
};

const DEFAULT_DASHBOARD_PREFS = {
  stats: true,
  week: true,
  period: true,
  gamePlan: true,
  bottomRow: true,
};

const normalizeDashboardPrefs = (prefs) => {
  if (!prefs || typeof prefs !== 'object') return { ...DEFAULT_DASHBOARD_PREFS };
  return {
    stats: prefs.stats !== false,
    week: prefs.week !== false,
    period: prefs.period !== false,
    gamePlan: prefs.gamePlan !== false,
    bottomRow: prefs.bottomRow !== false,
  };
};

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const gpaStandingLabel = (gpaNum) => {
  if (!gpaNum || gpaNum <= 0) return 'Ready to track.';
  if (gpaNum >= 3.7) return 'Honor roll';
  if (gpaNum >= 3.5) return "Dean's list";
  if (gpaNum >= 3.0) return 'Solid standing';
  if (gpaNum >= 2.0) return 'On track';
  return 'Needs focus';
};

const buildGradeInsights = (subjects, grades) => {
  const graded = (subjects || []).filter(s => grades?.[s.id] && GPA_MAP[grades[s.id]] != null);
  if (!graded.length) return null;
  const gpas = graded.map(s => GPA_MAP[grades[s.id]] || 0);
  const avg = gpas.reduce((a, b) => a + b, 0) / gpas.length;
  const ungraded = (subjects || []).length - graded.length;
  const parts = [];
  if (avg >= 3.5) parts.push(`Your ${graded.length}-class average puts you on honor roll pace.`);
  else if (avg >= 3.0) parts.push(`You're holding a ${avg.toFixed(2)} GPA across ${graded.length} ${graded.length === 1 ? 'class' : 'classes'}.`);
  else parts.push(`Your current average is ${avg.toFixed(2)} — focus on your lowest grades to lift your GPA.`);
  if (ungraded > 0) parts.push(`${ungraded} ${ungraded === 1 ? 'class still needs' : 'classes still need'} a grade logged.`);
  if (graded.length >= 2) {
    const spread = Math.max(...gpas) - Math.min(...gpas);
    if (spread >= 0.7) {
      const low = graded.reduce((a, b) => (GPA_MAP[grades[a.id]] || 0) < (GPA_MAP[grades[b.id]] || 0) ? a : b);
      parts.push(`${low.short || low.name} is your lowest — closing that gap would lift your term GPA.`);
    }
  }
  return parts.join(' ');
};

const gradeLetterBucket = (grade) => {
  if (!grade) return null;
  const letter = String(grade)[0];
  return ['A', 'B', 'C', 'D', 'F'].includes(letter) ? letter : null;
};

const gradeDistribution = (subjects, grades) => {
  const buckets = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  (subjects || []).forEach(s => {
    const b = gradeLetterBucket(grades?.[s.id]);
    if (b) buckets[b]++;
  });
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  return { buckets, total };
};

const exportGradesCsv = (profile, userData) => {
  const subjects = profile?.subjects || [];
  const grades = userData?.grades || {};
  const homework = userData?.homework || [];
  const rows = [
    ['Subject', 'Short', 'Grade', 'GPA', 'Open Homework'].join(','),
    ...subjects.map(s => {
      const grade = grades[s.id] || '';
      const gpa = GPA_MAP[grade] != null ? GPA_MAP[grade] : '';
      const hwOpen = homework.filter(h => h.subj === s.id && !h.done).length;
      return [csvCell(s.name), csvCell(s.short), csvCell(grade), csvCell(gpa), hwOpen].join(',');
    }),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `scholar-grades-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
};

const normalizeUserData = (raw) => {
  const d = raw || {};
  const grades = d.grades && typeof d.grades === 'object' ? d.grades : {};
  return {
    homework: Array.isArray(d.homework) ? d.homework : [],
    grades,
    gradeHistory: backfillGradeHistoryFromGrades(grades, d.gradeHistory),
    streak: Number(d.streak) || 0,
    quizzes: Array.isArray(d.quizzes) ? d.quizzes : [],
    notes: Array.isArray(d.notes) ? d.notes : [],
    schedule: Array.isArray(d.schedule) ? d.schedule : [],
    flashcards: Array.isArray(d.flashcards) ? d.flashcards : [],
    focusSessions: Number(d.focusSessions) || 0,
    toolOpens: normalizeToolOpens(d.toolOpens),
    dashboardPrefs: normalizeDashboardPrefs(d.dashboardPrefs),
    updatedAt: Number(d.updatedAt) || 0,
  };
};

export {
  normalizeUserData,
  normalizeDashboardPrefs,
  DEFAULT_DASHBOARD_PREFS,
  exportGradesCsv,
  normalizeGradeHistory,
  appendGradeHistory,
  gradeSparklinePoints,
  gpaStandingLabel,
  buildGradeInsights,
  gradeDistribution,
  normalizeToolOpens,
  appendToolOpen,
  toolOpensThisWeek,
  toolOpenCounts,
  toolById,
  formatToolWhen,
  buildToolUsageInsight,
};
