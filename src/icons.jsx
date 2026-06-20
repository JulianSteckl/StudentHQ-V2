/* ── Icons ──────────────────────────────────────────────── */
const ICO = {
  today:      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="5.5"/><path d="M8 5.5V8l2 1.2"/></svg>,
  homework:   <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M5 6.5l1.5 1.5L9 5M5 10.5l1.5 1.5L9 9"/></svg>,
  quizzes:    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="8" r="5.5"/><path d="M6.5 6.3a1.6 1.6 0 1 1 2 1.4V9M8 11v.1"/></svg>,
  notes:      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h5.5l3.5 3.5V14H4V2zm5.5 0v3.5H13M5.5 8h5M5.5 11h3"/></svg>,
  flashcards: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="10" height="8" rx="1"/><path d="M5 3h8.5v7.5"/></svg>,
  schedule:   <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 7h12M5.5 1.5v3M10.5 1.5v3"/></svg>,
  grades:     <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.6 3.8 4 .5-2.9 2.8.7 4-3.4-1.9-3.4 1.9.7-4L2.4 6.3l4-.5z"/></svg>,
  tools:      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="4.5" height="4.5" rx="0.8"/><rect x="9.5" y="2" width="4.5" height="4.5" rx="0.8"/><rect x="2" y="9.5" width="4.5" height="4.5" rx="0.8"/><rect x="9.5" y="9.5" width="4.5" height="4.5" rx="0.8"/></svg>,
  subjects:   <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/></svg>,
};

/* ── Navigation config ──────────────────────────────────── */
const NAV = [
  { id:'today',      label:'Today',      icon: ICO.today      },
  { id:'homework',   label:'Homework',   icon: ICO.homework   },
  { id:'quizzes',    label:'Quizzes',    icon: ICO.quizzes    },
  { id:'notes',      label:'Notes',      icon: ICO.notes      },
  { id:'flashcards', label:'Flashcards', icon: ICO.flashcards },
  { id:'schedule',   label:'Schedule',   icon: ICO.schedule   },
  { id:'grades',     label:'Grades',     icon: ICO.grades     },
  { id:'subjects',   label:'Subjects',   icon: ICO.subjects   },
  { id:'tools',      label:'Tools',      icon: ICO.tools      },
];
export { ICO, NAV };
