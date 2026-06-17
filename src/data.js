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

/* ── Data ───────────────────────────────────────────────── */
const SUBJECTS = [
  { id:'ap-lit',  name:'AP English Lit', short:'AP Lit',  color:'#bf4a30', grade:'A−', gpa:3.7, pct:0.94 },
  { id:'ap-bio',  name:'AP Biology',     short:'Bio',     color:'#3a8a52', grade:'B+', gpa:3.3, pct:0.87 },
  { id:'alg2',    name:'Algebra II',     short:'Alg II',  color:'#2a60a0', grade:'A',  gpa:4.0, pct:0.91 },
  { id:'us-hist', name:'U.S. History',   short:'History', color:'#b07020', grade:'B',  gpa:3.0, pct:0.82 },
  { id:'spanish', name:'Spanish III',    short:'Spanish', color:'#7a44a0', grade:'A−', gpa:3.7, pct:0.89 },
  { id:'chem',    name:'Chemistry',      short:'Chem',    color:'#208490', grade:'B+', gpa:3.3, pct:0.78 },
];

const HOMEWORK = [
  { subj:'ap-lit',  title:'Read Beloved ch. 9–12',           due:'Tonight',  urgent:true,  done:false, est:'45 min'      },
  { subj:'alg2',    title:'Problem Set 7.3 — identities',    due:'Tomorrow', urgent:true,  done:false, est:'30 min'      },
  { subj:'ap-bio',  title:'Lab report: enzyme kinetics',     due:'Wed',      urgent:false, done:false, est:'1 hr 30 min' },
  { subj:'us-hist', title:'Federalist No. 10 response',      due:'Thu',      urgent:false, done:false, est:'1 hr'        },
  { subj:'spanish', title:'Vocabulario unidad 6 flashcards', due:'Fri',      urgent:false, done:false, est:'20 min'      },
  { subj:'chem',    title:'Moles & Avogadro problem set',    due:'Done',     urgent:false, done:true,  est:'45 min'      },
];

const QUIZZES_DATA = [
  { subj:'alg2',    title:'Unit 7 — Trig Identities',  date:'Tomorrow', topics:['sin/cos identities','sum formulas','double-angle'], confidence:0.72 },
  { subj:'ap-bio',  title:'Enzyme Kinetics Quiz',       date:'Wed',      topics:['Michaelis-Menten','inhibition','Km & Vmax'],       confidence:0.58 },
  { subj:'ap-lit',  title:'Beloved — Chapters 1–12',   date:'Fri',      topics:['trauma & memory','rememory','Morrison style'],      confidence:0.81 },
  { subj:'us-hist', title:'The Federalist Era Test',    date:'Next Mon', topics:['Hamilton vs Jefferson','XYZ Affair','Jay Treaty'],  confidence:0.45 },
];

const NOTES_DATA = [
  { id:'n1', subj:'alg2',    title:'Trig Identities — Cheat Sheet', date:'Jun 12', preview:'sin²θ + cos²θ = 1. All Pythagorean identities derive from this. tan θ = sin θ / cos θ…'        },
  { id:'n2', subj:'ap-bio',  title:'Enzyme Kinetics Lab Notes',      date:'Jun 11', preview:'Michaelis-Menten: v = (Vmax·[S]) / (Km+[S]). At low [S] rate is roughly linear…'               },
  { id:'n3', subj:'ap-lit',  title:'Beloved — Memory & Trauma',      date:'Jun 10', preview:'Morrison uses "rememory" as central motif — the past physically intrudes on the present…'        },
  { id:'n4', subj:'us-hist', title:'Federalist Papers Summary',       date:'Jun 9',  preview:'Federalist No. 10 argues a large republic guards against faction better than a small one…'      },
  { id:'n5', subj:'spanish', title:'Unidad 6 — Reflexive Verbs',     date:'Jun 8',  preview:'Los verbos reflexivos: me llamo, te llamas, se llama. Subject and object are the same person…'  },
  { id:'n6', subj:'chem',    title:'Moles & Avogadro\'s Number',     date:'Jun 7',  preview:'1 mole = 6.022 × 10²³ particles. Molar mass in g/mol equals atomic mass in amu…'               },
];

const SCHEDULE_DATA = [
  { period:'1', label:'First',  time:'8:00 – 8:50 AM',   subj:'ap-lit',  room:'B204',    current:false },
  { period:'2', label:'Second', time:'9:00 – 9:50 AM',   subj:'alg2',    room:'A112',    current:true  },
  { period:'3', label:'Third',  time:'10:00 – 10:50 AM', subj:'us-hist', room:'C301',    current:false },
  { period:'L', label:'Lunch',  time:'11:00 – 11:45 AM', subj:null,      room:null,      current:false },
  { period:'4', label:'Fourth', time:'11:45 AM – 12:35', subj:'ap-bio',  room:'B106',    current:false },
  { period:'5', label:'Fifth',  time:'12:45 – 1:35 PM',  subj:'spanish', room:'A205',    current:false },
  { period:'6', label:'Sixth',  time:'1:45 – 2:35 PM',   subj:'chem',    room:'B108',    current:false },
  { period:'7', label:'Study',  time:'2:45 – 3:30 PM',   subj:null,      room:'Library', current:false },
];

const DECKS = [
  { name:'Cellular Respiration', subj:'ap-bio',  n:12, m:9,  due:3 },
  { name:'Limits & Derivatives', subj:'alg2',    n:18, m:11, due:7 },
  { name:'Federalist Era',       subj:'us-hist', n:10, m:10, due:0 },
  { name:'Toni Morrison Themes', subj:'ap-lit',  n:14, m:6,  due:8 },
];

const QUIZ = [
  { q:'What is the Central Limit Theorem?', a:'Sample mean distribution approaches normal as n increases, regardless of population shape.',                 subj:'alg2'   },
  { q:'Define cellular respiration.',       a:'Glucose + O₂ → ATP + CO₂ + H₂O via glycolysis, Krebs cycle, and electron transport chain.',               subj:'ap-bio' },
  { q:'lim x→0  sin(x) / x',              a:'Equals 1. The fundamental trig limit — foundation for d/dx[sin x] = cos x.',                                subj:'alg2'   },
];

const HIST = {
  'ap-lit':  [92,95,89,97,94],
  'ap-bio':  [82,85,88,84,87],
  'alg2':    [94,89,91,93,91],
  'us-hist': [80,83,79,81,82],
  'spanish': [90,87,91,88,89],
  'chem':    [76,78,80,77,78],
};

const GPA_MAP = { 'A+':4.0,'A':4.0,'A−':3.7,'B+':3.3,'B':3.0,'B−':2.7,'C+':2.3,'C':2.0,'C−':1.7,'D':1.0,'F':0 };

const TOOLS_DATA = [
  { id:'claude',     name:'Claude',     cat:'AI',           color:'#c65030', desc:'Write, code, analyse, and reason — Anthropic\'s frontier AI.',          sessions:1, lastUsed:'8d ago', trend:-100, connected:true  },
  { id:'notion',     name:'Notion',     cat:'PRODUCTIVITY', color:'#555555', desc:'All-in-one workspace for notes, wikis, and project management.',         sessions:1, lastUsed:'8d ago', trend:-100, connected:true  },
  { id:'figma',      name:'Figma',      cat:'DESIGN',       color:'#9254de', desc:'Design and prototype interfaces collaboratively in real time.',           sessions:1, lastUsed:'8d ago', trend:-100, connected:true  },
  { id:'notebooklm', name:'NotebookLM', cat:'AI',           color:'#4285f4', desc:'Upload your notes and lecture slides — ask AI anything about them.',     sessions:0, lastUsed:'Never',  trend:0,    connected:false },
  { id:'zapier',     name:'Zapier',     cat:'PRODUCTIVITY', color:'#ff4a00', desc:'Automate repetitive tasks by connecting your apps and workflows.',       sessions:0, lastUsed:'Never',  trend:0,    connected:false },
  { id:'canva',      name:'Canva',      cat:'DESIGN',       color:'#00b4bc', desc:'Create posters, presentations, and graphics with drag-and-drop.',       sessions:0, lastUsed:'Never',  trend:0,    connected:false },
  { id:'gemini',     name:'Gemini',     cat:'AI',           color:'#4285f4', desc:'Google\'s multimodal AI for research, writing, and complex tasks.',     sessions:0, lastUsed:'Never',  trend:0,    connected:false },
];
const GPA = (SUBJECTS.reduce((a,s) => a + s.gpa, 0) / SUBJECTS.length).toFixed(2);
const subjectBy = (id) => SUBJECTS.find(s => s.id === id) || SUBJECTS[0];

const calcGPA = (subjects, grades) => {
  if (!subjects?.length) return '—';
  const vals = subjects.map(s => grades?.[s.id] != null ? (GPA_MAP[grades[s.id]] ?? null) : null).filter(v => v != null);
  if (!vals.length) return '—';
  return (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(2);
};
const makeSubjectBy = (subjects) => (id) =>
  (subjects || []).find(s => s.id === id) || { id: id||'?', name: id||'Unknown', short: id||'?', color: T.border, grade: '—', gpa: 0, pct: 0 };

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Up late.';
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  return 'Good evening.';
}
function formatDate() {
  return new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}
export { PRESET_COLORS, MONTHS, CY, makeSubjId, makeShort, SUBJECTS, HOMEWORK, QUIZZES_DATA, NOTES_DATA, SCHEDULE_DATA, DECKS, QUIZ, HIST, GPA_MAP, TOOLS_DATA, GPA, subjectBy, calcGPA, makeSubjectBy, greeting, formatDate };
