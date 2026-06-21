import { GPA_MAP, TOOLS_DATA, TOOL_CATS } from './data.js';

const BUILTIN_TOOL_IDS = new Set(TOOLS_DATA.map(t => t.id));
const VALID_TOOL_CATS = new Set(TOOL_CATS);

const newGradeHistoryId = () => 'gh-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const newToolOpenId = () => 'to-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const makeCustomToolId = (name) => {
  const slug = String(name || 'tool').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return `custom-${slug || 'tool'}-${Math.random().toString(36).slice(2, 6)}`;
};

const normalizeUrl = (url) => {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
};

const normalizeCustomTools = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set(BUILTIN_TOOL_IDS);
  const out = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const name = String(item.name || '').trim().slice(0, 48);
    const url = normalizeUrl(item.url);
    if (!name || !url) return;
    let id = String(item.id || '').trim().slice(0, 64);
    if (!id || seen.has(id) || BUILTIN_TOOL_IDS.has(id)) {
      id = makeCustomToolId(name);
      while (seen.has(id)) id = makeCustomToolId(name);
    }
    seen.add(id);
    const cat = VALID_TOOL_CATS.has(item.cat) ? item.cat : 'PRODUCTIVITY';
    const color = String(item.color || PRESET_TOOL_COLOR(i)).slice(0, 16);
    out.push({
      id,
      name,
      cat,
      color,
      url,
      desc: String(item.desc || `Open ${name} in a new tab.`).trim().slice(0, 160),
      custom: true,
    });
  });
  return out.slice(0, 50);
};

const PRESET_TOOL_COLOR = (i) => ['#bf4a30','#3a8a52','#2a60a0','#b07020','#7a44a0','#208490','#b8943a','#9a9080'][i % 8];

const getAllTools = (customTools) => [...TOOLS_DATA, ...normalizeCustomTools(customTools)];

const toolIdSet = (tools) => new Set((tools || TOOLS_DATA).map(t => t.id));

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

const normalizeToolOpens = (list, validIds = null) => {
  if (!Array.isArray(list)) return [];
  const ids = validIds || BUILTIN_TOOL_IDS;
  return list.map((item, i) => ({
    id: item?.id ? String(item.id) : `to-${i}`,
    toolId: String(item?.toolId || ''),
    at: Number(item?.at) || 0,
  })).filter(x => x.toolId && ids.has(x.toolId) && x.at > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 200);
};

const appendToolOpen = (opens, toolId, validIds = null) => {
  const ids = validIds || BUILTIN_TOOL_IDS;
  if (!toolId || !ids.has(toolId)) return normalizeToolOpens(opens, ids);
  return [{ id: newToolOpenId(), toolId, at: Date.now() }, ...normalizeToolOpens(opens, ids)].slice(0, 200);
};

const startOfWeekMs = () => {
  const d = new Date();
  const diff = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
};

const toolOpensThisWeek = (opens) => normalizeToolOpens(opens).filter(o => o.at >= startOfWeekMs()).length;

const startOfDayMs = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

const toolOpensInPeriod = (opens, period = 'all') => {
  const list = normalizeToolOpens(opens);
  if (period === 'week') return list.filter(o => o.at >= startOfWeekMs());
  return list;
};

const toolOpenCountsInPeriod = (opens, period = 'all') => {
  const counts = {};
  toolOpensInPeriod(opens, period).forEach(o => { counts[o.toolId] = (counts[o.toolId] || 0) + 1; });
  return counts;
};

const toolOpenCounts = (opens) => {
  const counts = {};
  normalizeToolOpens(opens).forEach(o => { counts[o.toolId] = (counts[o.toolId] || 0) + 1; });
  return counts;
};

const connectedToolsCount = (opens) => Object.keys(toolOpenCounts(opens)).length;

const toolLastUsedAt = (toolId, opens) => {
  const entry = normalizeToolOpens(opens).find(o => o.toolId === toolId);
  return entry?.at || 0;
};

const toolById = (id, tools) => (tools || TOOLS_DATA).find(t => t.id === id) || null;

const formatToolWhen = (at) => {
  if (!at) return '—';
  const diff = Date.now() - at;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatToolLastUsed = (at) => (!at ? 'Never' : formatToolWhen(at));

const toolDailyOpens = (toolId, opens, days = 7) => {
  const todayStart = startOfDayMs();
  const buckets = Array(days).fill(0);
  normalizeToolOpens(opens)
    .filter(o => o.toolId === toolId)
    .forEach(o => {
      const dayStart = startOfDayMs(new Date(o.at));
      const diffDays = Math.floor((todayStart - dayStart) / 86400000);
      if (diffDays >= 0 && diffDays < days) buckets[days - 1 - diffDays] += 1;
    });
  return buckets;
};

const toolActivitySparkline = (toolId, opens, width = 56, height = 18) => {
  const buckets = toolDailyOpens(toolId, opens, 7);
  if (!buckets.some(v => v > 0)) return null;
  const max = Math.max(...buckets, 1);
  if (buckets.length === 1) {
    const y = height - 2 - (buckets[0] / max) * (height - 4);
    return `2,${y} ${width - 2},${y}`;
  }
  return buckets.map((v, i) => {
    const x = 2 + (i / (buckets.length - 1)) * (width - 4);
    const y = height - 2 - (v / max) * (height - 4);
    return `${x},${y}`;
  }).join(' ');
};

const toolTrend = (toolId, opens) => {
  const now = Date.now();
  const week = 7 * 86400000;
  const list = normalizeToolOpens(opens).filter(o => o.toolId === toolId);
  const recent = list.filter(o => o.at >= now - week).length;
  const prior = list.filter(o => o.at >= now - 2 * week && o.at < now - week).length;
  if (recent === 0 && prior === 0) return 'none';
  if (recent > prior) return 'up';
  if (recent < prior) return 'down';
  return 'flat';
};

const buildToolSuggestions = (opens, { notesCount = 0, tools = TOOLS_DATA } = {}) => {
  const counts = toolOpenCounts(opens);
  const untried = tools.filter(t => !counts[t.id]);
  if (!untried.length) {
    const sorted = tools
      .map(t => ({ tool: t, sessions: counts[t.id] || 0 }))
      .sort((a, b) => a.sessions - b.sessions)
      .filter(p => p.sessions > 0);
    return sorted.slice(0, 5).map((pick, i) => ({
      tool: pick.tool,
      msg: i === 0
        ? `${pick.tool.name} is your least-used tool — revisit it to stay sharp.`
        : i === 1
        ? `${pick.tool.name} could use more sessions — you've only opened it ${pick.sessions} time${pick.sessions === 1 ? '' : 's'}.`
        : `${pick.tool.name} hasn't been opened in a while — worth revisiting.`,
      action: 'Open',
    }));
  }
  const priority = (t) => {
    if (notesCount > 0 && t.id === 'notebooklm') return 0;
    if (t.id === 'claude') return 1;
    if (t.cat === 'AI') return 2;
    return 3;
  };
  return untried.sort((a, b) => priority(a) - priority(b)).slice(0, 5).map(tool => ({
    tool,
    msg: notesCount > 0 && tool.id === 'notebooklm'
      ? `You have ${notesCount} note${notesCount === 1 ? '' : 's'} — try ${tool.name} to study from them.`
      : `You haven't tried ${tool.name} yet. ${tool.desc}`,
    action: 'Try',
  }));
};

const buildToolUsageInsight = (opens, period = 'all', totalTools = TOOLS_DATA.length) => {
  const list = toolOpensInPeriod(opens, period);
  if (!list.length) return null;
  const counts = toolOpenCountsInPeriod(opens, period);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topId, topCount] = ranked[0];
  const tool = toolById(topId);
  if (!tool) return null;

  const connected = connectedToolsCount(opens);
  const periodLabel = period === 'week' ? 'this week' : 'all time';
  const parts = [];

  if (ranked.length === 1 && topCount === 1 && period === 'all') {
    parts.push(`${tool.name} was your first tracked open.`);
  } else {
    parts.push(`${tool.name} leads ${periodLabel} with ${topCount} session${topCount === 1 ? '' : 's'}.`);
  }

  if (period === 'all' && connected < totalTools) {
    const remaining = totalTools - connected;
    parts.push(`${remaining} more tool${remaining === 1 ? '' : 's'} to explore.`);
  }

  const weekCount = toolOpensThisWeek(opens);
  if (period === 'all' && weekCount >= 3) {
    parts.push(`${weekCount} opens this week — strong momentum.`);
  } else if (period === 'all' && weekCount === 0 && list.length > 0) {
    parts.push('No opens yet this week — pick up where you left off.');
  }

  return parts.join(' ');
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
  if (gpaNum >= 3.7) return 'Excellent';
  if (gpaNum >= 3.5) return 'Very Good';
  if (gpaNum >= 3.0) return 'Good Standing';
  if (gpaNum >= 2.0) return 'On Track';
  return 'Needs Focus';
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
  const customTools = normalizeCustomTools(d.customTools);
  const allToolIds = toolIdSet(getAllTools(customTools));
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
    customTools,
    toolOpens: normalizeToolOpens(d.toolOpens, allToolIds),
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
  normalizeCustomTools,
  getAllTools,
  toolIdSet,
  makeCustomToolId,
  normalizeToolOpens,
  appendToolOpen,
  toolOpensThisWeek,
  toolOpensInPeriod,
  toolOpenCounts,
  toolOpenCountsInPeriod,
  connectedToolsCount,
  toolLastUsedAt,
  formatToolLastUsed,
  toolActivitySparkline,
  toolTrend,
  buildToolSuggestions,
  toolById,
  formatToolWhen,
  buildToolUsageInsight,
};
