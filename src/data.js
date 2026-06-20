import { T } from './theme.js';

const PRESET_COLORS = ['#bf4a30','#3a8a52','#2a60a0','#b07020','#7a44a0','#208490','#b8943a','#9a9080'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CY = new Date().getFullYear();

function makeSubjId(name) {
  return 's-' + name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + Math.random().toString(36).slice(2,5);
}
function makeShort(name) {
  const w = name.trim().split(/\s+/);
  if (w.length === 1) return w[0].slice(0,7);
  if (['AP','Honors','IB','CP'].includes(w[0])) return w[0]+' '+w[1].slice(0,4);
  return w.map(x=>x[0]).join('').toUpperCase().slice(0,5);
}

/** Demo subjects for empty-state previews (e.g. grades radar before setup). */
const SUBJECTS = [
  { id:'ap-lit',  name:'AP English Lit', short:'AP Lit',  color:'#bf4a30', grade:'A−', gpa:3.7, pct:0.94 },
  { id:'ap-bio',  name:'AP Biology',     short:'Bio',     color:'#3a8a52', grade:'B+', gpa:3.3, pct:0.87 },
  { id:'alg2',    name:'Algebra II',     short:'Alg II',  color:'#2a60a0', grade:'A',  gpa:4.0, pct:0.91 },
  { id:'us-hist', name:'U.S. History',   short:'History', color:'#b07020', grade:'B',  gpa:3.0, pct:0.82 },
  { id:'spanish', name:'Spanish III',    short:'Spanish', color:'#7a44a0', grade:'A−', gpa:3.7, pct:0.89 },
  { id:'chem',    name:'Chemistry',      short:'Chem',    color:'#208490', grade:'B+', gpa:3.3, pct:0.78 },
];

const GPA_MAP = { 'A+':4.0,'A':4.0,'A−':3.7,'B+':3.3,'B':3.0,'B−':2.7,'C+':2.3,'C':2.0,'C−':1.7,'D':1.0,'F':0 };

const TOOLS_DATA = [
  { id:'claude',     name:'Claude',     cat:'AI',           color:'#c65030', url:'https://claude.ai',          desc:'Write, code, analyse, and reason — Anthropic\'s frontier AI.' },
  { id:'notion',     name:'Notion',     cat:'PRODUCTIVITY', color:'#555555', url:'https://www.notion.so',      desc:'All-in-one workspace for notes, wikis, and project management.' },
  { id:'figma',      name:'Figma',      cat:'DESIGN',       color:'#9254de', url:'https://www.figma.com',      desc:'Design and prototype interfaces collaboratively in real time.' },
  { id:'notebooklm', name:'NotebookLM', cat:'AI',           color:'#4285f4', url:'https://notebooklm.google.com', desc:'Upload your notes and lecture slides — ask AI anything about them.' },
  { id:'zapier',     name:'Zapier',     cat:'PRODUCTIVITY', color:'#ff4a00', url:'https://zapier.com',         desc:'Automate repetitive tasks by connecting your apps and workflows.' },
  { id:'canva',      name:'Canva',      cat:'DESIGN',       color:'#00b4bc', url:'https://www.canva.com',      desc:'Create posters, presentations, and graphics with drag-and-drop.' },
  { id:'gemini',     name:'Gemini',     cat:'AI',           color:'#4285f4', url:'https://gemini.google.com',  desc:'Google\'s multimodal AI for research, writing, and complex tasks.' },
];

const pickBestGradedSubject = (subjects, grades) => {
  const graded = (subjects || []).filter(s => grades?.[s.id] && GPA_MAP[grades[s.id]] != null);
  if (!graded.length) return null;
  return graded.reduce((a, b) => ((GPA_MAP[grades[b.id]] || 0) > (GPA_MAP[grades[a.id]] || 0) ? b : a));
};
const calcGPA = (subjects, grades) => {
  if (!subjects?.length) return '—';
  const vals = subjects.map(s => grades?.[s.id] != null ? (GPA_MAP[grades[s.id]] ?? null) : null).filter(v => v != null);
  if (!vals.length) return '—';
  return (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(2);
};
const makeSubjectBy = (subjects) => (id) =>
  (subjects || []).find(s => s.id === id) || { id: id||'?', name: id||'Unknown', short: id||'?', color: T.border, grade: '—', gpa: 0, pct: 0 };

export { PRESET_COLORS, MONTHS, CY, makeSubjId, makeShort, SUBJECTS, GPA_MAP, TOOLS_DATA, calcGPA, pickBestGradedSubject, makeSubjectBy };
