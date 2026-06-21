import React from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import './styles.css';
import { T } from './theme.js';
import { GOOGLE_CLIENT_ID, authHeaders, setGoogleAccessToken, restoreGoogleToken, PROFILE_KEY, loadProfile, loadProfileByEmail, saveProfile, loadUserData, saveUserData, defaultUserData, fetchServerUserData, saveServerUserData, saveServerProfile, clearSensitiveLocalData, getSyncStatus, onSyncStatus, setSyncStatus } from './storage.js';
import { PRESET_COLORS, MONTHS, CY, makeSubjId, makeShort, SUBJECTS, GPA_MAP, TOOLS_DATA, TOOL_CATS, calcGPA, pickBestGradedSubject, makeSubjectBy } from './data.js';
import { ICO, NAV } from './icons.jsx';
import { ToolBrandIcon } from './tool-icons.jsx';
import { appendGradeHistory, gradeSparklinePoints, appendToolOpen, toolOpensThisWeek, toolOpenCounts, toolOpenCountsInPeriod, connectedToolsCount, toolLastUsedAt, formatToolLastUsed, toolActivitySparkline, toolTrend, buildToolSuggestions, toolById, formatToolWhen, buildToolUsageInsight, normalizeUserData, normalizeToolOpens, normalizeDashboardPrefs, DEFAULT_DASHBOARD_PREFS, exportGradesCsv, normalizeGradeHistory, gpaStandingLabel, buildGradeInsights, gradeDistribution, getAllTools, toolIdSet, makeCustomToolId } from './user-data-helpers.js';

const { useState, useEffect, useRef, useCallback, useMemo } = React;

function useRunScreenAction(action, onHandled, handler) {
  useEffect(() => {
    if (!action) return;
    handler(action);
    onHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
const ReactDOM = { createRoot, createPortal };

const MODAL_FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Toast({ message }) {
  if (!message) return null;
  return ReactDOM.createPortal(
    <div className="shq-toast" role="status" aria-live="polite">{message}</div>,
    document.body
  );
}

function useModalA11y(open, dismiss, panelRef) {
  const prevFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    const panel = panelRef.current;
    const raf = requestAnimationFrame(() => {
      if (!panel) return;
      const prefer = panel.querySelector('input:not([type="hidden"]), textarea, select') || panel.querySelector(MODAL_FOCUSABLE);
      (prefer || panel).focus?.();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = [...panel.querySelectorAll(MODAL_FOCUSABLE)].filter(el => !el.disabled);
      if (nodes.length < 2) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus.current && typeof prevFocus.current.focus === 'function') {
        prevFocus.current.focus();
      }
    };
  }, [open, dismiss, panelRef]);
}

// Acquire a Google access token. With silent=true it tries to renew the token
// in the background (no popup) so cloud sync keeps working after a page reload,
// as long as the user still has an active Google session.
function acquireGoogleToken(silent) {
  return new Promise((resolve) => {
    const g = window.google;
    if (!g || !g.accounts || !g.accounts.oauth2) return resolve(null);
    try {
      const client = g.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid profile email',
        callback: (resp) => {
          if (resp && resp.access_token) { setGoogleAccessToken(resp.access_token, resp.expires_in); resolve(resp.access_token); }
          else resolve(null);
        },
        error_callback: () => resolve(null),
      });
      client.requestAccessToken({ prompt: silent ? 'none' : '' });
    } catch (e) { resolve(null); }
  });
}

// Small, subtle cloud-sync indicator. When not connected, tapping it does a
// reliable (user-initiated) reconnect.
function SyncBadge({ onReconnect }) {
  const [status, setStatus] = useState(getSyncStatus());
  useEffect(() => onSyncStatus(setStatus), []);
  const map = {
    saving:  { t: 'Syncing…',                      c: T.ink3 },
    synced:  { t: 'Synced to cloud',               c: '#3a8a52' },
    error:   { t: 'Sync error — tap to reconnect', c: '#bf4a30' },
    offline: { t: 'Not connected — tap to connect', c: '#b07020' },
  };
  const s = map[status];
  if (!s) return null;
  const clickable = status === 'error' || status === 'offline';
  return ReactDOM.createPortal(
    <div onClick={clickable ? onReconnect : undefined}
      style={{position:'fixed', left:12, bottom:10, zIndex:1000, display:'flex', alignItems:'center', gap:7, fontFamily:T.mono, fontSize:10, color:s.c, background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:'6px 12px', boxShadow:'0 2px 10px rgba(24,21,14,0.06)', cursor: clickable ? 'pointer' : 'default'}}>
      <span style={{width:6, height:6, borderRadius:'50%', background:s.c}} />
      {s.t}
    </div>,
    document.body
  );
}

/* ── Sidebar ────────────────────────────────────────────── */
function AddSubjectModal({ open, onClose, onAdd, existingCount }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[(existingCount||0) % PRESET_COLORS.length]);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 320); }, [onClose]);

  useEffect(() => { if (open) { setName(''); setColor(PRESET_COLORS[(existingCount||0) % PRESET_COLORS.length]); setClosing(false); } }, [open, existingCount]);
  useModalA11y(open, dismiss, panelRef);

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ id: makeSubjId(name), name: name.trim(), short: makeShort(name), color, grade:'—', gpa:0, pct:0 });
    dismiss();
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{
        width:380, background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'36px 32px 28px', position:'relative', opacity:0, outline:'none',
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>

        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>Add a <span style={{color:T.accent}}>class</span></div>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:24}}>Up to 10 subjects · you can always change these later</div>

        <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:20}}>
          <div style={{position:'relative'}}>
            <div style={{width:36, height:36, borderRadius:10, background:color, cursor:'pointer', transition:'transform 0.15s', border:`2px solid ${T.surface}`, boxShadow:`0 0 0 1px ${T.border}`}} />
          </div>
          <input
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. AP Biology"
            autoFocus
            style={{flex:1, padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, color:T.ink, background:T.bg, outline:'none', transition:'border-color 0.15s'}}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />
        </div>

        <div style={{marginBottom:24}}>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:8}}>Color</div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {PRESET_COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)} style={{
                width:28, height:28, borderRadius:8, background:c, cursor:'pointer',
                outline: color===c ? `2.5px solid ${T.accent}` : '2.5px solid transparent',
                outlineOffset:2, transition:'outline-color 0.15s, transform 0.15s',
                transform: color===c ? 'scale(1.1)' : 'scale(1)',
              }} />
            ))}
          </div>
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer', transition:'background 0.15s'}}
            onMouseOver={e => e.currentTarget.style.background=T.bl} onMouseOut={e => e.currentTarget.style.background='transparent'}>Cancel</button>
          <button onClick={submit} disabled={!name.trim()} style={{padding:'9px 24px', border:'none', background: name.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:10, color:'#fff', letterSpacing:'0.06em', cursor: name.trim() ? 'pointer' : 'default', transition:'background 0.15s, transform 0.1s', fontWeight:600}}
            onMouseOver={e => { if(name.trim()) e.currentTarget.style.transform='scale(1.03)' }} onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>Add Subject</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ProfileModal({ open, onClose, profile, onSave }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [school, setSchool] = useState('');
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 320); }, [onClose]);

  useEffect(() => {
    if (open && profile) {
      setName(profile.name || '');
      setGrade(profile.grade || 'junior');
      setSchool(profile.school || '');
      setClosing(false);
    }
  }, [open, profile]);

  useModalA11y(open, dismiss, panelRef);

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) return;
    onSave({ ...profile, name: name.trim(), grade, school: school.trim() });
    dismiss();
  };

  const GRADES = [['freshman','Freshman'],['sophomore','Sophomore'],['junior','Junior'],['senior','Senior']];

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{
        width:380, background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'36px 32px 28px', position:'relative', opacity:0, outline:'none',
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>

        <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:20}}>
          {profile?.picture ? (
            <img src={profile.picture} alt={`${(profile?.name || 'User')} profile photo`} style={{width:40, height:40, borderRadius:10, objectFit:'cover'}} referrerPolicy="no-referrer" />
          ) : (
            <div style={{width:40, height:40, borderRadius:10, background:`linear-gradient(135deg, ${T.accent}, #9a7828)`, display:'flex', alignItems:'center', justifyContent:'center'}}>
              <span style={{fontFamily:T.serif, fontSize:18, color:'#fff', fontWeight:600}}>{(name || 'U')[0]}</span>
            </div>
          )}
          <div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:T.ink}}>Edit <span style={{color:T.accent}}>profile</span></div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.08em'}}>{profile?.email || ''}</div>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label htmlFor="profile-name" style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', display:'block', marginBottom:5}}>Name</label>
          <input id="profile-name" value={name} onChange={e => setName(e.target.value)} autoFocus
            style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s'}}
            onFocus={e => e.target.style.borderColor=T.accent} onBlur={e => e.target.style.borderColor=T.border} />
        </div>

        <div style={{marginBottom:14}}>
          <label htmlFor="profile-school" style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', display:'block', marginBottom:5}}>School</label>
          <input id="profile-school" value={school} onChange={e => setSchool(e.target.value)} placeholder="e.g. University of Cincinnati"
            style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s'}}
            onFocus={e => e.target.style.borderColor=T.accent} onBlur={e => e.target.style.borderColor=T.border} />
        </div>

        <div style={{marginBottom:24}}>
          <label style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', display:'block', marginBottom:5}}>Year</label>
          <div style={{display:'flex', gap:6}}>
            {GRADES.map(([k,l]) => (
              <button key={k} onClick={() => setGrade(k)} style={{
                flex:1, padding:'8px 0', border:`1px solid ${grade===k ? T.accent : T.border}`,
                background: grade===k ? T.accentSoft : 'transparent', borderRadius:8,
                fontFamily:T.mono, fontSize:10, color: grade===k ? T.accent : T.ink3,
                fontWeight: grade===k ? 600 : 400, cursor:'pointer', transition:'all 0.15s', letterSpacing:'0.04em',
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer', transition:'background 0.15s'}}
            onMouseOver={e => e.currentTarget.style.background=T.bl} onMouseOut={e => e.currentTarget.style.background='transparent'}>Cancel</button>
          <button onClick={submit} disabled={!name.trim()} style={{padding:'9px 24px', border:'none', background: name.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:10, color:'#fff', letterSpacing:'0.06em', cursor: name.trim() ? 'pointer' : 'default', transition:'all 0.15s', fontWeight:600}}
            onMouseOver={e => { if(name.trim()) e.currentTarget.style.transform='scale(1.03)' }} onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>Save Changes</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AIKeysModal({ open, onClose }) {
  const AI_PROVIDERS = [
    { id:'openai',    name:'OpenAI',    placeholder:'sk-...', color:'#10a37f', icon:'◈' },
    { id:'anthropic', name:'Anthropic', placeholder:'sk-ant-...', color:'#d97706', icon:'◇' },
    { id:'gemini',    name:'Google Gemini', placeholder:'AI...', color:'#4285f4', icon:'◆' },
  ];
  const KEYS_STORAGE = 'shq-v2-ai-keys';
  const loadKeys = () => { try { return JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}'); } catch { return {}; } };
  const [keys, setKeys] = useState(loadKeys);
  const [visible, setVisible] = useState({});
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(() => { setClosing(false); onClose(); }, 280); }, [onClose]);

  useModalA11y(open, dismiss, panelRef);

  const save = (id, val) => {
    const next = {...keys, [id]: val};
    setKeys(next);
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(next));
  };

  if (!open) return null;
  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }}
      style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{background:T.surface, borderRadius:12, width:420, maxHeight:'80vh', overflowY:'auto', border:`1px solid ${T.border}`, boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)', opacity:0, outline:'none', animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`}}>
        <div style={{padding:'24px 28px 0'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
            <h3 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, fontWeight:400, margin:0, color:T.ink}}>AI Connections</h3>
            <button aria-label="Close dialog" onClick={dismiss} style={{background:'none', border:'none', cursor:'pointer', padding:4, color:T.ink3, fontSize:18, lineHeight:1}}>×</button>
          </div>
          <p style={{fontFamily:T.ui, fontSize:11.5, color:T.ink3, margin:'0 0 20px', lineHeight:1.5}}>Connect your API keys to unlock AI-powered study features like smart flashcards, quiz generation, and note summaries.</p>
        </div>
        <div style={{padding:'0 28px 24px', display:'flex', flexDirection:'column', gap:16}}>
          {AI_PROVIDERS.map(p => {
            const val = keys[p.id] || '';
            const connected = val.length > 8;
            return (
              <div key={p.id} style={{padding:'16px', border:`1px solid ${connected ? p.color+'40' : T.border}`, borderRadius:10, background: connected ? p.color+'08' : T.bg, transition:'all 0.2s'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
                  <span style={{fontSize:14, color:p.color}}>{p.icon}</span>
                  <span style={{fontFamily:T.ui, fontSize:13, fontWeight:500, color:T.ink}}>{p.name}</span>
                  {connected && <span style={{marginLeft:'auto', fontFamily:T.mono, fontSize:10, color:p.color, letterSpacing:'0.08em', textTransform:'uppercase', background:p.color+'15', padding:'2px 7px', borderRadius:4}}>Connected</span>}
                </div>
                <div style={{display:'flex', gap:6}}>
                  <input
                    type={visible[p.id] ? 'text' : 'password'}
                    value={val}
                    onChange={e => save(p.id, e.target.value)}
                    placeholder={p.placeholder}
                    style={{flex:1, padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:6, background:T.surface, fontFamily:T.mono, fontSize:11, color:T.ink, outline:'none', boxSizing:'border-box'}}
                    onFocus={e => e.target.style.borderColor = p.color}
                    onBlur={e => e.target.style.borderColor = T.border}
                  />
                  <button onClick={() => setVisible(v => ({...v, [p.id]: !v[p.id]}))} style={{padding:'0 8px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bg, cursor:'pointer', fontFamily:T.mono, fontSize:10, color:T.ink3}}>
                    {visible[p.id] ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            );
          })}
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, lineHeight:1.6, letterSpacing:'0.02em', textAlign:'center', padding:'4px 0'}}>
            Keys are stored locally on your device and never sent to our servers.
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ManageSubjectsModal({ open, onClose, profile, onUpdateProfile }) {
  const [closing, setClosing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [picker, setPicker] = useState(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const panelRef = useRef(null);

  const subjects = profile?.subjects || [];
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 280); }, [onClose]);

  useEffect(() => { if (open) { setClosing(false); setEditId(null); setNewName(''); setPicker(null); setNewColor(PRESET_COLORS[subjects.length % PRESET_COLORS.length]); } }, [open, subjects.length]);
  useModalA11y(open, dismiss, panelRef);

  if (!open) return null;

  const save = (newSubjects) => {
    onUpdateProfile({ ...profile, subjects: newSubjects });
  };
  const remove = (id) => {
    const subj = subjects.find(s => s.id === id);
    if (!window.confirm(`Remove ${subj?.name || 'this subject'}?`)) return;
    save(subjects.filter(s => s.id !== id));
  };
  const updateColor = (id, color) => { save(subjects.map(s => s.id === id ? {...s, color} : s)); setPicker(null); };
  const startEdit = (s) => { setEditId(s.id); setEditName(s.name); };
  const confirmEdit = (id) => {
    if (editName.trim()) save(subjects.map(s => s.id === id ? {...s, name: editName.trim(), short: makeShort(editName)} : s));
    setEditId(null);
  };
  const addSubject = () => {
    if (!newName.trim() || subjects.length >= 10) return;
    save([...subjects, { id: makeSubjId(newName), name: newName.trim(), short: makeShort(newName), color: newColor, grade:'—', gpa:0, pct:0 }]);
    setNewName('');
    setNewColor(PRESET_COLORS[(subjects.length + 1) % PRESET_COLORS.length]);
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }}
      style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{background:T.surface, borderRadius:12, width:420, maxHeight:'80vh', display:'flex', flexDirection:'column', border:`1px solid ${T.border}`, boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)', opacity:0, outline:'none', animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`}}>
        <div style={{padding:'24px 28px 0'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
            <h3 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, fontWeight:400, margin:0, color:T.ink}}>Manage Subjects</h3>
            <button aria-label="Close dialog" onClick={dismiss} style={{background:'none', border:'none', cursor:'pointer', padding:4, color:T.ink3, fontSize:18, lineHeight:1}}>×</button>
          </div>
          <p style={{fontFamily:T.ui, fontSize:11.5, color:T.ink3, margin:'0 0 16px', lineHeight:1.5}}>{subjects.length} subject{subjects.length !== 1 ? 's' : ''} · click name to rename, dot to recolor</p>
        </div>
        <div style={{padding:'0 28px', overflowY:'auto', flex:1}}>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {subjects.map(s => (
              <div key={s.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:`1px solid ${T.border}`, borderRadius:8, background:T.bg, position:'relative'}}>
                <div style={{position:'relative'}}>
                  <div onClick={() => setPicker(picker === s.id ? null : s.id)}
                    style={{width:20, height:20, borderRadius:5, background:s.color, cursor:'pointer', border:'2px solid rgba(0,0,0,0.1)', flexShrink:0}} />
                  {picker === s.id && (
                    <div style={{position:'absolute', top:26, left:0, zIndex:10, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:6, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, boxShadow:'0 8px 24px rgba(24,21,14,0.14)'}}>
                      {PRESET_COLORS.map(c => (
                        <div key={c} onClick={() => updateColor(s.id, c)}
                          style={{width:20, height:20, borderRadius:4, background:c, cursor:'pointer', outline: s.color===c ? `2px solid ${T.accent}` : 'none', outlineOffset:1}} />
                      ))}
                    </div>
                  )}
                </div>
                {editId === s.id ? (
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmEdit(s.id); if (e.key === 'Escape') { e.stopPropagation(); setEditId(null); } }}
                    onBlur={() => confirmEdit(s.id)}
                    style={{flex:1, padding:'4px 8px', border:`1px solid ${T.accent}`, borderRadius:5, fontFamily:T.ui, fontSize:12, color:T.ink, outline:'none', background:T.surface}} />
                ) : (
                  <span onClick={() => startEdit(s)} style={{flex:1, fontFamily:T.ui, fontSize:12, color:T.ink, cursor:'text'}}>{s.name}</span>
                )}
                <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.06em', flexShrink:0}}>{s.short}</span>
                <button onClick={() => remove(s.id)} style={{background:'none', border:'none', cursor:'pointer', padding:2, color:T.ink3, fontSize:14, lineHeight:1, opacity:0.5, transition:'opacity 0.15s'}}
                  onMouseOver={e => {e.currentTarget.style.opacity=1; e.currentTarget.style.color='#b04040'}}
                  onMouseOut={e => {e.currentTarget.style.opacity=0.5; e.currentTarget.style.color=T.ink3}}>×</button>
              </div>
            ))}
            {subjects.length === 0 && (
              <div style={{textAlign:'center', padding:'20px 0', fontFamily:T.ui, fontSize:12, color:T.ink3}}>No subjects yet — add one below</div>
            )}
          </div>
        </div>
        {subjects.length < 10 && (
          <div style={{padding:'16px 28px 24px', borderTop:`1px solid ${T.border}`, marginTop:12}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8}}>Add new subject</div>
            <div style={{display:'flex', gap:8}}>
              <div onClick={() => setPicker(picker === 'new' ? null : 'new')} style={{width:36, height:36, borderRadius:6, background:newColor, cursor:'pointer', border:'2px solid rgba(0,0,0,0.1)', flexShrink:0, position:'relative'}}>
                {picker === 'new' && (
                  <div style={{position:'absolute', bottom:42, left:0, zIndex:10, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:6, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, boxShadow:'0 8px 24px rgba(24,21,14,0.14)'}}>
                    {PRESET_COLORS.map(c => (
                      <div key={c} onClick={e => { e.stopPropagation(); setNewColor(c); setPicker(null); }}
                        style={{width:20, height:20, borderRadius:4, background:c, cursor:'pointer', outline: newColor===c ? `2px solid ${T.accent}` : 'none', outlineOffset:1}} />
                    ))}
                  </div>
                )}
              </div>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSubject(); }}
                placeholder="e.g. AP Physics" style={{flex:1, padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bg, fontFamily:T.ui, fontSize:12, color:T.ink, outline:'none'}}
                onFocus={e => e.target.style.borderColor=T.accent} onBlur={e => e.target.style.borderColor=T.border} />
              <button onClick={addSubject} disabled={!newName.trim()} style={{padding:'0 14px', border:'none', borderRadius:6, background: newName.trim() ? T.accent : T.border, color:'#fff', fontFamily:T.mono, fontSize:10, fontWeight:600, letterSpacing:'0.06em', cursor: newName.trim() ? 'pointer' : 'default', transition:'all 0.15s'}}>Add</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

const MODAL_FIELD = { width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' };
const MODAL_LABEL = { fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', display:'block', marginBottom:5 };
const focusBorder = { onFocus: e => e.target.style.borderColor = T.accent, onBlur: e => e.target.style.borderColor = T.border };

function AddHomeworkModal({ open, onClose, onSave, subjects }) {
  const [title, setTitle] = useState('');
  const [subj, setSubj] = useState('');
  const [due, setDue] = useState('Tonight');
  const [est, setEst] = useState('30 min');
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 320); }, [onClose]);

  useEffect(() => {
    if (open) {
      setTitle('');
      setSubj(subjects[0]?.id || '');
      setDue('Tonight');
      setEst('30 min');
      setClosing(false);
    }
  }, [open, subjects]);

  useModalA11y(open, dismiss, panelRef);
  if (!open) return null;

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      id: Date.now() + '',
      subj: subj || subjects[0]?.id || '',
      title: title.trim(),
      due,
      urgent: due === 'Tonight',
      done: false,
      est,
    });
    dismiss();
  };

  const DUE_OPTS = ['Tonight', 'Tomorrow', 'Wed', 'Thu', 'Fri', 'Next Week'];
  const EST_OPTS = ['15 min', '30 min', '45 min', '1 hr', '1 hr 30 min', '2 hr', '3 hr'];

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{
        width:400, maxWidth:'92vw', background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'36px 32px 28px', position:'relative', opacity:0, outline:'none',
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>

        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>Add <span style={{color:T.accent}}>homework</span></div>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:22}}>Track assignments · due dates · time estimates</div>

        <div style={{marginBottom:14}}>
          <label htmlFor="hw-modal-title" style={MODAL_LABEL}>Assignment</label>
          <input id="hw-modal-title" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="e.g. Read chapter 5" autoFocus
            style={MODAL_FIELD} {...focusBorder} />
        </div>

        {subjects.length > 0 && (
          <div style={{marginBottom:14}}>
            <div style={MODAL_LABEL}>Subject</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              {subjects.map(s => {
                const sel = subj === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => setSubj(s.id)} style={{
                    display:'flex', alignItems:'center', gap:6, padding:'6px 11px',
                    border:`1px solid ${sel ? s.color : T.border}`, background: sel ? s.color + '14' : T.bg,
                    borderRadius:20, cursor:'pointer', fontFamily:T.ui, fontSize:11, color: sel ? T.ink : T.ink3,
                  }}>
                    <span style={{width:7, height:7, borderRadius:'50%', background:s.color}} />
                    {s.short || s.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{marginBottom:14}}>
          <div style={MODAL_LABEL}>Due</div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {DUE_OPTS.map(d => (
              <button key={d} type="button" onClick={() => setDue(d)} style={{
                padding:'7px 12px', border:`1px solid ${due===d ? T.accent : T.border}`,
                background: due===d ? T.accentSoft : 'transparent', borderRadius:8,
                fontFamily:T.mono, fontSize:10, color: due===d ? T.accent : T.ink3,
                fontWeight: due===d ? 600 : 400, cursor:'pointer',
              }}>{d}</button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:24}}>
          <label htmlFor="hw-modal-est" style={MODAL_LABEL}>Estimated time</label>
          <select id="hw-modal-est" value={est} onChange={e => setEst(e.target.value)} style={{...MODAL_FIELD, cursor:'pointer', appearance:'none'}}>
            {EST_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button type="button" onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer'}}
            onMouseOver={e => e.currentTarget.style.background=T.bl} onMouseOut={e => e.currentTarget.style.background='transparent'}>Cancel</button>
          <button type="button" onClick={submit} disabled={!title.trim()} style={{padding:'9px 24px', border:'none', background: title.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:10, color:'#fff', letterSpacing:'0.06em', cursor: title.trim() ? 'pointer' : 'default', fontWeight:600}}>Add Assignment</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AddQuizModal({ open, onClose, onSave, subjects }) {
  const [title, setTitle] = useState('');
  const [subj, setSubj] = useState('');
  const [date, setDate] = useState('Fri');
  const [confidence, setConfidence] = useState(0.6);
  const [topics, setTopics] = useState('');
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 320); }, [onClose]);

  useEffect(() => {
    if (open) {
      setTitle('');
      setSubj(subjects[0]?.id || '');
      setDate('Fri');
      setConfidence(0.6);
      setTopics('');
      setClosing(false);
    }
  }, [open, subjects]);

  useModalA11y(open, dismiss, panelRef);
  if (!open) return null;

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      subj: subj || subjects[0]?.id || '',
      date: date.trim() || 'TBD',
      confidence: Number(confidence) || 0.5,
      topics: topics.split(',').map(t => t.trim()).filter(Boolean),
    });
    dismiss();
  };

  const DATE_OPTS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Next Week'];
  const READY_OPTS = [['Low', 0.4], ['Fair', 0.6], ['Strong', 0.85]];

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{
        width:400, maxWidth:'92vw', background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'36px 32px 28px', position:'relative', opacity:0, outline:'none',
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>

        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>Schedule a <span style={{color:T.accent}}>quiz</span></div>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:22}}>Track dates · readiness · topics to review</div>

        <div style={{marginBottom:14}}>
          <label htmlFor="quiz-modal-title" style={MODAL_LABEL}>Quiz title</label>
          <input id="quiz-modal-title" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="e.g. Unit 4 — Cell division" autoFocus
            style={MODAL_FIELD} {...focusBorder} />
        </div>

        {subjects.length > 0 && (
          <div style={{marginBottom:14}}>
            <div style={MODAL_LABEL}>Subject</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              {subjects.map(s => {
                const sel = subj === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => setSubj(s.id)} style={{
                    display:'flex', alignItems:'center', gap:6, padding:'6px 11px',
                    border:`1px solid ${sel ? s.color : T.border}`, background: sel ? s.color + '14' : T.bg,
                    borderRadius:20, cursor:'pointer', fontFamily:T.ui, fontSize:11, color: sel ? T.ink : T.ink3,
                  }}>
                    <span style={{width:7, height:7, borderRadius:'50%', background:s.color}} />
                    {s.short || s.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{marginBottom:14}}>
          <div style={MODAL_LABEL}>Date</div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {DATE_OPTS.map(d => (
              <button key={d} type="button" onClick={() => setDate(d)} style={{
                padding:'7px 12px', border:`1px solid ${date===d ? T.accent : T.border}`,
                background: date===d ? T.accentSoft : 'transparent', borderRadius:8,
                fontFamily:T.mono, fontSize:10, color: date===d ? T.accent : T.ink3,
                fontWeight: date===d ? 600 : 400, cursor:'pointer',
              }}>{d}</button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <div style={MODAL_LABEL}>Readiness</div>
          <div style={{display:'flex', gap:6}}>
            {READY_OPTS.map(([l, v]) => (
              <button key={l} type="button" onClick={() => setConfidence(v)} style={{
                flex:1, padding:'8px 0', border:`1px solid ${confidence===v ? T.accent : T.border}`,
                background: confidence===v ? T.accentSoft : 'transparent', borderRadius:8,
                fontFamily:T.mono, fontSize:10, color: confidence===v ? T.accent : T.ink3,
                fontWeight: confidence===v ? 600 : 400, cursor:'pointer',
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:24}}>
          <label htmlFor="quiz-modal-topics" style={MODAL_LABEL}>Topics <span style={{opacity:0.5, textTransform:'none', letterSpacing:0}}>— comma-separated</span></label>
          <input id="quiz-modal-topics" value={topics} onChange={e => setTopics(e.target.value)} placeholder="Mitosis, DNA, Labs"
            style={MODAL_FIELD} {...focusBorder} />
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button type="button" onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer'}}
            onMouseOver={e => e.currentTarget.style.background=T.bl} onMouseOut={e => e.currentTarget.style.background='transparent'}>Cancel</button>
          <button type="button" onClick={submit} disabled={!title.trim()} style={{padding:'9px 24px', border:'none', background: title.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:10, color:'#fff', letterSpacing:'0.06em', cursor: title.trim() ? 'pointer' : 'default', fontWeight:600}}>Add Quiz</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const QUICK_ADD_OPTIONS = [
  { id: 'homework',  label: 'Homework',  sub: 'Assignment · due date · time estimate', icon: '□' },
  { id: 'quiz',      label: 'Quiz',      sub: 'Date · readiness · topics to review',   icon: '◇' },
  { id: 'note',      label: 'Note',      sub: 'Study notes organized by subject',        icon: '✎' },
  { id: 'flashcard', label: 'Flashcard', sub: 'Question & answer for review',            icon: '⊞' },
  { id: 'subject',   label: 'Subject',   sub: 'Add a new class to your workspace',       icon: '+' },
];

function QuickAddModal({ open, onClose, onPick }) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 320); }, [onClose]);

  useEffect(() => { if (open) setClosing(false); }, [open]);
  useModalA11y(open, dismiss, panelRef);
  if (!open) return null;

  const pick = (id) => {
    onPick(id);
    dismiss();
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Add new item" tabIndex={-1} className="shq-modal-box" style={{
        width:440, maxWidth:'92vw', background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'36px 32px 28px', position:'relative', opacity:0, outline:'none',
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>

        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>Add <span style={{color:T.accent}}>something</span></div>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:20}}>Homework · quizzes · notes · flashcards · subjects</div>

        <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:8}}>
          {QUICK_ADD_OPTIONS.map(opt => (
            <button key={opt.id} type="button" onClick={() => pick(opt.id)} style={{
              display:'flex', alignItems:'center', gap:14, width:'100%', textAlign:'left',
              padding:'12px 14px', border:`1px solid ${T.border}`, borderRadius:12, background:T.bg,
              cursor:'pointer', transition:'border-color 0.15s, background 0.15s',
            }}
              onMouseOver={e => { e.currentTarget.style.borderColor = T.accent + '55'; e.currentTarget.style.background = T.accentSoft; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bg; }}
            >
              <span style={{width:32, height:32, borderRadius:8, background:T.accentSoft, border:`1px solid ${T.accent}30`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.mono, fontSize:14, color:T.accent, flexShrink:0}}>{opt.icon}</span>
              <div style={{minWidth:0}}>
                <div style={{fontFamily:T.ui, fontSize:13, fontWeight:500, color:T.ink, marginBottom:2}}>{opt.label}</div>
                <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, lineHeight:1.4}}>{opt.sub}</div>
              </div>
              <span style={{marginLeft:'auto', fontFamily:T.mono, fontSize:11, color:T.ink3, flexShrink:0}}>→</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function MobileHeader({ onMenuOpen, sidebarOpen }) {
  return (
    <header className="shq-mobile-header" role="banner">
      <button
        type="button"
        className="shq-mobile-menu-btn"
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
        aria-expanded={sidebarOpen}
        aria-controls="shq-sidebar"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M3 5h12M3 9h12M3 13h12" />
        </svg>
      </button>
      <div className="shq-mobile-brand">
        <span className="shq-mobile-wordmark">Scholar.</span>
      </div>
    </header>
  );
}

function Sidebar({ screen, onNav, profile, userData, onSignOut, onAddSubject, onUpdateProfile, open, onCloseSidebar, requestedAction, onActionHandled }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAIKeys, setShowAIKeys] = useState(false);
  const [showManageSubjects, setShowManageSubjects] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hov, setHov] = useState(null);
  const settingsRef = useRef(null);

  useEffect(() => {
    if (!showSettings) return;
    const close = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettings(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSettings]);

  useEffect(() => {
    if (!requestedAction) return;
    if (requestedAction === 'addSubject') setShowAddModal(true);
    if (requestedAction === 'manageSubjects') setShowManageSubjects(true);
    onActionHandled?.();
  }, [requestedAction, onActionHandled]);

  const ud = userData || defaultUserData();
  const subjects = profile?.subjects || [];
  const homework = ud.homework || [];
  const grades = ud.grades || {};
  const streak = ud.streak || 0;

  const hwOpen = homework.filter(h => !h.done).length;
  const gpa = calcGPA(subjects, grades);

  const todayHw = homework.filter(h => {
    if (h.done) return true;
    if (!h.due) return false;
    const d = h.due.toLowerCase();
    return d === 'today' || d === 'tonight';
  });
  const todayDone = todayHw.filter(h => h.done).length;

  const SL = (t) => <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.16em', padding:'12px 12px 4px'}}>{t}</div>;

  const NAV_GROUPS = [
    { label: 'Dashboard', items: NAV.filter(n => ['today','homework','quizzes'].includes(n.id)) },
    { label: 'Study',     items: NAV.filter(n => ['notes','flashcards'].includes(n.id)) },
    { label: 'Academics', items: NAV.filter(n => ['schedule','grades','subjects','tools'].includes(n.id)) },
  ];

  const navBtn = (item) => {
    const act = screen === item.id;
    const hovering = hov === item.id;
    return (
      <button key={item.id} onClick={() => { onNav(item.id); onCloseSidebar?.(); }}
        onMouseOver={() => setHov(item.id)} onMouseOut={() => setHov(null)}
        style={{
          display:'flex', alignItems:'center', gap:8, position:'relative',
          width:'calc(100% - 12px)', margin:'1px 6px', padding:'6px 10px',
          border:'none', borderRadius:7,
          background: act ? T.accentSoft : hovering ? T.bl : 'transparent',
          color: act ? T.accent : T.ink2,
          fontSize:11.5, fontFamily:T.ui, textAlign:'left',
          fontWeight: act ? 600 : 400,
          cursor:'pointer',
          transition:'all 0.15s ease',
        }}>
        {act && <div style={{position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:3, height:16, borderRadius:'0 2px 2px 0', background:T.accent, transition:'all 0.2s ease'}} />}
        <span style={{flexShrink:0, display:'flex', opacity: act ? 1 : 0.5, transition:'opacity 0.15s'}}>{item.icon}</span>
        <span style={{flex:1}}>{item.label}</span>
        {item.id === 'homework' && hwOpen > 0 && <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, background:T.bl, padding:'1px 5px', borderRadius:4, lineHeight:'14px'}}>{hwOpen}</span>}
        {item.id === 'grades' && gpa !== '—' && <span style={{fontFamily:T.mono, fontSize:10, color:T.accent, fontWeight:600}}>{gpa}</span>}
        {item.id === 'subjects' && subjects.length > 0 && <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, background:T.bl, padding:'1px 5px', borderRadius:4, lineHeight:'14px'}}>{subjects.length}</span>}
      </button>
    );
  };

  return (
    <>
    <aside
      id="shq-sidebar"
      className={`shq-sidebar${open ? ' open' : ''}`}
      style={{
      width:220, flexShrink:0,
      background:T.surface,
      borderRight:`1px solid ${T.border}`,
      display:'flex', flexDirection:'column', overflow:'hidden',
    }}>

      {/* Brand */}
      <div style={{padding:'14px 12px 12px', flexShrink:0}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{width:28, height:28, borderRadius:7, background:`linear-gradient(135deg, ${T.accent}, #9a7828)`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 6px rgba(184,148,58,0.18)'}}>
            <span style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:'#fff', lineHeight:1}}>S</span>
          </div>
          <div>
            <div style={{fontFamily:T.ui, fontSize:12, fontWeight:600, color:T.ink, lineHeight:1.2}}>Scholar</div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.08em'}}>Student workspace</div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{flex:1, overflowY:'auto', overflowX:'hidden'}}>

        {/* Grouped Navigation */}
        {NAV_GROUPS.map(g => (
          <div key={g.label}>
            {SL(g.label)}
            {g.items.map(navBtn)}
          </div>
        ))}

        {/* Subjects */}
        <div style={{padding:'2px 0 0'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 12px 4px'}}>
            <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.16em'}}>Subjects</span>
            <button aria-label="Add subject" onClick={() => setShowAddModal(true)} style={{width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${T.border}`, background:'transparent', borderRadius:4, color:T.ink3, fontSize:11, cursor:'pointer', lineHeight:1, padding:0, transition:'all 0.15s'}}
              onMouseOver={e => {e.currentTarget.style.background=T.accent; e.currentTarget.style.borderColor=T.accent; e.currentTarget.style.color='#fff'}}
              onMouseOut={e => {e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.ink3}}>+</button>
          </div>
          <div style={{padding:'0 6px'}}>
            {subjects.length === 0 && (
              <div style={{padding:'6px', fontFamily:T.mono, fontSize:10, color:T.ink3, opacity:0.6, textAlign:'center'}}>No subjects yet</div>
            )}
            {subjects.map(s => {
              const g = grades[s.id];
              const hwForSubj = homework.filter(h => h.subj === s.id && !h.done).length;
              return (
                <div key={s.id}
                  onMouseOver={e => e.currentTarget.style.background=T.bl}
                  onMouseOut={e => e.currentTarget.style.background='transparent'}
                  onClick={() => { onNav && onNav('subject', s.id); onCloseSidebar?.(); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav && onNav('subject', s.id); onCloseSidebar?.(); } }}
                  style={{display:'flex', alignItems:'center', gap:7, padding:'4px 8px', height:32, margin:'0', borderRadius:5, background:'transparent', cursor:'pointer', transition:'background 0.12s'}}>
                  <div style={{width:8, height:8, borderRadius:3, background:s.color, flexShrink:0}} />
                  <span style={{flex:1, fontSize:11, fontFamily:T.ui, color:T.ink2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.short || s.name}</span>
                  {hwForSubj > 0 && <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{hwForSubj}</span>}
                  {g && g !== '—' && <span style={{fontFamily:T.mono, fontSize:10, color:s.color, fontWeight:600}}>{g}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Today's Focus Widget */}
        {todayHw.length > 0 && (
          <div style={{padding:'2px 0 0'}}>
            {SL('Today')}
            <div style={{padding:'0 6px'}}>
              <div style={{background:T.bg, borderRadius:8, padding:'6px 8px'}}>
                {todayHw.slice(0, 4).map((h, i) => (
                  <div key={h.id||i} style={{display:'flex', alignItems:'center', gap:6, padding:'2px 0'}}>
                    <div style={{width:13, height:13, borderRadius:3, border: h.done ? 'none' : `1.5px solid ${T.border}`, background: h.done ? T.accent : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      {h.done && <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6l2.5 2.5 5-5"/></svg>}
                    </div>
                    <span style={{fontFamily:T.ui, fontSize:10, color: h.done ? T.ink3 : T.ink, textDecoration: h.done ? 'line-through' : 'none', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', opacity: h.done ? 0.5 : 1}}>{h.title}</span>
                  </div>
                ))}
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:3, paddingTop:3, borderTop:`1px solid ${T.border}`}}>{todayDone}/{todayHw.length} complete</div>
              </div>
            </div>
          </div>
        )}

        <div style={{height:4}} />
      </div>

      {/* User Profile Footer */}
      <div style={{borderTop:`1px solid ${T.border}`, flexShrink:0, padding:'8px 6px', position:'relative'}} ref={settingsRef}>
        {showSettings && (
          <div style={{position:'absolute', bottom:'100%', left:6, right:6, marginBottom:4, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:'3px', boxShadow:'0 -8px 32px rgba(24,21,14,0.12), 0 -2px 8px rgba(24,21,14,0.06)', animation:'shq-modal-slide-up 0.18s cubic-bezier(0.16,1,0.3,1) forwards', zIndex:100}}>
            {[
              { label:'Profile', icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="6" r="3"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/></svg>, action: () => { setShowSettings(false); setShowProfileModal(true); } },
              { label:'Manage Subjects', icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/></svg>, action: () => { setShowSettings(false); setShowManageSubjects(true); } },
              { label:'AI Connections', icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1v4M8 11v4M1 8h4M11 8h4M3.5 3.5l2.8 2.8M9.7 9.7l2.8 2.8M12.5 3.5l-2.8 2.8M6.3 9.7l-2.8 2.8"/></svg>, action: () => { setShowSettings(false); setShowAIKeys(true); } },
              { type:'divider' },
              { label:'Sign Out', icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14H3V2h3M11 11l3-3-3-3M6 8h8"/></svg>, action: () => { setShowSettings(false); onSignOut && onSignOut(); }, danger: true },
            ].map((item, i) => item.type === 'divider' ? (
              <div key={i} style={{height:1, background:T.border, margin:'3px 6px'}} />
            ) : (
              <button key={item.label} onClick={item.action} style={{
                display:'flex', alignItems:'center', gap:7, width:'100%', padding:'5px 8px',
                border:'none', borderRadius:6, background:'transparent',
                fontFamily:T.ui, fontSize:11, color: item.danger ? '#b04040' : T.ink2,
                cursor:'pointer', textAlign:'left', transition:'background 0.1s',
              }}
                onMouseOver={e => e.currentTarget.style.background = item.danger ? '#faf0f0' : T.bl}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{display:'flex', flexShrink:0, opacity:0.6}}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div style={{background:T.bg, borderRadius:8, padding:'8px 10px'}}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            {profile?.picture ? (
              <img src={profile.picture} alt={`${(profile?.name || 'User')} profile photo`} style={{width:24, height:24, borderRadius:6, objectFit:'cover'}} referrerPolicy="no-referrer" />
            ) : (
              <div style={{width:24, height:24, borderRadius:6, background:`linear-gradient(135deg, ${T.accent}, #9a7828)`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <span style={{fontFamily:T.serif, fontSize:12, color:'#fff', fontWeight:600}}>{(profile?.name || 'U')[0]}</span>
              </div>
            )}
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontFamily:T.ui, fontSize:11, fontWeight:600, color:T.ink, lineHeight:'14px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{profile?.name || 'Student'}</div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.05em'}}>{profile ? (profile.grade.charAt(0).toUpperCase()+profile.grade.slice(1)) : 'Student'}{streak > 0 ? ` · ${streak}d streak` : ''}</div>
            </div>
            <button onClick={() => setShowSettings(s => !s)} style={{width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${showSettings ? T.accent+'40' : T.border}`, background: showSettings ? T.accentSoft : 'transparent', borderRadius:5, color: showSettings ? T.accent : T.ink3, cursor:'pointer', padding:0, transition:'all 0.15s', flexShrink:0}}
              onMouseOver={e => { if(!showSettings) { e.currentTarget.style.background=T.bl; e.currentTarget.style.borderColor=T.ink3+'40'; }}}
              onMouseOut={e => { if(!showSettings) { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=T.border; }}}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="3" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="8" cy="13" r="1"/></svg>
            </button>
          </div>
        </div>
      </div>

    </aside>
    <AddSubjectModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdd={subj => onAddSubject && onAddSubject(subj)} existingCount={subjects.length} />
    <ProfileModal open={showProfileModal} onClose={() => setShowProfileModal(false)} profile={profile} onSave={p => onUpdateProfile && onUpdateProfile(p)} />
    <AIKeysModal open={showAIKeys} onClose={() => setShowAIKeys(false)} />
    <ManageSubjectsModal open={showManageSubjects} onClose={() => setShowManageSubjects(false)} profile={profile} onUpdateProfile={onUpdateProfile} />
    </>
  );
}

/* ── Shared ─────────────────────────────────────────────── */
function PageHeader({ eyebrow, title, right }) {
  return (
    <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:40, flexWrap:'wrap', gap:16}}>
      <div>
        {eyebrow && <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:12}}>{eyebrow}</div>}
        <h1 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:'clamp(36px,4.5vw,56px)', fontWeight:400, color:T.ink, margin:0, letterSpacing:'-0.025em', lineHeight:1.04}}>{title}</h1>
      </div>
      {right && <div style={{textAlign:'right'}}>{right}</div>}
    </div>
  );
}
function Hr({ mb=32 }) { return <div style={{height:1, background:T.border, marginBottom:mb}} />; }

const DASHBOARD_WIDGETS = [
  { id: 'stats', label: 'Summary cards', desc: 'Open tasks, GPA, streak, and quizzes' },
  { id: 'week', label: 'Week calendar', desc: 'Seven-day date strip' },
  { id: 'period', label: 'Current period', desc: 'Class in session and tomorrow preview' },
  { id: 'gamePlan', label: 'Game plan', desc: 'Tonight\'s homework priorities' },
  { id: 'bottomRow', label: 'Workload & progress', desc: 'Due today, schedule, and streak grid' },
];

function DashboardCustomizeModal({ open, onClose, prefs, onSave }) {
  const [draft, setDraft] = useState(DEFAULT_DASHBOARD_PREFS);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 280); }, [onClose]);

  useEffect(() => {
    if (open) {
      setDraft(normalizeDashboardPrefs(prefs));
      setClosing(false);
    }
  }, [open, prefs]);

  useModalA11y(open, dismiss, panelRef);

  if (!open) return null;

  const toggle = (id) => setDraft(prev => ({ ...prev, [id]: !prev[id] }));
  const submit = () => { onSave(draft); dismiss(); };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{
        width:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'32px 28px 24px', position:'relative', opacity:0, outline:'none',
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>Customize <span style={{color:T.accent}}>dashboard</span></div>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:20}}>Choose what appears on Today</div>
        <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:22}}>
          {DASHBOARD_WIDGETS.map(w => (
            <label key={w.id} style={{display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', border:`1px solid ${draft[w.id] ? T.accent+'40' : T.border}`, borderRadius:10, background: draft[w.id] ? T.accentSoft : T.bg, cursor:'pointer'}}>
              <input type="checkbox" checked={!!draft[w.id]} onChange={() => toggle(w.id)} style={{marginTop:2, accentColor:T.accent}} />
              <div>
                <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink, fontWeight:500, marginBottom:2}}>{w.label}</div>
                <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, lineHeight:1.45}}>{w.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button onClick={dismiss} style={{padding:'9px 18px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.ink3, cursor:'pointer'}}>Cancel</button>
          <button onClick={submit} style={{padding:'9px 22px', border:'none', background:T.accent, borderRadius:10, fontFamily:T.mono, fontSize:10, color:'#fff', cursor:'pointer', fontWeight:600}}>Save layout</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── 1. Today ───────────────────────────────────────────── */
function TodayScreen({ profile, userData, onUpdate, onNav, onRequestSidebar, screenAction, onScreenActionHandled }) {
  const ud       = userData || defaultUserData();
  const prefs    = ud.dashboardPrefs || DEFAULT_DASHBOARD_PREFS;
  const [showCustomize, setShowCustomize] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAddHomework, setShowAddHomework] = useState(false);
  const [showAddQuiz, setShowAddQuiz] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddFlashcard, setShowAddFlashcard] = useState(false);
  const [planTick, setPlanTick] = useState(0);
  const subjects = profile?.subjects || [];
  const subjectBy = makeSubjectBy(subjects);
  const homework  = ud.homework || [];
  const quizzes   = ud.quizzes  || [];
  const notes     = ud.notes    || [];
  const flashcards = ud.flashcards || [];
  const schedule  = ud.schedule || [];
  const gpa       = calcGPA(subjects, ud.grades);
  const streak    = ud.streak || 0;
  const firstName = (profile?.name || 'Scholar').split(' ')[0];

  const now = new Date();
  const h = now.getHours();
  const timeLabel = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Late night';
  const dayStr   = now.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase();
  const dateStr  = now.toLocaleDateString('en-US',{month:'short', day:'numeric'});
  const timeStr  = now.toLocaleTimeString('en-US',{hour:'numeric', minute:'2-digit'});

  // Week calendar Mon–Sun
  const dow = now.getDay(); // 0=Sun
  const monOffset = (dow + 6) % 7;
  const weekDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((n,i) => {
    const d = new Date(now); d.setDate(now.getDate() - monOffset + i);
    return { n, date: d.getDate(), today: d.toDateString() === now.toDateString() };
  });

  const open      = homework.filter(hw => !hw.done);
  const urgent    = homework.filter(hw => hw.urgent && !hw.done);
  const tonight   = homework.filter(hw => hw.due === 'Tonight' && !hw.done);
  const curPeriod = schedule.find(p => p.current);

  const Btn = ({children, gold, onClick}) => (
    <button onClick={onClick} style={{padding:'7px 14px', border: gold ? 'none' : `1px solid ${T.border}`, background: gold ? T.accent : T.surface, color: gold ? '#fff' : T.ink3, fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', display:'flex', alignItems:'center', gap:6, borderRadius:8}}>{children}</button>
  );

  useRunScreenAction(screenAction, onScreenActionHandled, (action) => {
    if (action === 'add') setShowQuickAdd(true);
  });

  const handleQuickAddPick = (type) => {
    if (type === 'homework') setShowAddHomework(true);
    else if (type === 'quiz') setShowAddQuiz(true);
    else if (type === 'note') setShowAddNote(true);
    else if (type === 'flashcard') setShowAddFlashcard(true);
    else if (type === 'subject') onRequestSidebar?.('addSubject');
  };

  const saveNote = ({ title, subj, body }) => {
    const now = Date.now();
    const preview = (body || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const newNote = {
      id: 'n-' + now.toString(36) + Math.random().toString(36).slice(2, 5),
      subj: subj || subjects[0]?.id || '',
      title,
      body,
      preview,
      date: new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      createdAt: now,
      updatedAt: now,
    };
    onUpdate && onUpdate({ notes: [newNote, ...notes] });
  };

  const saveFlashcard = ({ q, a, subj }) => {
    const now = Date.now();
    const newCard = {
      id: 'f-' + now.toString(36) + Math.random().toString(36).slice(2, 5),
      q,
      a,
      subj: subj || subjects[0]?.id || '',
      createdAt: now,
      updatedAt: now,
    };
    onUpdate && onUpdate({ flashcards: [...flashcards, newCard] });
  };

  const gamePlanItems = useMemo(() => open.slice(0, 4), [open, planTick]);

  const hasBasics = subjects.length > 0;

  return (
    <div className="screen-enter" style={{flex:1, overflowY:'auto'}}>
      <DashboardCustomizeModal
        open={showCustomize}
        onClose={() => setShowCustomize(false)}
        prefs={prefs}
        onSave={(next) => onUpdate && onUpdate({ dashboardPrefs: next })}
      />
      <QuickAddModal open={showQuickAdd} onClose={() => setShowQuickAdd(false)} onPick={handleQuickAddPick} />
      <AddHomeworkModal
        open={showAddHomework}
        onClose={() => setShowAddHomework(false)}
        onSave={(item) => onUpdate && onUpdate({ homework: [...homework, item] })}
        subjects={subjects}
      />
      <AddQuizModal
        open={showAddQuiz}
        onClose={() => setShowAddQuiz(false)}
        onSave={(item) => onUpdate && onUpdate({ quizzes: [...quizzes, item] })}
        subjects={subjects}
      />
      <NoteEditorModal
        open={showAddNote}
        onClose={() => setShowAddNote(false)}
        onSave={saveNote}
        subjects={subjects}
        initial={null}
      />
      <FlashcardEditorModal
        open={showAddFlashcard}
        onClose={() => setShowAddFlashcard(false)}
        onSave={saveFlashcard}
        subjects={subjects}
        initial={null}
      />
      {!hasBasics && (
        <div style={{margin:'18px 52px 0', background:'rgba(184,148,58,0.15)', border:`1px solid ${T.accent}35`, borderLeft:`3px solid ${T.accent}`, padding:'14px 16px', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
          <div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.accent, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4}}>Getting started</div>
            <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink2, lineHeight:1.45}}>Add your first subject in the sidebar to unlock Homework, Notes, and Grades.</div>
          </div>
          <button type="button" onClick={() => onRequestSidebar?.('addSubject')} style={{padding:'7px 12px', border:`1px solid ${T.accent}55`, background:'#fff', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.accent, cursor:'pointer', whiteSpace:'nowrap'}}>Add subject →</button>
        </div>
      )}
      {/* Header */}
      <div style={{padding:'26px 52px 0', display:'flex', alignItems:'flex-start', justifyContent:'space-between'}}>
        <div>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:5}}>
            {dayStr} · {dateStr} · {timeStr} · Spring Term
          </div>
          <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
            <span style={{fontFamily:T.ui, fontWeight:700, fontSize:29, color:T.ink}}>{timeLabel}, </span>
            <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:31, color:T.ink}}>{firstName}.</span>
          </h1>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.05em'}}>
            {open.length} things to finish tonight · {quizzes.length} quizzes scheduled
          </div>
        </div>
        <div style={{display:'flex', gap:8, flexShrink:0, marginTop:4}}>
          <Btn onClick={() => setShowCustomize(true)}>✦ Customize</Btn>
          <Btn gold onClick={() => setShowQuickAdd(true)}>+ Add</Btn>
        </div>
      </div>

      {prefs.stats && (
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, margin:'20px 52px 12px'}}>
        {[
          { label:'OPEN TASKS',    val:open.length,        sub:'all on track',                                              accent:T.accent  },
          { label:'GPA',           val:gpa,                sub:'Unweighted · Spring',                                        accent:'#3a8a52' },
          { label:'STUDY STREAK',  val:String(streak),     sub:'days running',                                               accent:T.accent2 },
          { label:'QUIZZES AHEAD', val:quizzes.length,     sub:quizzes.length>0?`${quizzes[0].date} upcoming`:'none scheduled', accent:'#9254de' },
        ].map(c => (
          <div key={c.label} style={{background:T.surface, padding:'22px 24px 20px', borderRadius:12, minHeight:100, borderLeft:`3px solid ${c.accent}`}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:10}}>{c.label}</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:38, color:T.ink, lineHeight:0.9, marginBottom:10}}>{c.val}</div>
            <div style={{fontFamily:T.mono, fontSize:10, color:c.accent}}>{c.sub}</div>
          </div>
        ))}
      </div>
      )}

      {prefs.week && (
      <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:10, margin:'0 52px 12px'}}>
        {weekDays.map(d => (
          <div key={d.n} style={{background:d.today ? T.accentSoft : T.surface, padding:'16px 14px 14px', borderRadius:12, minHeight:72}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:d.today?T.accent:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:8}}>{d.n}</div>
            {d.today
              ? <div style={{width:32, height:32, borderRadius:'50%', background:T.accent, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:26, color:'#fff', lineHeight:1}}>{d.date}</div>
                </div>
              : <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:26, color:T.ink3, lineHeight:1}}>{d.date}</div>
            }
          </div>
        ))}
      </div>
      )}

      {prefs.period && (
      <div style={{margin:'0 52px 12px', background:T.surface, padding:'20px 26px', borderLeft:`3px solid ${T.accent}`, borderRadius:12}}>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:7}}>
          {open.length===0 ? 'All done for today · enjoy your evening' : `${open.length} tasks remaining · stay focused`}
        </div>
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:28, color:T.ink, lineHeight:1.1, marginBottom:12}}>
          {curPeriod ? subjectBy(curPeriod.subj).name : 'Free time'}
        </div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, border:`1px solid ${T.border}`, padding:'4px 10px', letterSpacing:'0.09em', textTransform:'uppercase'}}>
            {curPeriod ? 'Class in session' : 'No class in session'}
          </span>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:2}}>Tomorrow</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink3}}>Clear ahead</div>
          </div>
        </div>
      </div>
      )}

      {prefs.gamePlan && (
      <div style={{margin:'0 52px 12px', background:T.surface, padding:'17px 26px', borderRadius:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:13}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:22, height:22, background:T.accent, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
              <span style={{color:'#fff', fontSize:11}}>✦</span>
            </div>
            <div>
              <div style={{fontFamily:T.ui, fontSize:13, color:T.ink, fontWeight:500}}>Game plan for today</div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>AI · updates with your homework & schedule</div>
            </div>
          </div>
          <button type="button" onClick={() => setPlanTick(t => t + 1)} style={{fontFamily:T.mono, fontSize:10, color:T.ink3, background:'none', border:`1px solid ${T.border}`, padding:'5px 11px', cursor:'pointer', transition:'border-color 0.12s', display:'flex', alignItems:'center', gap:5}}
            onMouseOver={e=>e.currentTarget.style.borderColor=T.accent}
            onMouseOut={e=>e.currentTarget.style.borderColor=T.border}
          ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2.5v4h-4"/><path d="M3 13.5v-4h4"/><path d="M12.7 6.3a5.5 5.5 0 1 0 .8-2.8"/><path d="M3.3 9.7a5.5 5.5 0 1 0-.8 2.8"/></svg> Refresh</button>
        </div>
        {open.length === 0
          ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3}}>Review your notes and plan out your evening.</div>
          : gamePlanItems.map((hw,i) => {
              const s = subjectBy(hw.subj);
              return (
                <div key={i} style={{display:'flex', gap:12, marginBottom:8}}>
                  <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, flexShrink:0, width:12}}>{i+1}</span>
                  <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink2, lineHeight:1.5}}>{s.short}: {hw.title} — {hw.est}</div>
                </div>
              );
            })
        }
      </div>
      )}

      {prefs.bottomRow && (
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, margin:'0 52px 28px'}}>
        {/* Workload */}
        <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:11}}>Workload</div>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>Due Today</div>
            <button type="button" onClick={() => onNav?.('homework')} style={{fontFamily:T.mono, fontSize:10, color:T.accent, background:'none', border:'none', padding:0, cursor:'pointer'}}>All homework →</button>
          </div>
          {tonight.length > 0 ? tonight.map(hw => {
            const s = subjectBy(hw.subj);
            return (
              <div key={hw.title} style={{display:'flex', gap:8, alignItems:'flex-start', marginBottom:6}}>
                <div style={{width:5, height:5, borderRadius:1, background:s.color, marginTop:4, flexShrink:0}}/>
                <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink2, lineHeight:1.4}}>{hw.title}</div>
              </div>
            );
          }) : <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13.5, color:T.ink3, lineHeight:1.65}}>All clear today. Nothing due — you're ahead.</div>}
          <div style={{borderTop:`1px solid ${T.bl}`, marginTop:12, paddingTop:11}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:7}}>Quizzes Ahead</div>
            {quizzes.slice(0,2).map(q => {
              const s = subjectBy(q.subj);
              return (
                <div key={q.title} style={{display:'flex', gap:7, alignItems:'center', marginBottom:5}}>
                  <div style={{width:5, height:5, borderRadius:1, background:s.color, flexShrink:0}}/>
                  <div style={{flex:1, fontFamily:T.ui, fontSize:11.5, color:T.ink2}}>{q.title.split('—')[0].trim()}</div>
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, flexShrink:0}}>{q.date}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Schedule & Notes */}
        <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:11}}>Schedule & Notes</div>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>Schedule</div>
            <button type="button" onClick={() => onNav?.('schedule')} style={{fontFamily:T.mono, fontSize:10, color:T.accent2, background:'none', border:'none', padding:0, cursor:'pointer'}}>Edit → {dayStr.slice(0,3)}</button>
          </div>
          {schedule.filter(p => p.subj).slice(0,5).map(p => {
            const s = subjectBy(p.subj);
            return (
              <div key={p.period} style={{display:'flex', alignItems:'center', gap:7, marginBottom:5}}>
                <div style={{width:4, height:4, borderRadius:1, background:s.color, flexShrink:0}}/>
                <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink2, flex:1}}>{s.short}</div>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, flexShrink:0}}>{p.time.split('–')[0].trim()}</div>
              </div>
            );
          })}
          {schedule.length === 0 && <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, opacity:0.5}}>No schedule set — add classes in Schedule.</div>}
          {schedule.filter(p=>!p.subj&&p.room==='Library').map(p => (
            <div key="lib" style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:6}}>2:45 → Study Hall</div>
          ))}
        </div>

        {/* Progress */}
        <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:11}}>Progress</div>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:7}}>Study Streak</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:42, color:T.accent2, lineHeight:0.9, marginBottom:4}}>{streak}</div>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginBottom:14}}>days</div>
          <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, lineHeight:1.6, marginBottom:16}}>{streak > 0 ? `Day ${streak} — keep it going.` : 'Start your streak today.'}</div>
          <div style={{display:'flex', gap:3, flexWrap:'wrap'}}>
            {Array.from({length:14}).map((_,i) => (
              <div key={i} style={{width:11, height:11, borderRadius:2, background: i < streak ? T.accent2 : T.bl}}/>
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

/* ── 2. Homework ────────────────────────────────────────── */
function HomeworkScreen({ profile, userData, onUpdate, onNav, screenAction, onScreenActionHandled }) {
  const subjects  = profile?.subjects || [];
  const subjectBy = makeSubjectBy(subjects);
  const homework  = userData?.homework || [];

  const [showAdd, setShowAdd] = useState(false);
  const urgentColRef = useRef(null);

  useRunScreenAction(screenAction, onScreenActionHandled, (action) => {
    if (action === 'add') setShowAdd(true);
    if (action === 'tonight') setTimeout(() => urgentColRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  });

  const QUICK_ACTIONS = [
    { ic:'+', label:'Add Homework', run: () => setShowAdd(true) },
    { ic:'✦', label:'Generate Study Plan', run: () => onNav?.('schedule') },
    { ic:'+', label:'Create Flashcards', run: () => onNav?.('flashcards', 'add') },
    { ic:'→', label:'Open Due Today', run: () => onNav?.('homework', 'tonight') },
    { ic:'+', label:'Start Focus Session', run: () => onNav?.('schedule', 'focus') },
  ];

  const addHomework = (item) => {
    onUpdate && onUpdate({ homework: [...homework, item] });
  };
  const toggleDone = (id) => {
    onUpdate && onUpdate({ homework: homework.map(h => h.id === id ? { ...h, done: !h.done } : h) });
  };

  const open     = homework.filter(h => !h.done);
  const done     = homework.filter(h => h.done);
  const urgent   = homework.filter(h => h.urgent && !h.done);
  const tonight  = homework.filter(h => h.due === 'Tonight' && !h.done);
  const thisWeek = homework.filter(h => !h.done && !h.urgent && (h.due === 'Tomorrow'));
  const upcoming = homework.filter(h => !h.done && !h.urgent && h.due !== 'Tonight' && h.due !== 'Tomorrow');

  const totalMin = open.reduce((acc, h) => {
    let m = 0;
    const hrs  = h.est ? h.est.match(/(\d+)\s*hr/) : null;
    const mins = h.est ? h.est.match(/(\d+)\s*min/) : null;
    if (hrs)  m += parseInt(hrs[1])  * 60;
    if (mins) m += parseInt(mins[1]);
    return acc + m;
  }, 0);
  const estDisplay = totalMin >= 60 ? `${Math.floor(totalMin/60)}h ${totalMin%60}m` : totalMin > 0 ? `${totalMin}m` : '—';
  const completionPct = homework.length > 0 ? Math.round(done.length / homework.length * 100) : 0;

  const hwBySubject = subjects.map(s => ({
    subj: s, open: open.filter(h => h.subj === s.id).length,
  })).filter(x => x.open > 0);

  const COLS = [
    { label:'URGENT',    color:'#bf4a30', items: urgent   },
    { label:'THIS WEEK', color:T.accent,  items: thisWeek },
    { label:'UPCOMING',  color:'#4285f4', items: upcoming },
    { label:'COMPLETED', color:'#3a8a52', items: done     },
  ];

  const Card = ({hw}) => {
    const s = subjectBy(hw.subj);
    return (
      <div style={{background:T.bl, borderLeft:`2px solid ${s.color}`, padding:'8px 10px', marginBottom:6, cursor:'pointer'}}
        onClick={() => hw.id && toggleDone(hw.id)}
        onMouseOver={e => e.currentTarget.style.background = T.border}
        onMouseOut={e => e.currentTarget.style.background = T.bl}
        title="Click to toggle done"
      >
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:3}}>
          <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink, lineHeight:1.3, textDecoration: hw.done ? 'line-through' : 'none', opacity: hw.done ? 0.5 : 1}}>{hw.title}</div>
          {hw.urgent && !hw.done && (
            <span style={{flexShrink:0, fontFamily:T.mono, fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'#bf4a30', border:'1px solid #bf4a3040', background:'#bf4a300f', padding:'2px 6px', borderRadius:999}}>Urgent</span>
          )}
        </div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{s.short}</span>
          <span style={{fontFamily:T.mono, fontSize:10, color: hw.urgent ? '#bf4a30' : T.ink3}}>{hw.due}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto'}}>
        <AddHomeworkModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addHomework} subjects={subjects} />
        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20}}>
          <div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:6}}>Workload · This Week</div>
            <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
              <span style={{fontFamily:T.ui, fontWeight:700, fontSize:28, color:T.ink}}>Homework, </span>
              <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:30, color:T.ink}}>all of it.</span>
            </h1>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.05em'}}>
              {open.length === 0 ? 'Nothing due — enjoy the break ✓' : `${open.length} assignments open · ${urgent.length} urgent`}
            </div>
          </div>
          <button onClick={() => setShowAdd(true)} style={{padding:'7px 18px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', flexShrink:0}}>+ Add</button>
        </div>

        {/* 5 stat cards */}
        <div className="shq-hw-stats" style={{marginBottom:12}}>
          {[
            { label:'OPEN WORK',   val:open.length,         sub:'assignments',                               accent:T.accent  },
            { label:'URGENT',      val:urgent.length,       sub:'need attention',                            accent:'#bf4a30' },
            { label:'DUE TODAY',   val:tonight.length,      sub:'assignments',                               accent:'#b07020' },
            { label:'EST. TIME',   val:estDisplay,          sub:'remaining',                                 accent:'#2a60a0' },
            { label:'COMPLETION',  val:`${completionPct}%`, sub:`${done.length} of ${homework.length} done`, accent:'#3a8a52' },
          ].map(c => (
            <div key={c.label} style={{background:T.surface, padding:'24px 20px', borderRadius:12, minHeight:100, borderBottom:`2px solid ${c.accent}28`}}>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em', marginBottom:10}}>{c.label}</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:34, color:T.ink, lineHeight:0.9, marginBottom:8}}>{c.val}</div>
              <div style={{fontFamily:T.mono, fontSize:10, color:c.accent}}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Board label */}
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', padding:'10px 0 8px'}}>Assignment Board</div>

        {/* Kanban */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          {COLS.map(col => (
            <div key={col.label} ref={col.label === 'URGENT' ? urgentColRef : null} style={{background:T.surface, borderRadius:12, minHeight:180}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:`1px solid ${T.bl}`}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <div style={{width:6, height:6, borderRadius:'50%', background:col.color}}/>
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{col.label}</div>
                </div>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{col.items.length}</div>
              </div>
              <div style={{padding:'9px 10px'}}>
                {col.items.length === 0
                  ? <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', padding:'22px 0', opacity:0.35}}>EMPTY</div>
                  : col.items.map(h => <Card key={h.title} hw={h}/>)
                }
              </div>
            </div>
          ))}
        </div>

        {/* Floating panel cards */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:12}}>
          {/* By Subject */}
          <div style={{background:T.surface, borderRadius:12, padding:'20px 22px'}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>Homework by Subject</div>
            {hwBySubject.length === 0
              ? <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3}}>No assignments</div>
              : hwBySubject.map(x => (
                  <div key={x.subj.id} style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
                    <div style={{width:28, height:28, borderRadius:'50%', background:`${x.subj.color}18`, border:`1.5px solid ${x.subj.color}50`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      <div style={{width:7, height:7, borderRadius:'50%', background:x.subj.color}}/>
                    </div>
                    <div style={{fontFamily:T.ui, fontSize:12, color:T.ink2, flex:1}}>{x.subj.short}</div>
                    <div style={{fontFamily:T.mono, fontSize:11, color:T.accent, fontWeight:700}}>{x.open}</div>
                  </div>
                ))
            }
          </div>

          {/* Quick Actions */}
          <div style={{background:T.surface, borderRadius:12, padding:'20px 22px'}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>Quick Actions</div>
            {QUICK_ACTIONS.map(({ ic, label, run }) => (
              <div key={label} role="button" tabIndex={0} onClick={run} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } }}
                style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${T.bl}`, cursor:'pointer'}}
                onMouseOver={e => e.currentTarget.style.opacity='0.6'}
                onMouseOut={e => e.currentTarget.style.opacity='1'}
              >
                <div style={{width:28, height:28, borderRadius:'50%', background:T.accentSoft, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <span style={{fontFamily:T.mono, fontSize:11, color:T.accent, fontWeight:700}}>{ic}</span>
                </div>
                <span style={{fontFamily:T.ui, fontSize:12, color:T.ink2}}>{label}</span>
              </div>
            ))}
          </div>

          {/* This Week */}
          <div style={{background:T.surface, borderRadius:12, padding:'20px 22px'}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>This Week</div>
            {[['COMPLETED', done.length],['OPEN', open.length],['AVG. COMPLETION','1.3d early'],['MOST ACTIVE', open.length>0?subjectBy(open[0].subj).short:'—']].map(([l,v]) => (
              <div key={l} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${T.bl}`}}>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{l}</div>
                <div style={{fontFamily:T.mono, fontSize:11, color: l==='AVG. COMPLETION'?T.accent:T.ink, fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}

/* ── 3. Quizzes ─────────────────────────────────────────── */
function QuizzesScreen({ profile, userData, onUpdate }) {
  const subjectBy = makeSubjectBy(profile?.subjects || []);
  const subjects  = profile?.subjects || [];
  const quizzes   = userData?.quizzes || [];
  const [showAdd, setShowAdd] = useState(false);

  const addQuiz = (item) => {
    onUpdate && onUpdate({ quizzes: [...quizzes, item] });
  };

  const cc = (c) => c >= 0.75 ? '#3a8a52' : c >= 0.55 ? '#b07020' : '#bf4a30';
  const cl = (c) => c >= 0.75 ? 'strong' : c >= 0.55 ? 'fair' : 'weak';
  return (
    <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto'}}>
      <AddQuizModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addQuiz} subjects={subjects} />
      <PageHeader eyebrow={`${quizzes.length} upcoming`} title="Quizzes" right={
        <button type="button" onClick={() => setShowAdd(true)} style={{padding:'8px 18px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Add quiz</button>
      } />
      <Hr />
      {quizzes.length === 0 && (
        <div style={{background:T.surface, borderRadius:12, padding:'40px 32px', textAlign:'center', marginBottom:16}}>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink, marginBottom:8}}>No quizzes scheduled yet.</div>
          <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink3, lineHeight:1.6, marginBottom:18}}>Add quiz dates to track readiness and topics to review.</div>
          <button type="button" onClick={() => setShowAdd(true)} style={{padding:'9px 22px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Add your first quiz</button>
        </div>
      )}
      <div style={{display:'flex', flexDirection:'column', gap:12}}>
        {quizzes.map(q => {
          const s = subjectBy(q.subj);
          const pct = Math.round(q.confidence * 100);
          return (
            <div key={q.title} style={{background:T.surface, padding:'26px 32px', display:'grid', gridTemplateColumns:'1fr auto', gap:20, alignItems:'start', borderRadius:12}}>
              <div>
                <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:11}}>
                  <div style={{width:7, height:7, borderRadius:2, background:s.color}} />
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase'}}>{s.name}</div>
                </div>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, lineHeight:1.25, marginBottom:14}}>{q.title}</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:7}}>
                  {(q.topics || []).map(t => (
                    <span key={t} style={{fontFamily:T.mono, fontSize:10, color:T.ink2, background:T.bl, padding:'3px 9px', letterSpacing:'0.02em'}}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{textAlign:'right', flexShrink:0, minWidth:96}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:32, color:T.accent, lineHeight:1, letterSpacing:'-0.02em', marginBottom:10}}>{q.date}</div>
                <div style={{display:'flex', alignItems:'center', gap:7, justifyContent:'flex-end', marginBottom:4}}>
                  <div style={{width:64, height:2.5, background:T.border, borderRadius:2, overflow:'hidden'}}>
                    <div style={{width:`${pct}%`, height:'100%', background:cc(q.confidence), borderRadius:2}} />
                  </div>
                  <span style={{fontFamily:T.mono, fontSize:10, color:cc(q.confidence)}}>{pct}%</span>
                </div>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{cl(q.confidence)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 4. Notes ───────────────────────────────────────────── */
const fmtNoteDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric' });
const makeNotePreview = (body) => (body || '').replace(/\s+/g, ' ').trim().slice(0, 160);

function NoteEditorModal({ open, onClose, onSave, subjects, initial }) {
  const [title, setTitle] = useState('');
  const [subj, setSubj]   = useState('');
  const [body, setBody]   = useState('');
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 320); }, [onClose]);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '');
      setSubj(initial?.subj || subjects[0]?.id || '');
      setBody(initial?.body ?? initial?.preview ?? '');
      setClosing(false);
    }
  }, [open, initial, subjects]);

  useModalA11y(open, dismiss, panelRef);

  if (!open) return null;
  const isEdit = !!(initial && initial.id);
  const submit = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), subj: subj || subjects[0]?.id || '', body });
    dismiss();
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{ width:520, maxWidth:'92vw', background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'36px 32px 28px', position:'relative', opacity:0, outline:'none', boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)', animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards` }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>{isEdit ? 'Edit ' : 'New '}<span style={{color:T.accent}}>note</span></div>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:22}}>Saved to your account · syncs across devices</div>

        <label htmlFor="note-title" style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:6, display:'block'}}>Title</label>
        <input id="note-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Note title" autoFocus
          style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', marginBottom:16}}
          onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />

        {subjects.length > 0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:8}}>Subject</div>
            <div style={{display:'flex', gap:7, flexWrap:'wrap'}}>
              {subjects.map(s => {
                const sel = subj === s.id;
                return (
                  <button key={s.id} onClick={()=>setSubj(s.id)} style={{display:'flex', alignItems:'center', gap:6, padding:'5px 11px', border:`1px solid ${sel ? s.color : T.border}`, background: sel ? s.color+'14' : T.bg, borderRadius:20, cursor:'pointer', fontFamily:T.ui, fontSize:11, color: sel ? T.ink : T.ink3}}>
                    <span style={{width:7, height:7, borderRadius:'50%', background:s.color}} />
                    {s.short}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label htmlFor="note-body" style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:6, display:'block'}}>Body</label>
        <textarea id="note-body" value={body} onChange={e=>setBody(e.target.value)} placeholder="Write your note…" rows={8}
          style={{width:'100%', padding:'12px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:13, lineHeight:1.6, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:24}}
          onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer'}}
            onMouseOver={e=>e.currentTarget.style.background=T.bl} onMouseOut={e=>e.currentTarget.style.background='transparent'}>Cancel</button>
          <button onClick={submit} disabled={!title.trim()} style={{padding:'9px 24px', border:'none', background: title.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:10, color:'#fff', letterSpacing:'0.06em', cursor: title.trim() ? 'pointer' : 'default', fontWeight:600}}>{isEdit ? 'Save changes' : 'Create note'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function NotesScreen({ profile, userData, onUpdate, onNav }) {
  const subjectBy = makeSubjectBy(profile?.subjects || []);
  const subjects  = profile?.subjects || [];
  const notes     = userData?.notes   || [];
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (active) return;
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const openNew  = (subjId) => { setEditTarget(subjId ? { subj: subjId } : null); setEditorOpen(true); };
  const openEdit = (note)   => { setEditTarget(note); setEditorOpen(true); };
  const saveNote = ({ title, subj, body }) => {
    const now = Date.now();
    const preview = makeNotePreview(body);
    if (editTarget && editTarget.id) {
      onUpdate({ notes: notes.map(n => n.id === editTarget.id ? { ...n, title, subj, body, preview, date: fmtNoteDate(now), updatedAt: now } : n) });
    } else {
      const newNote = { id: 'n-' + now.toString(36) + Math.random().toString(36).slice(2,5), subj: subj || subjects[0]?.id || '', title, body, preview, date: fmtNoteDate(now), createdAt: now, updatedAt: now };
      onUpdate({ notes: [newNote, ...notes] });
    }
  };
  const deleteNote = (id) => {
    if (!window.confirm('Delete this note?')) return;
    onUpdate({ notes: notes.filter(n => n.id !== id) });
    setActive(null);
  };

  const runAiAction = (action) => {
    const now = Date.now();
    const stamp = () => fmtNoteDate(now);
    if (action === 'studyGuide') {
      if (!notes.length) return;
      const body = subjects.map(s => {
        const sn = notes.filter(n => n.subj === s.id);
        if (!sn.length) return '';
        return `## ${s.name}\n` + sn.map(n => `- **${n.title}**: ${makeNotePreview(n.body || n.preview)}`).join('\n');
      }).filter(Boolean).join('\n\n');
      const newNote = { id: 'n-' + now, subj: subjects[0]?.id || '', title: 'Study Guide', body, preview: makeNotePreview(body), date: stamp(), createdAt: now, updatedAt: now };
      onUpdate({ notes: [newNote, ...notes] });
      setActive(newNote.id);
      return;
    }
    if (action === 'summarise') {
      if (!notes.length) return;
      const body = subjects.map(s => {
        const sn = notes.filter(n => n.subj === s.id);
        if (!sn.length) return `### ${s.name}\n_No notes yet._`;
        return `### ${s.name}\n` + sn.map(n => `- ${n.title}`).join('\n');
      }).join('\n\n');
      const newNote = { id: 'n-' + now, subj: subjects[0]?.id || '', title: 'Subject Summary', body, preview: makeNotePreview(body), date: stamp(), createdAt: now, updatedAt: now };
      onUpdate({ notes: [newNote, ...notes] });
      setActive(newNote.id);
      return;
    }
    if (action === 'flashcards') {
      const cards = notes.filter(n => n.title.trim()).map((n, i) => ({
        id: 'f-' + now + '-' + i,
        q: n.title,
        a: makeNotePreview(n.body || n.preview) || 'Review this note.',
        subj: n.subj || subjects[0]?.id || '',
        createdAt: now,
        updatedAt: now,
      }));
      if (!cards.length) return;
      const existing = userData?.flashcards || [];
      onUpdate({ flashcards: [...existing, ...cards] });
      onNav?.('flashcards');
      return;
    }
    if (action === 'gaps') {
      const ranked = subjects.map(s => ({ s, count: notes.filter(n => n.subj === s.id).length })).sort((a, b) => a.count - b.count);
      const weak = ranked.filter(x => x.count < 2);
      const body = weak.length
        ? 'Subjects that could use more notes:\n\n' + weak.map(x => `- **${x.s.name}** (${x.count} note${x.count === 1 ? '' : 's'})`).join('\n')
        : 'Nice — every subject has at least two notes. Keep building your knowledge base.';
      const newNote = { id: 'n-' + now, subj: subjects[0]?.id || '', title: 'Knowledge Gaps', body, preview: makeNotePreview(body), date: stamp(), createdAt: now, updatedAt: now };
      onUpdate({ notes: [newNote, ...notes] });
      setActive(newNote.id);
    }
  };

  const AI_ACTIONS = [
    { id:'studyGuide', ic:'✦', label:'Generate study guide',     sub:'Compile all notes into one guide' },
    { id:'summarise',  ic:'◈', label:'Summarise subject notes',  sub:'Outline notes by subject' },
    { id:'flashcards', ic:'⊞', label:'Create flashcard deck',    sub:'Turn note titles into cards' },
    { id:'gaps',       ic:'◉', label:'Find knowledge gaps',      sub:'Spot subjects with few notes' },
  ];

  const noteEditor = <NoteEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} onSave={saveNote} subjects={subjects} initial={editTarget} />;

  if (active) {
    const note = notes.find(n => n.id === active);
    if (!note) { setActive(null); return null; }
    const s = subjectBy(note.subj);
    return (
      <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto'}}>
        {noteEditor}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28}}>
          <button onClick={() => setActive(null)} style={{background:'none', border:'none', padding:0, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', display:'flex', alignItems:'center', gap:7, cursor:'pointer'}}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2L4 6l4 4"/></svg>
            All Notes
          </button>
          <div style={{display:'flex', gap:8}}>
            <button onClick={() => openEdit(note)} style={{padding:'7px 16px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>Edit</button>
            <button onClick={() => deleteNote(note.id)} style={{padding:'7px 16px', border:`1px solid ${T.border}`, background:T.surface, color:'#bf4a30', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>Delete</button>
          </div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:9, marginBottom:16}}>
          <div style={{width:6, height:6, borderRadius:1.5, background:s.color}}/>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.11em', textTransform:'uppercase'}}>{s.name} · {note.date}</div>
        </div>
        <h1 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:38, fontWeight:400, color:T.ink, margin:'0 0 32px', lineHeight:1.15}}>{note.title}</h1>
        <Hr/>
        <div style={{fontFamily:T.serif, fontSize:18, color:T.ink2, lineHeight:1.9, maxWidth:600, whiteSpace:'pre-wrap'}}>
          {note.body || note.preview || <span style={{color:T.ink3, fontStyle:'italic'}}>This note is empty. Use Edit to add content.</span>}
        </div>
      </div>
    );
  }

  const mostRecentNote = notes[0] || null;
  const mostActiveSubj = mostRecentNote ? subjectBy(mostRecentNote.subj) : null;
  const thisWeekNotes  = notes.length;
  const filtered = search
    ? notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) || (n.preview||'').toLowerCase().includes(search.toLowerCase()))
    : notes;
  const subjNotes = subjects.map(s => ({ subj:s, notes: notes.filter(n => n.subj === s.id) }));

  return (
    <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto'}}>
        {noteEditor}
        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20}}>
          <div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:7}}>Notes</div>
            <h1 style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:38, color:T.ink, margin:'0 0 5px', lineHeight:1.05}}>Notes.</h1>
            <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3}}>Your personal knowledge base.</div>
          </div>
          <button onClick={() => openNew()} style={{padding:'8px 18px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', flexShrink:0, marginTop:4}}>+ New note</button>
        </div>

        {/* 4 stat cards */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:12}}>
          {[
            { label:'TOTAL NOTES',      val:notes.length,                                                                                    sub:`${subjects.length} subjects`,                                                                 accent:T.accent,                                   borderLeft:false },
            { label:'ACTIVE SUBJECT',   val:mostActiveSubj ? mostActiveSubj.short : '—',                                                    sub:mostActiveSubj ? `${notes.filter(n=>n.subj===mostActiveSubj.id).length} notes` : 'no notes yet', accent:mostActiveSubj ? mostActiveSubj.color : T.ink3, borderLeft:true  },
            { label:'LAST EDITED',      val:mostRecentNote ? mostRecentNote.date : '—',                                                     sub:mostRecentNote ? mostRecentNote.title.slice(0,20)+'…' : 'no notes yet',                          accent:'#2a60a0',                                  borderLeft:false },
            { label:'KNOWLEDGE GROWTH', val:thisWeekNotes,                                                                                   sub:'notes total',                                                                                     accent:'#3a8a52',                                  borderLeft:false },
          ].map(c => (
            <div key={c.label} style={{background:T.surface, padding:'24px 20px', borderRadius:12, minHeight:100, borderBottom:`2px solid ${c.accent}28`, borderLeft: c.borderLeft ? `3px solid ${c.accent}` : 'none'}}>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>{c.label}</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:c.label==='LAST EDITED'?24:34, color: c.label==='KNOWLEDGE GROWTH'?c.accent:T.ink, lineHeight:0.9, marginBottom:8}}>{c.val}</div>
              <div style={{fontFamily:T.mono, fontSize:10, color:c.accent}}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{position:'relative', marginBottom:1}}>
          <div style={{position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', color:T.ink3, pointerEvents:'none'}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>
          </div>
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes, subjects, tags…"
            style={{width:'100%', padding:'11px 48px', background:T.surface, border:`1px solid ${T.border}`, fontFamily:T.ui, fontSize:13, color:T.ink, outline:'none', boxSizing:'border-box'}}
          />
          <div style={{position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', fontFamily:T.mono, fontSize:10, color:T.ink3}}>⌘K</div>
        </div>

        {/* Recent Notes panel */}
        <div style={{background:T.border, marginBottom:1}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:T.surface, borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:'flex', alignItems:'center', gap:7}}>
              <div style={{width:6, height:6, borderRadius:'50%', background:T.accent}}/>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em'}}>Recent Notes</div>
            </div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{filtered.length}</div>
          </div>
          {filtered.length === 0 ? (
            <div style={{background:T.surface, padding:'48px 24px', textAlign:'center'}}>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink2, marginBottom:6}}>{notes.length === 0 ? 'Nothing here yet' : 'No matching notes'}</div>
              <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, marginBottom:18}}>{notes.length === 0 ? 'Create your first note to start building your knowledge base.' : 'Try a different search.'}</div>
              {notes.length === 0 && <button onClick={() => openNew()} style={{padding:'9px 20px', border:`1px solid ${T.accent}`, background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Create your first note</button>}
            </div>
          ) : (
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:1}}>
            {filtered.map(note => {
              const s = subjectBy(note.subj);
              return (
                <div key={note.id} onClick={() => setActive(note.id)} style={{background:T.surface, padding:'16px 18px', cursor:'pointer', borderRadius:12}}
                  onMouseOver={e => e.currentTarget.style.background = T.bl}
                  onMouseOut={e => e.currentTarget.style.background = T.surface}
                >
                  <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:9}}>
                    <div style={{width:5, height:5, borderRadius:1, background:s.color}}/>
                    <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{s.short}</span>
                    <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginLeft:'auto'}}>{note.date}</span>
                  </div>
                  <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink, marginBottom:6, lineHeight:1.3}}>{note.title}</div>
                  <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, lineHeight:1.6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>{note.preview}</div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        {/* Subject Library */}
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', padding:'9px 0 8px'}}>Subject Library · {subjects.length}</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:12}}>
          {subjNotes.map(({subj:s, notes:sn}) => (
            <div key={s.id} style={{background:T.surface, padding:'15px 16px', borderRadius:12, borderLeft:`3px solid ${s.color}`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink, lineHeight:1.2}}>{s.name}</div>
                <button onClick={() => { const first = sn[0]; if (first) setActive(first.id); else openNew(s.id); }} style={{fontFamily:T.mono, fontSize:10, color:T.ink3, background:'none', border:'none', cursor:'pointer', padding:0, flexShrink:0, marginLeft:6}}>Open →</button>
              </div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginBottom:7}}>{sn.length} notes</div>
              {sn.length > 0 && <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>{sn[0].preview}</div>}
              <button onClick={() => openNew(s.id)} style={{marginTop:9, fontFamily:T.mono, fontSize:10, color:s.color, background:`${s.color}14`, border:`1px solid ${s.color}35`, padding:'4px 10px', cursor:'pointer', letterSpacing:'0.07em'}}>+ Create note</button>
            </div>
          ))}
        </div>

        {/* Floating cards — Knowledge Insights + AI Workspace */}
        <div className="shq-notes-panels" style={{marginTop:12}}>
          <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:14}}>
              <div style={{width:6, height:6, borderRadius:'50%', background:T.accent}}/>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Knowledge Insights</div>
            </div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:3}}>Most Active</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16, color:T.ink, marginBottom:3}}>{mostActiveSubj?.name || '—'}</div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginBottom:14}}>{mostActiveSubj ? notes.filter(n=>n.subj===mostActiveSubj.id).length : 0} notes</div>
            {[['Last Edited', mostRecentNote?.date||'—'],['Total Notes',notes.length],['Subjects',subjects.length]].map(([label,val]) => (
              <div key={label} style={{marginBottom:10}}>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:2}}>{label}</div>
                <div style={{fontFamily:T.ui, fontSize:12, color:T.ink2}}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:13}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <div style={{width:6, height:6, borderRadius:'50%', background:'#6c63ff'}}/>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em'}}>AI Workspace</div>
              </div>
              <span style={{fontFamily:T.mono, fontSize:10, background:'rgba(108,99,255,0.1)', color:'#6c63ff', padding:'2px 6px'}}>AI</span>
            </div>
            {AI_ACTIONS.map(a => (
              <div key={a.id} role="button" tabIndex={0} onClick={() => runAiAction(a.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runAiAction(a.id); } }}
                style={{display:'flex', gap:9, alignItems:'flex-start', padding:'9px 0', borderBottom:`1px solid ${T.bl}`, cursor: notes.length ? 'pointer' : 'default', opacity: notes.length ? 1 : 0.45}}
                onMouseOver={e => { if (notes.length) e.currentTarget.style.opacity='0.65'; }}
                onMouseOut={e => { if (notes.length) e.currentTarget.style.opacity='1'; }}
              >
                <div style={{width:22, height:22, background:T.bl, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:3, flexShrink:0}}>
                  <span style={{fontSize:11, color:'#6c63ff'}}>{a.ic}</span>
                </div>
                <div>
                  <div style={{fontFamily:T.ui, fontSize:12, color:T.ink, fontWeight:500, marginBottom:2}}>{a.label}</div>
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{a.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}

/* ── 5. Flashcards ──────────────────────────────────────── */
function FlashcardEditorModal({ open, onClose, onSave, subjects, initial }) {
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [subj, setSubj] = useState('');
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 320); }, [onClose]);

  useEffect(() => {
    if (open) {
      setQ(initial?.q || '');
      setA(initial?.a || '');
      setSubj(initial?.subj || subjects[0]?.id || '');
      setClosing(false);
    }
  }, [open, initial, subjects]);

  useModalA11y(open, dismiss, panelRef);

  if (!open) return null;
  const isEdit = !!(initial && initial.id);
  const submit = () => {
    if (!q.trim() || !a.trim()) return;
    onSave({ q: q.trim(), a: a.trim(), subj: subj || subjects[0]?.id || '' });
    dismiss();
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{ width:500, maxWidth:'92vw', background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'36px 32px 28px', position:'relative', opacity:0, outline:'none', boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)', animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards` }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>{isEdit ? 'Edit ' : 'New '}<span style={{color:T.accent}}>flashcard</span></div>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:22}}>Saved to your account · syncs across devices</div>

        <label htmlFor="fc-q" style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:6, display:'block'}}>Question / Term</label>
        <textarea id="fc-q" value={q} onChange={e=>setQ(e.target.value)} placeholder="e.g. What is the Central Limit Theorem?" rows={2} autoFocus
          style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:13, lineHeight:1.5, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:16}}
          onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />

        <label htmlFor="fc-a" style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:6, display:'block'}}>Answer / Definition</label>
        <textarea id="fc-a" value={a} onChange={e=>setA(e.target.value)} placeholder="The answer…" rows={3}
          style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:13, lineHeight:1.6, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:16}}
          onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />

        {subjects.length > 0 && (
          <div style={{marginBottom:24}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:8}}>Subject</div>
            <div style={{display:'flex', gap:7, flexWrap:'wrap'}}>
              {subjects.map(s => {
                const sel = subj === s.id;
                return (
                  <button key={s.id} onClick={()=>setSubj(s.id)} style={{display:'flex', alignItems:'center', gap:6, padding:'5px 11px', border:`1px solid ${sel ? s.color : T.border}`, background: sel ? s.color+'14' : T.bg, borderRadius:20, cursor:'pointer', fontFamily:T.ui, fontSize:11, color: sel ? T.ink : T.ink3}}>
                    <span style={{width:7, height:7, borderRadius:'50%', background:s.color}} />
                    {s.short}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer'}}
            onMouseOver={e=>e.currentTarget.style.background=T.bl} onMouseOut={e=>e.currentTarget.style.background='transparent'}>Cancel</button>
          <button onClick={submit} disabled={!q.trim() || !a.trim()} style={{padding:'9px 24px', border:'none', background: (q.trim() && a.trim()) ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:10, color:'#fff', letterSpacing:'0.06em', cursor: (q.trim() && a.trim()) ? 'pointer' : 'default', fontWeight:600}}>{isEdit ? 'Save changes' : 'Create card'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FlashcardsScreen({ profile, userData, onUpdate, screenAction, onScreenActionHandled }) {
  const subjectBy  = makeSubjectBy(profile?.subjects || []);
  const subjects   = profile?.subjects || [];
  const quizzes    = userData?.quizzes    || [];
  const grades     = userData?.grades     || {};
  const flashCards = userData?.flashcards || [];
  const [mode, setMode] = useState(null);
  const [qi, setQi]     = useState(0);
  const [fl, setFl]     = useState(false);
  const [recall, setRecall]     = useState('');
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked]     = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const card = flashCards[qi % Math.max(flashCards.length, 1)] || { q: 'No flashcards yet', a: 'Add your first card to start studying.' };
  const next = (e) => { if (e) e.stopPropagation(); setFl(false); setRecall(''); setRevealed(false); setPicked(null); setQi((qi+1) % Math.max(flashCards.length, 1)); };

  useRunScreenAction(screenAction, onScreenActionHandled, (action) => {
    if (action === 'add') openNew();
  });

  const mcOptions = useMemo(() => {
    if (!flashCards.length) return [];
    const correct = card.a;
    const pool = flashCards.filter((c, i) => i !== qi && c.a && c.a !== correct).map(c => c.a);
    const fillers = ['Not the right definition', 'Only applies in some cases', 'The inverse is true'];
    while (pool.length < 3) pool.push(fillers[pool.length % fillers.length]);
    const opts = [correct, ...pool.slice(0, 3)];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
  }, [flashCards, qi, card.a]);

  const tfRound = useMemo(() => {
    if (!flashCards.length) return { statement: '', isTrue: true };
    const isTrue = qi % 2 === 0;
    if (isTrue) return { statement: card.a, isTrue: true };
    const other = flashCards.find((c, i) => i !== qi && c.a && c.a !== card.a);
    return { statement: other?.q || 'This term is unrelated to the question.', isTrue: false };
  }, [flashCards, qi, card.a, card.q]);

  const openNew  = (subjId) => { setEditTarget(subjId ? { subj: subjId } : null); setEditorOpen(true); };
  const openEditCard = (c)  => { setEditTarget(c); setEditorOpen(true); };
  const saveCard = ({ q, a, subj }) => {
    const now = Date.now();
    if (editTarget && editTarget.id) {
      onUpdate({ flashcards: flashCards.map(c => c.id === editTarget.id ? { ...c, q, a, subj, updatedAt: now } : c) });
    } else {
      const newCard = { id: 'f-' + now.toString(36) + Math.random().toString(36).slice(2,5), q, a, subj: subj || subjects[0]?.id || '', createdAt: now, updatedAt: now };
      onUpdate({ flashcards: [...flashCards, newCard] });
    }
  };
  const deleteCard = (id) => {
    if (!window.confirm('Delete this flashcard?')) return;
    onUpdate({ flashcards: flashCards.filter(c => c.id !== id) });
    setQi(0);
  };
  const cardEditor = <FlashcardEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} onSave={saveCard} subjects={subjects} initial={editTarget} />;
  const backBtn = (
    <button onClick={() => { setMode(null); setFl(false); setQi(0); setRecall(''); setRevealed(false); setPicked(null); }} style={{display:'flex', alignItems:'center', gap:7, background:'none', border:'none', padding:0, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', cursor:'pointer'}}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2L4 6l4 4"/></svg>
      Back to Study Modes
    </button>
  );

  // Modes that need cards but have none → prompt to add.
  if (mode && mode !== 'concepts' && flashCards.length === 0) {
    return (
      <div className="screen-enter" style={{flex:1, display:'flex', flexDirection:'column', padding:'40px 60px'}}>
        {cardEditor}
        <div style={{marginBottom:22}}>{backBtn}</div>
        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center'}}>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink2, marginBottom:8}}>No flashcards yet</div>
          <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, marginBottom:20}}>Create a card to start studying.</div>
          <button onClick={() => openNew()} style={{padding:'10px 22px', border:`1px solid ${T.accent}`, background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Create your first card</button>
        </div>
      </div>
    );
  }

  if (mode === 'concepts') {
    return (
      <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'40px 60px'}}>
        {cardEditor}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
          {backBtn}
          <button onClick={() => openNew()} style={{padding:'7px 16px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ New flashcard</button>
        </div>
        <h1 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:30, fontWeight:400, color:T.ink, margin:'0 0 20px'}}>Key Concepts</h1>
        {flashCards.length === 0 ? (
          <div style={{fontFamily:T.ui, fontSize:13, color:T.ink3}}>No cards yet — add one to build your reference sheet.</div>
        ) : flashCards.map(c => {
          const s = subjectBy(c.subj);
          return (
            <div key={c.id} style={{background:T.surface, borderRadius:12, padding:'16px 18px', marginBottom:10, borderLeft:`3px solid ${s.color}`}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6}}>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{s.short}</div>
                <div style={{display:'flex', gap:10}}>
                  <button onClick={() => openEditCard(c)} style={{fontFamily:T.mono, fontSize:10, color:T.ink3, background:'none', border:'none', cursor:'pointer', padding:0}}>Edit</button>
                  <button onClick={() => deleteCard(c.id)} style={{fontFamily:T.mono, fontSize:10, color:'#bf4a30', background:'none', border:'none', cursor:'pointer', padding:0}}>Delete</button>
                </div>
              </div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16, color:T.ink, marginBottom:4}}>{c.q}</div>
              <div style={{fontFamily:T.ui, fontSize:13, color:T.ink2, lineHeight:1.6}}>{c.a}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (mode === 'type' || mode === 'written') {
    const correct = mode === 'type' && revealed && recall.trim().toLowerCase() === (card.a || '').trim().toLowerCase();
    return (
      <div className="screen-enter" style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'40px 60px 0'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
          {backBtn}
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{qi+1} / {flashCards.length}</div>
        </div>
        <div style={{flex:1, display:'flex', flexDirection:'column'}}>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:14}}>{mode === 'type' ? 'Type the answer' : 'Write what you recall'}</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, lineHeight:1.5, marginBottom:20}}>{card.q}</div>
          <textarea value={recall} onChange={e=>setRecall(e.target.value)} placeholder="Your answer…" rows={mode==='written'?6:3}
            style={{width:'100%', padding:'12px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, lineHeight:1.6, color:T.ink, background:T.surface, outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:16}}
            onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />
          {revealed && (
            <div style={{background:T.accentSoft, border:`1px solid ${T.accent}40`, borderRadius:10, padding:'16px 18px', marginBottom:16}}>
              {mode === 'type' && <div style={{fontFamily:T.mono, fontSize:10, color: correct ? '#3a8a52' : '#b07020', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8}}>{correct ? '✓ Correct' : 'Compare with the answer'}</div>}
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6}}>Answer</div>
              <div style={{fontFamily:T.serif, fontSize:17, color:T.ink, lineHeight:1.6}}>{card.a}</div>
            </div>
          )}
          <div style={{display:'flex', gap:10}}>
            {!revealed
              ? <button onClick={() => setRevealed(true)} style={{padding:'11px 24px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8, fontWeight:600}}>Reveal answer</button>
              : <button onClick={() => next()} style={{padding:'11px 24px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>Next card →</button>}
          </div>
        </div>
        <div style={{height:24, flexShrink:0}}/>
      </div>
    );
  }

  if (mode === 'multiple') {
    const answered = picked !== null;
    const isCorrect = picked === card.a;
    return (
      <div className="screen-enter" style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'40px 60px 0'}}>
        {cardEditor}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
          {backBtn}
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{qi+1} / {flashCards.length}</div>
        </div>
        <div style={{flex:1, display:'flex', flexDirection:'column', maxWidth:560}}>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:14}}>Multiple choice</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, lineHeight:1.5, marginBottom:24}}>{card.q}</div>
          <div style={{display:'flex', flexDirection:'column', gap:10, marginBottom:20}}>
            {mcOptions.map(opt => {
              const sel = picked === opt;
              const showResult = answered && sel;
              const isOptCorrect = opt === card.a;
              let border = T.border, bg = T.surface, color = T.ink;
              if (answered && isOptCorrect) { border = '#3a8a52'; bg = 'rgba(58,138,82,0.1)'; }
              else if (showResult && !isOptCorrect) { border = '#bf4a30'; bg = 'rgba(191,74,48,0.08)'; }
              else if (sel) { border = T.accent; bg = T.accentSoft; }
              return (
                <button key={opt} type="button" disabled={answered} onClick={() => setPicked(opt)}
                  style={{textAlign:'left', padding:'14px 16px', border:`1.5px solid ${border}`, background:bg, borderRadius:10, fontFamily:T.ui, fontSize:14, color, cursor: answered ? 'default' : 'pointer'}}>
                  {opt}
                </button>
              );
            })}
          </div>
          {answered && (
            <div style={{fontFamily:T.mono, fontSize:10, color: isCorrect ? '#3a8a52' : '#b07020', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:16}}>
              {isCorrect ? '✓ Correct' : '✗ Correct answer: ' + card.a}
            </div>
          )}
          {answered && (
            <button type="button" onClick={() => next()} style={{alignSelf:'flex-start', padding:'11px 24px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>Next card →</button>
          )}
        </div>
        <div style={{height:24, flexShrink:0}}/>
      </div>
    );
  }

  if (mode === 'truefalse') {
    const answered = picked !== null;
    const isCorrect = picked === tfRound.isTrue;
    return (
      <div className="screen-enter" style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'40px 60px 0'}}>
        {cardEditor}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
          {backBtn}
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{qi+1} / {flashCards.length}</div>
        </div>
        <div style={{flex:1, display:'flex', flexDirection:'column', maxWidth:560}}>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:14}}>True or false</div>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginBottom:8}}>For: {card.q}</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:T.ink, lineHeight:1.55, marginBottom:28, padding:'20px 22px', background:T.surface, borderRadius:12, border:`1px solid ${T.border}`}}>{tfRound.statement}</div>
          <div style={{display:'flex', gap:12, marginBottom:20}}>
            {[true, false].map(val => {
              const sel = picked === val;
              const showResult = answered && sel;
              let border = T.border, bg = T.surface;
              if (answered && val === tfRound.isTrue) { border = '#3a8a52'; bg = 'rgba(58,138,82,0.1)'; }
              else if (showResult && val !== tfRound.isTrue) { border = '#bf4a30'; bg = 'rgba(191,74,48,0.08)'; }
              else if (sel) { border = T.accent; bg = T.accentSoft; }
              return (
                <button key={String(val)} type="button" disabled={answered} onClick={() => setPicked(val)}
                  style={{flex:1, padding:'14px', border:`1.5px solid ${border}`, background:bg, borderRadius:10, fontFamily:T.mono, fontSize:12, letterSpacing:'0.08em', cursor: answered ? 'default' : 'pointer'}}>
                  {val ? 'TRUE' : 'FALSE'}
                </button>
              );
            })}
          </div>
          {answered && (
            <>
              <div style={{fontFamily:T.mono, fontSize:10, color: isCorrect ? '#3a8a52' : '#b07020', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8}}>
                {isCorrect ? '✓ Correct' : '✗ The statement was ' + (tfRound.isTrue ? 'true' : 'false')}
              </div>
              <div style={{fontFamily:T.ui, fontSize:13, color:T.ink2, marginBottom:16, lineHeight:1.6}}>Answer: {card.a}</div>
              <button type="button" onClick={() => next()} style={{alignSelf:'flex-start', padding:'11px 24px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>Next card →</button>
            </>
          )}
        </div>
        <div style={{height:24, flexShrink:0}}/>
      </div>
    );
  }

  const bestSubj  = pickBestGradedSubject(subjects, grades) || { short:'—', color:T.border };
  const readinessPct = quizzes.length > 0 ? Math.round(quizzes.reduce((a,q)=>a+(q.confidence||0),0)/quizzes.length*100) : null;

  const MODES = [
    {id:'flashcards', ic:'⊟', icC:'#3a8a52', title:'Flashcards',      sub:'Flip — question to answer'    },
    {id:'type',       ic:'Aa', icC:'#bf4a30', title:'Type the answer',  sub:'Type, then self-check'        },
    {id:'written',    ic:'⊟', icC:'#9254de', title:'Written recall',   sub:'Free-write what you know'     },
    {id:'concepts',   ic:'⊞', icC:'#9a9080', title:'Key Concepts',     sub:'Reference sheet of all cards' },
    {id:'multiple',   ic:'⊡', icC:'#2a60a0', title:'Multiple choice',  sub:'Pick the right answer'        },
    {id:'truefalse',  ic:'T/F',icC:'#3a8a52', title:'True / False',    sub:'Is this statement correct?'   },
  ];

  if (mode === 'flashcards') {
    return (
      <div className="screen-enter" style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'40px 60px 0'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
          <button onClick={() => { setMode(null); setFl(false); setQi(0); }} style={{display:'flex', alignItems:'center', gap:7, background:'none', border:'none', padding:0, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', cursor:'pointer'}}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2L4 6l4 4"/></svg>
            Back to Study Modes
          </button>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{qi+1} / {Math.max(flashCards.length, 1)}</div>
        </div>
        <div onClick={() => setFl(!fl)} style={{flex:1, border:`1px solid ${fl?T.accent:T.border}`, padding:'40px 60px', cursor:'pointer', background: fl?T.accentSoft:T.surface, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', transition:'all 0.18s'}}>
          <div style={{fontFamily:T.mono, fontSize:10, color:fl?T.accent:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:20}}>{fl ? 'Answer' : `Question ${qi+1}`}</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:fl?20:24, color:T.ink, lineHeight:1.65, maxWidth:500}}>{fl ? card.a : card.q}</div>
          {!fl && <div style={{fontFamily:T.mono, fontSize:10, color:`${T.ink3}88`, marginTop:22, letterSpacing:'0.1em'}}>click to reveal</div>}
        </div>
        {fl && (
          <div className="shq-fc-rating" style={{marginTop:8, flexShrink:0}}>
            {[['Again','#bf3a1a'],['Good',T.ink3],['Easy',T.accent]].map(([label,color]) => (
              <button key={label} onClick={next} style={{padding:'13px', border:'none', background:T.surface, color, fontFamily:T.serif, fontStyle:'italic', fontSize:15}}
                onMouseOver={e=>e.currentTarget.style.background=T.bl}
                onMouseOut={e=>e.currentTarget.style.background=T.surface}
              >{label}</button>
            ))}
          </div>
        )}
        <div style={{height:24, flexShrink:0}}/>
      </div>
    );
  }

  return (
    <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto'}}>
      {/* Header */}
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20}}>
        <div>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:6}}>Study & Practice · This Week</div>
          <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
            <span style={{fontFamily:T.ui, fontWeight:700, fontSize:28, color:T.ink}}>Study & </span>
            <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:30, color:T.ink}}>practice.</span>
          </h1>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>Practice anytime · all subjects</div>
        </div>
        <button onClick={() => openNew()} style={{padding:'7px 16px', border:`1px solid ${T.accent}`, background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', flexShrink:0, borderRadius:8}}>+ New flashcard</button>
      </div>
      {cardEditor}

      {/* 4 stat cards */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:28}}>
        {[
          {label:'CARDS',             val:flashCards.length,            sub:'cards total',                                       accent:T.accent  },
          {label:'BEST SUBJECT',      val:bestSubj.short,               sub:grades[bestSubj.id] || 'add grades',               accent:bestSubj.color },
          {label:'READINESS',         val:readinessPct != null ? `${readinessPct}%` : '—', sub:readinessPct != null ? 'across upcoming' : 'add quizzes', accent:'#9254de' },
        ].map(c => (
          <div key={c.label} style={{background:T.surface, padding:'24px 22px', borderRadius:12, minHeight:100, borderBottom:`2px solid ${c.accent}28`}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>{c.label}</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:36, color:T.ink, lineHeight:0.9, marginBottom:8}}>{c.val}</div>
            <div style={{fontFamily:T.mono, fontSize:10, color:c.accent}}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Study Modes */}
      <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>Study Modes</div>
      <div className="shq-fc-modes">
        {MODES.map(m => (
          <div key={m.id} style={{background:T.surface, padding:'28px 26px', cursor:'pointer', minHeight:160, position:'relative', overflow:'hidden', borderRadius:12}}
            onMouseOver={e => e.currentTarget.style.background = T.bl}
            onMouseOut={e => e.currentTarget.style.background = T.surface}
          >
            <svg style={{position:'absolute', bottom:-20, right:-20, opacity:0.07}} width={100} height={100} viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="44" stroke={m.icC} strokeWidth="6"/>
            </svg>
            <div style={{width:48, height:48, borderRadius:'50%', background:`${m.icC}18`, border:`1.5px solid ${m.icC}40`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18}}>
              <span style={{fontFamily:T.mono, fontSize:13, color:m.icC, fontWeight:700}}>{m.ic}</span>
            </div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink, marginBottom:5, lineHeight:1.2}}>{m.title}</div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.03em', marginBottom:18}}>{m.sub}</div>
            <button type="button" onClick={() => setMode(m.id)} style={{fontFamily:T.mono, fontSize:10, color:m.icC, background:'none', border:`1px solid ${m.icC}50`, padding:'5px 14px', cursor:'pointer', letterSpacing:'0.07em'}}>START →</button>
          </div>
        ))}
      </div>

      {/* Your cards */}
      <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', margin:'28px 0 14px'}}>Your Cards · {flashCards.length}</div>
      {flashCards.length === 0 ? (
        <div style={{background:T.surface, borderRadius:12, padding:'32px 24px', textAlign:'center'}}>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:18, color:T.ink2, marginBottom:6}}>Nothing here yet</div>
          <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, marginBottom:16}}>Create flashcards to study them in any mode above.</div>
          <button onClick={() => openNew()} style={{padding:'9px 20px', border:`1px solid ${T.accent}`, background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Create your first card</button>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12}}>
          {flashCards.map(c => {
            const s = subjectBy(c.subj);
            return (
              <div key={c.id} style={{background:T.surface, borderRadius:12, padding:'15px 16px', borderLeft:`3px solid ${s.color}`}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7}}>
                  <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{s.short}</span>
                  <div style={{display:'flex', gap:10}}>
                    <button onClick={() => openEditCard(c)} style={{fontFamily:T.mono, fontSize:10, color:T.ink3, background:'none', border:'none', cursor:'pointer', padding:0}}>Edit</button>
                    <button onClick={() => deleteCard(c.id)} style={{fontFamily:T.mono, fontSize:10, color:'#bf4a30', background:'none', border:'none', cursor:'pointer', padding:0}}>Delete</button>
                  </div>
                </div>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink, marginBottom:4, lineHeight:1.3}}>{c.q}</div>
                <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, lineHeight:1.55, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>{c.a}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

}

/* ── 6. Schedule ────────────────────────────────────────── */
const SCHED_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DUE_WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
const PLAN_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PLAN_DAY_FROM_DOW = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' };
const DEFAULT_BELL = [
  { period: '1', subj: '', time: '8:00–8:50', room: '', current: false },
  { period: '2', subj: '', time: '8:55–9:45', room: '', current: false },
  { period: '3', subj: '', time: '9:50–10:40', room: '', current: false },
  { period: '4', subj: '', time: '10:45–11:35', room: '', current: false },
  { period: '5', subj: '', time: '12:15–1:05', room: '', current: false },
  { period: '6', subj: '', time: '1:10–2:00', room: '', current: false },
  { period: '7', subj: '', time: '2:05–2:55', room: '', current: false },
];

function schedTermLabel(date = new Date()) {
  const m = date.getMonth();
  if (m <= 4) return 'Spring';
  if (m <= 7) return 'Summer';
  return 'Fall';
}

function schedParseEstMinutes(est) {
  if (!est) return 30;
  let m = 0;
  const hrs = est.match(/(\d+)\s*hr/);
  const mins = est.match(/(\d+)\s*min/);
  if (hrs) m += parseInt(hrs[1], 10) * 60;
  if (mins) m += parseInt(mins[1], 10);
  return m || 30;
}

function schedFormatEstTotal(minutes) {
  if (minutes <= 0) return '—';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

function schedWeekDates(weekStart) {
  return SCHED_WEEKDAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

function schedHomeworkDayIndex(hw, weekStart, now, weekOffset) {
  if (!hw || hw.done || !hw.due) return -1;
  const weekDates = schedWeekDates(weekStart);
  const findByDow = (dow) => weekDates.findIndex(d => d.getDay() === dow);
  if (DUE_WEEKDAY[hw.due] != null) return findByDow(DUE_WEEKDAY[hw.due]);
  if (weekOffset !== 0) return hw.due === 'Next Week' && weekOffset === 1 ? 0 : -1;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (hw.due === 'Tonight') return weekDates.findIndex(d => d.getTime() === today.getTime());
  if (hw.due === 'Tomorrow') return weekDates.findIndex(d => d.getTime() === tomorrow.getTime());
  return -1;
}

function schedQuizDayIndex(quiz, weekStart, weekOffset) {
  if (!quiz?.date) return -1;
  if (quiz.date === 'Next Week') return weekOffset === 1 ? 0 : -1;
  if (DUE_WEEKDAY[quiz.date] == null) return -1;
  return schedWeekDates(weekStart).findIndex(d => d.getDay() === DUE_WEEKDAY[quiz.date]);
}

function schedPlanDayForDue(due) {
  if (DUE_WEEKDAY[due] != null) return PLAN_DAY_FROM_DOW[DUE_WEEKDAY[due]];
  const now = new Date();
  if (due === 'Tonight') return PLAN_DAY_FROM_DOW[now.getDay()] || 'Monday';
  if (due === 'Tomorrow') {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return PLAN_DAY_FROM_DOW[t.getDay()] || 'Monday';
  }
  if (due === 'Next Week') return 'Monday';
  return null;
}

function buildSchedStudyPlan(homework, quizzes, subjectBy, seed = 0) {
  const buckets = Object.fromEntries(PLAN_DAY_NAMES.map(d => [d, []]));
  const open = homework.filter(h => !h.done);
  const urgent = open.filter(h => h.urgent);
  const rest = open.filter(h => !h.urgent);
  const ordered = [...urgent, ...rest];
  const perDay = Math.max(1, Math.ceil(ordered.length / 4));
  ordered.forEach((hw, i) => {
    const day = schedPlanDayForDue(hw.due) || PLAN_DAY_NAMES[(i + seed) % 5];
    if (!buckets[day]) return;
    if (buckets[day].length >= perDay + 1) return;
    buckets[day].push(`${subjectBy(hw.subj).short}: ${hw.title.slice(0, 36)}${hw.urgent ? ' · urgent' : ''}`);
  });
  quizzes.forEach(q => {
    const day = schedPlanDayForDue(q.date);
    if (!day || !buckets[day]) return;
    buckets[day].push(`Quiz · ${subjectBy(q.subj).short}: ${q.title.slice(0, 30)}`);
  });
  return PLAN_DAY_NAMES.map(day => ({ day, tasks: buckets[day] })).filter(d => d.tasks.length > 0);
}

function ScheduleScreen({ profile, userData, onUpdate, onNav, screenAction, onScreenActionHandled }) {
  const subjects  = profile?.subjects || [];
  const subjectBy = makeSubjectBy(subjects);
  const grades    = userData?.grades   || {};
  const homework  = userData?.homework || [];
  const quizzes   = userData?.quizzes  || [];
  const bellSchedule = userData?.schedule || [];
  const sessions  = userData?.focusSessions || 0;

  const [weekOffset, setWeekOffset] = useState(0);
  const [planOpen, setPlanOpen] = useState(true);
  const [planSeed, setPlanSeed] = useState(0);
  const [bellOpen, setBellOpen] = useState(bellSchedule.length === 0);
  const [editingBell, setEditingBell] = useState(false);
  const [draftBell, setDraftBell] = useState([]);
  const [secs, setSecs] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const focusRef = useRef(null);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useRunScreenAction(screenAction, onScreenActionHandled, (action) => {
    if (action === 'focus') setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecs(s => {
        if (s <= 1) {
          setRunning(false);
          onUpdate && onUpdate({ focusSessions: sessionsRef.current + 1 });
          return 25 * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, onUpdate]);

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  const now = new Date();
  const monOffset = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - monOffset + weekOffset * 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 4);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  const dayCards = SCHED_WEEKDAYS.map((name, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const isToday = d.toDateString() === now.toDateString();
    const dayHW = homework.filter(hw => schedHomeworkDayIndex(hw, weekStart, now, weekOffset) === i);
    const dayQuizzes = quizzes.filter(q => schedQuizDayIndex(q, weekStart, weekOffset) === i);
    return { name, date: d.getDate(), isToday, dayHW, dayQuizzes, itemCount: dayHW.length + dayQuizzes.length };
  });

  const weekendCards = ['Sat', 'Sun'].map((name, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + 5 + i);
    d.setHours(0, 0, 0, 0);
    const isToday = d.toDateString() === now.toDateString();
    const dayHW = weekOffset === 0
      ? homework.filter(hw => !hw.done && ((hw.due === 'Tonight' && isToday) || (hw.due === 'Tomorrow' && i === 1 && now.getDay() === 6)))
      : [];
    return { name, date: d.getDate(), isToday, dayHW };
  });

  const weekItemCount = dayCards.reduce((a, d) => a + d.itemCount, 0)
    + weekendCards.reduce((a, d) => a + d.dayHW.length, 0);
  const weekQuizzes = dayCards.reduce((a, d) => a + d.dayQuizzes.length, 0);
  const urgentCount = homework.filter(h => h.urgent && !h.done).length;
  const openHW = homework.filter(h => !h.done);
  const weekOpenHW = openHW.filter(hw => schedHomeworkDayIndex(hw, weekStart, now, weekOffset) >= 0);
  const estMinutes = weekOpenHW.reduce((acc, h) => acc + schedParseEstMinutes(h.est), 0);
  const unplacedUrgent = openHW.filter(h => h.urgent && schedHomeworkDayIndex(h, weekStart, now, weekOffset) < 0 && weekOffset === 0);
  const planDays = useMemo(
    () => buildSchedStudyPlan(homework, quizzes, subjectBy, planSeed),
    [homework, quizzes, subjectBy, planSeed]
  );
  const barMax = Math.max(...dayCards.map(d => d.itemCount), 1);

  const startBellEdit = () => {
    setDraftBell(bellSchedule.length ? bellSchedule.map(p => ({ ...p })) : DEFAULT_BELL.map(p => ({ ...p })));
    setEditingBell(true);
    setBellOpen(true);
  };
  const saveBell = () => {
    const cleaned = draftBell
      .map(p => ({ period: p.period || '', subj: p.subj || '', room: p.room || '', time: p.time || '', current: !!p.current }))
      .filter(p => p.period || p.subj || p.room || p.time);
    const withOneCurrent = cleaned.map((p, i) => ({ ...p, current: cleaned.some(x => x.current) ? !!p.current : i === 0 }));
    onUpdate && onUpdate({ schedule: withOneCurrent });
    setEditingBell(false);
  };

  const weekLabel = weekOffset === 0 ? 'This week' : weekOffset > 0 ? `+${weekOffset} week` : `${weekOffset} week`;

  const NavBtn = ({ children, onClick, active }) => (
    <button type="button" onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 8, border: `1px solid ${active ? T.accent : T.border}`,
      background: active ? T.accentSoft : T.surface, color: active ? T.accent : T.ink3,
      fontFamily: T.mono, fontSize: 10, letterSpacing: '0.06em', cursor: 'pointer',
    }}>{children}</button>
  );

  const cardStyle = { background: T.surface, borderRadius: 12, border: `1px solid ${T.border}` };

  // Parse bell time string e.g. "8:00–8:50" → {start, end} in minutes
  const parseBellMins = t => {
    if (!t) return null;
    const parts = t.split(/[–\-]/);
    if (parts.length < 2) return null;
    const toMin = s => { const [h,m] = s.trim().split(':').map(Number); return h*60+(m||0); };
    return { start: toMin(parts[0]), end: toMin(parts[1]) };
  };
  const nowMins = now.getHours()*60 + now.getMinutes();
  const activePeriod = bellSchedule.find(p => { const t=parseBellMins(p.time); return t && nowMins>=t.start && nowMins<t.end; });
  const nextPeriod   = bellSchedule.find(p => { const t=parseBellMins(p.time); return t && nowMins<t.start; });
  const activeMins   = activePeriod ? (() => { const t=parseBellMins(activePeriod.time); return t ? t.end - nowMins : null; })() : null;

  return (
    <div className="screen-enter shq-screen-pad" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: 6 }}>
            {schedTermLabel(now)} · {weekLabel}{isWeekend && weekOffset === 0 ? ' · Weekend' : ''}
          </div>
          <h1 style={{ margin: '0 0 5px', lineHeight: 1.1 }}>
            <span style={{ fontFamily: T.ui, fontWeight: 700, fontSize: 28, color: T.ink }}>Your </span>
            <span style={{ fontFamily: T.serif, fontStyle: 'italic', fontWeight: 400, fontSize: 30, color: T.ink }}>schedule.</span>
          </h1>
          <div style={{ fontFamily: T.ui, fontSize: 12, color: T.ink3 }}>
            {fmt(weekStart)} – {fmt(weekEnd)} · {weekItemCount} item{weekItemCount !== 1 ? 's' : ''} this week
            {urgentCount > 0 && <span style={{ color: '#bf4a30', marginLeft: 8 }}>· {urgentCount} urgent</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <NavBtn onClick={() => setWeekOffset(w => w - 1)}>← Week</NavBtn>
          <NavBtn onClick={() => setWeekOffset(w => w + 1)}>Week →</NavBtn>
          <NavBtn active={weekOffset === 0} onClick={() => setWeekOffset(0)}>Today</NavBtn>
        </div>
      </div>

      {/* Top section: 3-col — Bell | Stats+Urgent | Focus */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 260px', gap: 10, marginBottom: 10 }}>

        {/* Bell schedule — vertical */}
        <div style={{ ...cardStyle, padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.13em' }}>Bell Schedule</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {!editingBell && (
                <button type="button" onClick={startBellEdit} style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, background: 'none', border: `1px solid ${T.border}`, padding: '2px 8px', borderRadius: 6, cursor: 'pointer' }}>
                  {bellSchedule.length ? 'Edit' : 'Set up'}
                </button>
              )}
            </div>
          </div>

          {/* Current period highlight */}
          {activePeriod && (() => {
            const s = activePeriod.subj ? subjectBy(activePeriod.subj) : null;
            return (
              <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}30`, borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>In class now</div>
                <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 15, color: T.ink, marginBottom: 6 }}>{s ? s.name : `Period ${activePeriod.period}`}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3 }}>{activePeriod.time}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, fontWeight: 600 }}>{activeMins}m left</div>
                </div>
                <div style={{ height: 3, background: `${T.accent}20`, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ height: '100%', background: T.accent, borderRadius: 2, width: (() => { const t=parseBellMins(activePeriod.time); return t ? `${((nowMins-t.start)/(t.end-t.start))*100}%` : '0%'; })() }}/>
                </div>
              </div>
            );
          })()}

          {/* Period list */}
          {bellSchedule.length === 0 && !editingBell ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 13, color: T.ink3, textAlign: 'center' }}>No schedule yet.<br/>Tap Set up to add periods.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bellSchedule.map((p, i) => {
                const s = p.subj ? subjectBy(p.subj) : null;
                const isActive = activePeriod === p;
                const isPast = (() => { const t=parseBellMins(p.time); return t && nowMins >= t.end; })();
                const isNext = nextPeriod === p;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                    background: isActive ? T.accentSoft : 'transparent',
                    borderRadius: 7, opacity: isPast ? 0.4 : 1,
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: isActive ? T.accent : T.ink3, width: 20, flexShrink: 0 }}>P{p.period}</div>
                    {s && <div style={{ width: 5, height: 5, borderRadius: 1, background: s.color, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.ui, fontSize: 11.5, color: isActive ? T.accent : T.ink2, fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s ? s.name : '—'}
                      </div>
                      {p.time && <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.ink3, marginTop: 1 }}>{p.time}</div>}
                    </div>
                    {isNext && <div style={{ fontFamily: T.mono, fontSize: 8, color: '#4285f4', background: '#4285f410', padding: '1px 5px', borderRadius: 4 }}>NEXT</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bell edit modal */}
        {editingBell && createPortal(
          <div onMouseDown={e => { if (e.target === e.currentTarget) setEditingBell(false); }}
            style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(24,21,14,0.35)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, padding:'22px 24px', width:480, maxWidth:'calc(100vw - 48px)', maxHeight:'80vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(24,21,14,0.18)' }}>
              <div style={{ fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:16 }}>Edit Bell Schedule</div>
              {draftBell.map((p, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 28px', gap:7, alignItems:'center', marginBottom:8 }}>
                  <input value={p.period} onChange={e => setDraftBell(rows => rows.map((r, j) => j===i ? {...r, period:e.target.value} : r))} placeholder="P" style={{ fontFamily:T.mono, fontSize:11, padding:'6px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bg, textAlign:'center' }} />
                  <select value={p.subj} onChange={e => setDraftBell(rows => rows.map((r, j) => j===i ? {...r, subj:e.target.value} : r))} style={{ fontFamily:T.ui, fontSize:11, padding:'6px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bg }}>
                    <option value="">— Subject —</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input value={p.time} onChange={e => setDraftBell(rows => rows.map((r, j) => j===i ? {...r, time:e.target.value} : r))} placeholder="8:00–8:50" style={{ fontFamily:T.mono, fontSize:11, padding:'6px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bg }} />
                  <button type="button" onClick={() => setDraftBell(rows => rows.filter((_, j) => j!==i))} style={{ width:28, height:28, border:`1px solid ${T.border}`, borderRadius:6, background:'none', color:T.ink3, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                </div>
              ))}
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <button type="button" onClick={() => setDraftBell(rows => [...rows, {period:String(rows.length+1), subj:'', time:'', room:'', current:false}])} style={{ fontFamily:T.mono, fontSize:10, color:T.ink3, background:'none', border:`1px solid ${T.border}`, padding:'6px 12px', borderRadius:8, cursor:'pointer' }}>+ Period</button>
                <button type="button" onClick={saveBell} style={{ fontFamily:T.mono, fontSize:10, color:'#fff', background:T.accent, border:'none', padding:'6px 16px', borderRadius:8, cursor:'pointer' }}>Save</button>
                <button type="button" onClick={() => setEditingBell(false)} style={{ fontFamily:T.mono, fontSize:10, color:T.ink3, background:'none', border:`1px solid ${T.border}`, padding:'6px 12px', borderRadius:8, cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        , document.body)}

        {/* Middle: Stats + Urgent */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Tasks Due', val: weekOpenHW.length, color: T.accent },
              { label: 'Quizzes', val: weekQuizzes, color: '#9254de' },
              { label: 'Est. Study', val: schedFormatEstTotal(estMinutes), color: '#2a60a0' },
              { label: 'Urgent', val: urgentCount, color: urgentCount > 0 ? '#bf4a30' : T.ink3 },
            ].map(c => (
              <div key={c.label} style={{ ...cardStyle, padding: '14px 16px', borderBottom: `2px solid ${c.color}28` }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.11em', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 26, color: T.ink, lineHeight: 1 }}>{c.val}</div>
              </div>
            ))}
          </div>

          {/* Urgent items — vertical */}
          {unplacedUrgent.length > 0 && (
            <div style={{ ...cardStyle, padding: '14px 16px', borderLeft: `3px solid #bf4a30`, flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9.5, color: '#bf4a30', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Needs Attention</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {unplacedUrgent.map(hw => {
                  const s = subjectBy(hw.subj);
                  return (
                    <div key={hw.id || hw.title} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', background: '#bf4a3008', borderRadius: 7 }}>
                      <div style={{ width: 4, height: 4, borderRadius: 1, background: s.color, flexShrink: 0 }} />
                      <div style={{ fontFamily: T.ui, fontSize: 12, color: T.ink2, flex: 1 }}>{hw.title}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 9.5, color: '#bf4a30', flexShrink: 0 }}>{hw.due}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Study plan (if no urgent) */}
          {unplacedUrgent.length === 0 && planDays.length > 0 && (
            <div style={{ ...cardStyle, padding: '14px 16px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.11em' }}>Study Plan</div>
                <button type="button" onClick={() => setPlanSeed(s => s + 1)} style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, background: 'none', border: `1px solid ${T.border}`, padding: '2px 7px', borderRadius: 6, cursor: 'pointer' }}>↻</button>
              </div>
              {planDays.map(p => (
                <div key={p.day} style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3, width: 54, flexShrink: 0 }}>{p.day}</div>
                  <div style={{ flex: 1 }}>
                    {p.tasks.map(t => <div key={t} style={{ fontFamily: T.ui, fontSize: 11.5, color: T.ink2, lineHeight: 1.5 }}>{t}</div>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Focus timer — richer */}
        <div ref={focusRef} style={{ ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: 12 }}>Focus Session</div>

          {/* Ring */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ position: 'relative', width: 100, height: 100 }}>
              <svg width={100} height={100} viewBox="-50 -50 100 100" style={{ transform: 'rotate(-90deg)' }}>
                <circle r={42} fill="none" stroke={T.bl} strokeWidth={5} />
                <circle r={42} fill="none" stroke={running ? T.accent : T.ink3} strokeWidth={5}
                  strokeDasharray={`${(secs / (25 * 60)) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                  strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <div style={{ fontFamily: T.mono, fontSize: 20, color: running ? T.accent : T.ink, letterSpacing: '-0.02em' }}>{mm}:{ss}</div>
                <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>remaining</div>
              </div>
            </div>
          </div>

          {/* Session count */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div style={{ background: T.bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 22, color: T.ink, lineHeight: 1 }}>{sessions}</div>
              <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.ink3, marginTop: 3 }}>sessions done</div>
            </div>
            <div style={{ background: T.bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 22, color: T.ink, lineHeight: 1 }}>{Math.round(sessions * 25)}</div>
              <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.ink3, marginTop: 3 }}>min studied</div>
            </div>
          </div>

          {/* Working on */}
          {openHW.length > 0 && (
            <div style={{ background: T.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
              <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Focus on next</div>
              {openHW.slice(0, 2).map((h, i) => {
                const s = subjectBy(h.subj);
                return (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: i < 1 ? 5 : 0 }}>
                    <div style={{ width: 4, height: 4, borderRadius: 1, background: s.color, flexShrink: 0 }} />
                    <div style={{ fontFamily: T.ui, fontSize: 11, color: T.ink2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</div>
                    {h.urgent && <div style={{ fontFamily: T.mono, fontSize: 8, color: '#bf4a30' }}>!</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button type="button" onClick={() => setRunning(r => !r)} style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, background: running ? T.accent : T.bl, color: running ? '#fff' : T.ink, fontFamily: T.mono, fontSize: 10, letterSpacing: '0.06em', cursor: 'pointer' }}>
              {running ? '⏸ Pause' : '▶ Start'}
            </button>
            <button type="button" onClick={() => { setRunning(false); setSecs(25 * 60); }} style={{ padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'none', color: T.ink3, fontFamily: T.mono, fontSize: 10, cursor: 'pointer' }}>↺</button>
          </div>
        </div>
      </div>

      {/* Week grid Mon–Fri */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8 }}>
        {dayCards.map(d => (
          <div key={d.name} style={{
            ...cardStyle, padding: '16px 14px',
            background: d.isToday ? T.accentSoft : T.surface,
            borderTop: `3px solid ${d.isToday ? T.accent : T.border}`,
            minHeight: 140, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9.5, color: d.isToday ? T.accent : T.ink3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{d.name}</div>
              <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 20, color: d.isToday ? T.accent : T.ink3 }}>{d.date}</div>
            </div>
            <div style={{ flex: 1 }}>
              {d.itemCount === 0
                ? <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, opacity: 0.3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Free</div>
                : <>
                    {d.dayQuizzes.map(q => (
                      <div key={q.title} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ background: '#9254de22', borderRadius: 3, padding: '1px 5px', fontFamily: T.mono, fontSize: 8.5, color: '#9254de', flexShrink: 0, marginTop: 1 }}>QUIZ</div>
                        <div style={{ fontFamily: T.ui, fontSize: 11, color: T.ink2, lineHeight: 1.4 }}>{q.title.slice(0, 28)}{q.title.length > 28 ? '…' : ''}</div>
                      </div>
                    ))}
                    {d.dayHW.map(hw => {
                      const s = subjectBy(hw.subj);
                      return (
                        <div key={hw.id || hw.title} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 6 }}>
                          <div style={{ width: 3, height: 3, borderRadius: 1, background: s.color, marginTop: 5, flexShrink: 0 }} />
                          <div style={{ fontFamily: T.ui, fontSize: 11, color: T.ink2, lineHeight: 1.4, flex: 1 }}>
                            {hw.title.slice(0, 28)}{hw.title.length > 28 ? '…' : ''}
                            {hw.urgent && <span style={{ fontFamily: T.mono, fontSize: 9, color: '#bf4a30', marginLeft: 4 }}>!</span>}
                          </div>
                        </div>
                      );
                    })}
                  </>
              }
            </div>
            {d.itemCount > 0 && (
              <div style={{ marginTop: 10, height: 2, background: T.bl, borderRadius: 1, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min((d.itemCount / barMax) * 100, 100)}%`, background: d.isToday ? T.accent : T.ink3, opacity: 0.35, borderRadius: 1 }}/>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Weekend row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {weekendCards.map(d => (
          <div key={d.name} style={{
            ...cardStyle, padding: '16px 18px',
            background: d.isToday ? T.accentSoft : T.surface,
            borderTop: `3px solid ${d.isToday ? T.accent : T.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9.5, color: d.isToday ? T.accent : T.ink3, textTransform: 'uppercase', letterSpacing: '0.09em' }}>{d.name} {d.date}</div>
              {d.isToday && <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.accent, background: T.accentSoft, padding: '2px 6px', borderRadius: 4 }}>TODAY</div>}
            </div>
            {d.dayHW.length > 0 ? d.dayHW.map(hw => {
              const s = subjectBy(hw.subj);
              return (
                <div key={hw.id || hw.title} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ width: 3, height: 3, borderRadius: 1, background: s.color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ fontFamily: T.ui, fontSize: 11.5, color: T.ink2 }}>{hw.title}</div>
                </div>
              );
            }) : (
              <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 13, color: T.ink3 }}>All clear.</div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom 3-col: Streak/XP · Exam countdown · Weakest subject */}
      {(() => {
        // Streak & XP
        const XP_PER_LEVEL = 10;
        const level = Math.floor(sessions / XP_PER_LEVEL) + 1;
        const xp = sessions % XP_PER_LEVEL;
        const xpPct = (xp / XP_PER_LEVEL) * 100;
        const LEVEL_TITLES = ['Freshman','Sophomore','Junior','Senior','Honor Roll','Valedictorian','Scholar','Academic','Magna','Summa'];
        const levelTitle = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];

        // Countdown: find next quiz (soonest weekday)
        const DOW_ORDER = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5 };
        const todayDow = now.getDay(); // 0=Sun,6=Sat
        const sortedQuizzes = [...quizzes].sort((a,b) => (DOW_ORDER[a.date]||99) - (DOW_ORDER[b.date]||99));
        const nextQuiz = sortedQuizzes.find(q => DOW_ORDER[q.date] != null) || sortedQuizzes[0];
        let daysUntil = null;
        if (nextQuiz && DOW_ORDER[nextQuiz.date] != null) {
          const targetDow = DOW_ORDER[nextQuiz.date]; // 1–5
          let diff = targetDow - todayDow;
          if (diff <= 0) diff += 7;
          daysUntil = diff;
        } else if (nextQuiz?.date === 'Next Week') {
          daysUntil = 7;
        }
        const countdownSubj = nextQuiz ? subjectBy(nextQuiz.subj) : null;

        // Weakest subject
        const gradedSubjs = subjects.filter(s => grades[s.id] && GPA_MAP[grades[s.id]] != null);
        const weakest = gradedSubjs.length
          ? gradedSubjs.reduce((a,b) => (GPA_MAP[grades[b.id]]||0) < (GPA_MAP[grades[a.id]]||0) ? b : a)
          : null;
        const weakestGpa = weakest ? (GPA_MAP[grades[weakest.id]] || 0) : null;
        const weakestPct = weakest ? Math.min((weakestGpa / 4.0) * 100, 100) : 0;

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>

            {/* Streak / XP */}
            <div style={{ ...cardStyle, padding: '14px 16px' }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: 10 }}>Scholar Level</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
                <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 36, color: T.accent, lineHeight: 1, letterSpacing: '-0.02em' }}>{level}</div>
                <div style={{ paddingBottom: 4 }}>
                  <div style={{ fontFamily: T.ui, fontWeight: 600, fontSize: 12, color: T.ink }}>{levelTitle}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>{sessions} focus sessions</div>
                </div>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.ink3, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>XP {xp} / {XP_PER_LEVEL}</span>
                <span>Lv {level + 1} →</span>
              </div>
              <div style={{ height: 5, background: T.bl, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${xpPct}%`, background: T.accent, borderRadius: 3, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, marginTop: 7 }}>
                {XP_PER_LEVEL - xp} session{XP_PER_LEVEL - xp !== 1 ? 's' : ''} to next level
              </div>
            </div>

            {/* Exam countdown */}
            <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: 10 }}>Next Exam</div>
              {nextQuiz ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 36, color: daysUntil <= 2 ? '#bf4a30' : T.ink, lineHeight: 1, letterSpacing: '-0.02em' }}>
                      {daysUntil != null ? daysUntil : '?'}
                    </div>
                    <div style={{ paddingBottom: 4, fontFamily: T.mono, fontSize: 9.5, color: T.ink3 }}>days away</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    {countdownSubj && <div style={{ width: 7, height: 7, borderRadius: 2, background: countdownSubj.color, flexShrink: 0 }} />}
                    <div style={{ fontFamily: T.ui, fontWeight: 600, fontSize: 12, color: T.ink }}>{nextQuiz.title}</div>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3 }}>{countdownSubj?.name} · {nextQuiz.date}</div>
                  {daysUntil <= 2 && (
                    <div style={{ marginTop: 8, background: '#bf4a3010', border: '1px solid #bf4a3025', borderRadius: 7, padding: '5px 9px', fontFamily: T.mono, fontSize: 9, color: '#bf4a30' }}>
                      ⚠ Coming up fast — study tonight
                    </div>
                  )}
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 13, color: T.ink3 }}>No exams scheduled yet.</div>
                </div>
              )}
            </div>

            {/* Weakest subject */}
            <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: 10 }}>Needs Work</div>
              {weakest ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: weakest.color, flexShrink: 0 }} />
                    <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 16, color: T.ink }}>{weakest.name}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 36, color: '#bf4a30', lineHeight: 1, letterSpacing: '-0.02em' }}>{grades[weakest.id]}</div>
                    <div style={{ paddingBottom: 4, fontFamily: T.mono, fontSize: 9.5, color: T.ink3 }}>{weakestGpa?.toFixed(1)} GPA pts</div>
                  </div>
                  <div style={{ height: 4, background: T.bl, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${weakestPct}%`, background: '#bf4a30', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontFamily: T.ui, fontSize: 11, color: T.ink3, lineHeight: 1.4 }}>
                    Even 30 minutes this weekend could move the needle.
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 13, color: T.ink3 }}>Add grades to see your weakest subject.</div>
                </div>
              )}
            </div>

          </div>
        );
      })()}

      <div style={{ height: 8 }} />
    </div>
  );
}

/* ── 7. Grades ──────────────────────────────────────────── */
function GradesScreen({ profile, userData, onUpdate, onNav, onRequestSidebar }) {
  const subjects     = profile?.subjects || [];
  const homework     = userData?.homework || [];
  const notes        = userData?.notes    || [];
  const quizzes      = userData?.quizzes  || [];
  const grades       = userData?.grades   || {};
  const gradeHistory = userData?.gradeHistory || [];
  const pastCourses  = userData?.pastCourses  || [];
  const GRADE_OPTS   = ['A+','A','A−','B+','B','B−','C+','C','C−','D','F'];

  const [showPastModal, setShowPastModal] = useState(false);
  const [pastForm, setPastForm] = useState({ name:'', grade:'', type:'regular' });

  const getBonus = (s) => {
    const n = (s.name||'').toUpperCase();
    if (/\bAP\b/.test(n)||/\bIB\b/.test(n)) return 1.0;
    if (/\bHONORS?\b/.test(n)||/\bHON\b/.test(n)) return 0.5;
    return 0;
  };
  const getPastBonus = (type) => type==='ap'||type==='ib' ? 1.0 : type==='honors' ? 0.5 : 0;

  const addPastCourse = () => {
    if (!pastForm.name.trim() || !pastForm.grade) return;
    const entry = { id:'pc-'+Date.now().toString(36), name:pastForm.name.trim(), grade:pastForm.grade, type:pastForm.type };
    onUpdate?.({ pastCourses: [...pastCourses, entry] });
    setPastForm({ name:'', grade:'', type:'regular' });
  };
  const removePastCourse = (id) => onUpdate?.({ pastCourses: pastCourses.filter(c => c.id !== id) });

  const setGrade = (subjId, g) => {
    const prev = grades[subjId];
    let nextGrades = { ...grades };
    let nextHistory = gradeHistory;
    if (!g) {
      delete nextGrades[subjId];
    } else {
      nextGrades[subjId] = g;
      if (g !== prev) nextHistory = appendGradeHistory(gradeHistory, subjId, g);
    }
    onUpdate && onUpdate({ grades: nextGrades, gradeHistory: nextHistory });
  };

  const gpaStr  = calcGPA(subjects, grades);
  const gpaNum  = parseFloat(gpaStr) || 0;
  const openHw  = homework.filter(h => !h.done);

  const graded  = subjects.filter(s => grades[s.id] != null);
  const weightedGpaStr = (() => {
    const current = graded.map(s => Math.min((GPA_MAP[grades[s.id]]||0) + getBonus(s), 5.0));
    const past    = pastCourses.filter(c => GPA_MAP[c.grade]!=null).map(c => Math.min((GPA_MAP[c.grade]||0)+getPastBonus(c.type),5.0));
    const all = [...current, ...past];
    if (!all.length) return '—';
    return (all.reduce((a,b)=>a+b,0)/all.length).toFixed(2);
  })();
  const weightedGpaNum = parseFloat(weightedGpaStr) || 0;

  const bestPerf  = graded.length ? graded.reduce((a,b) => (GPA_MAP[grades[b.id]]||0) > (GPA_MAP[grades[a.id]]||0) ? b : a) : null;
  const needsAttn = graded.length >= 2
    ? graded.reduce((a,b) => (GPA_MAP[grades[b.id]]||0) < (GPA_MAP[grades[a.id]]||0) ? b : a)
    : null;
  const showNeedsAttn = needsAttn && bestPerf && needsAttn.id !== bestPerf.id;

  const month = new Date().getMonth();
  const termLabel = month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';

  const R = 36, circ = 2 * Math.PI * R;
  const makeSubjectById = makeSubjectBy(subjects);

  const recentUpdates = normalizeGradeHistory(gradeHistory)
    .slice(0, 5)
    .map(h => ({ ...h, subj: makeSubjectById(h.subjectId) }))
    .filter(h => h.subj?.id);

  const insights = buildGradeInsights(subjects, grades);
  const { buckets: gradeMix, total: gradedCount } = gradeDistribution(subjects, grades);
  const gradeMixColors = { A: '#3a8a52', B: T.accent, C: '#b07020', D: '#bf4a30', F: '#8a3030' };

  const headerSub = subjects.length === 0
    ? 'Add your classes to start tracking grades.'
    : graded.length === 0
      ? 'Set grades in the table below — your GPA updates automatically.'
      : `GPA ${gpaStr} across ${graded.length} of ${subjects.length} ${subjects.length === 1 ? 'class' : 'classes'}.`;

  const scrollToGradeRow = (id) => {
    document.getElementById(`grade-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const row = document.getElementById(`grade-row-${id}`);
    if (row) {
      row.style.background = T.accentSoft;
      setTimeout(() => { row.style.background = T.surface; }, 1200);
    }
  };

  return (
    <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto', overflowX:'hidden'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:22, flexWrap:'wrap', gap:16}}>
          <div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:7}}>{termLabel} Term · {CY}</div>
            <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
              <span style={{fontFamily:T.ui, fontWeight:700, fontSize:29, color:T.ink}}>Academic </span>
              <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:31, color:T.ink}}>performance.</span>
            </h1>
            <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3}}>{headerSub}</div>
          </div>
          <div style={{display:'flex', gap:8, flexShrink:0}}>
            <button type="button" onClick={() => onRequestSidebar?.('addSubject')} style={{
              display:'flex', alignItems:'center', gap:6, padding:'7px 13px',
              border:'none', background:T.accent, color:'#fff',
              fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8,
            }}>+ Add Subject</button>
            <button type="button" onClick={() => setShowPastModal(true)} style={{
              display:'flex', alignItems:'center', gap:6, padding:'7px 13px',
              border:`1px solid ${T.border}`, background:T.surface, color:T.ink3,
              fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8, transition:'border-color 0.12s',
            }}
              onMouseOver={e => e.currentTarget.style.borderColor = '#4285f4'}
              onMouseOut={e => e.currentTarget.style.borderColor = T.border}
            >
              Past Courses{pastCourses.length > 0 ? ` (${pastCourses.length})` : ''}
            </button>
            {subjects.length > 0 && (
              <button type="button" onClick={() => exportGradesCsv(profile, userData)} style={{
                display:'flex', alignItems:'center', gap:6, padding:'7px 13px',
                border:`1px solid ${T.border}`, background:T.surface, color:T.ink3,
                fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8, transition:'border-color 0.12s',
              }}
                onMouseOver={e => e.currentTarget.style.borderColor = T.accent}
                onMouseOut={e => e.currentTarget.style.borderColor = T.border}
              >
                <svg width="10" height="11" viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="1.5" width="8" height="9" rx="0.8"/><path d="M3 4.5h4M3 6.5h4M3 8.5h2.5"/></svg>
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* 4 stat cards */}
        <div className="shq-grades-stats" style={{marginBottom:12}}>

          {/* Unweighted GPA ring */}
          <div style={{background:T.surface, padding:'20px 22px', display:'flex', alignItems:'center', gap:18, borderRadius:12, borderBottom:`2px solid ${T.accent}30`}}>
            <div style={{position:'relative', flexShrink:0, width:80, height:80}}>
              <svg width={80} height={80} viewBox="-40 -40 80 80" style={{transform:'rotate(-90deg)'}}>
                <circle r={R} fill="none" stroke={T.border} strokeWidth={4.5}/>
                <circle r={R} fill="none" stroke={T.accent} strokeWidth={4.5}
                  strokeDasharray={`${(gpaNum/4)*circ} ${circ}`} strokeLinecap="round"/>
              </svg>
              <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:19, color:T.ink, lineHeight:1}}>{gpaStr}</div>
                <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3}}>/ 4.0</div>
              </div>
            </div>
            <div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:7}}>GPA This Term</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:T.ink, lineHeight:1.15, marginBottom:5}}>{gpaStandingLabel(gpaNum)}</div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>Unweighted · {termLabel} {CY}{graded.length ? ` · ${graded.length} graded` : ''}</div>
            </div>
          </div>

          {/* Weighted GPA ring */}
          <div style={{background:T.surface, padding:'20px 22px', display:'flex', alignItems:'center', gap:18, borderRadius:12, borderBottom:`2px solid #4285f430`}}>
            <div style={{position:'relative', flexShrink:0, width:80, height:80}}>
              <svg width={80} height={80} viewBox="-40 -40 80 80" style={{transform:'rotate(-90deg)'}}>
                <circle r={R} fill="none" stroke={T.border} strokeWidth={4.5}/>
                <circle r={R} fill="none" stroke="#4285f4" strokeWidth={4.5}
                  strokeDasharray={`${Math.min(weightedGpaNum/5,1)*circ} ${circ}`} strokeLinecap="round"/>
              </svg>
              <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:19, color:T.ink, lineHeight:1}}>{weightedGpaStr}</div>
                <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3}}>/ 5.0</div>
              </div>
            </div>
            <div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:7}}>Weighted GPA</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:T.ink, lineHeight:1.15, marginBottom:5}}>{gpaStandingLabel(Math.min(weightedGpaNum,4))}</div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>AP +1.0 · Hon +0.5{pastCourses.length > 0 ? ` · ${pastCourses.length} past` : ''}</div>
            </div>
          </div>

          {/* Best performing */}
          <div style={{background:T.surface, padding:'18px 20px', borderRadius:12, borderBottom:`2px solid #3a8a5230`}}>
            <div style={{fontFamily:T.mono, fontSize:9.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>Best Performing</div>
            {bestPerf ? (<>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink}}>{bestPerf.short}</div>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:26, color:'#3a8a52', lineHeight:1}}>{grades[bestPerf.id]}</div>
              </div>
              <div style={{height:3, background:T.bl, borderRadius:2, overflow:'hidden', marginBottom:5}}>
                <div style={{height:'100%', width:`${Math.min(((GPA_MAP[grades[bestPerf.id]]??0)/4)*100,100)}%`, background:'#3a8a52', borderRadius:2}}/>
              </div>
              <div style={{fontFamily:T.mono, fontSize:9.5, color:'#3a8a52'}}>{(GPA_MAP[grades[bestPerf.id]]??0).toFixed(1)} / 4.0 pts</div>
            </>) : <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3, lineHeight:1.5}}>Log a grade to see.</div>}
          </div>

          {/* Needs attention */}
          <div style={{background:T.surface, padding:'18px 20px', borderRadius:12, borderBottom:`2px solid #bf4a3030`}}>
            <div style={{fontFamily:T.mono, fontSize:9.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>Needs Attention</div>
            {showNeedsAttn ? (<>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink}}>{needsAttn.short}</div>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:26, color:'#bf4a30', lineHeight:1}}>{grades[needsAttn.id]}</div>
              </div>
              <div style={{height:3, background:T.bl, borderRadius:2, overflow:'hidden', marginBottom:5}}>
                <div style={{height:'100%', width:`${Math.min(((GPA_MAP[grades[needsAttn.id]]??0)/4)*100,100)}%`, background:'#bf4a30', borderRadius:2}}/>
              </div>
              <div style={{fontFamily:T.mono, fontSize:9.5, color:'#bf4a30'}}>{(GPA_MAP[grades[needsAttn.id]]??0).toFixed(1)} / 4.0 pts</div>
            </>) : <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3, lineHeight:1.5}}>{graded.length < 2 ? 'Log 2+ grades to compare.' : 'All classes on par.'}</div>}
          </div>

          {/* Open homework */}
          <div style={{background:T.surface, padding:'18px 20px', borderRadius:12, borderBottom:`2px solid #b0702030`, cursor: openHw.length > 0 ? 'pointer' : 'default'}}
            onClick={() => openHw.length > 0 && onNav?.('homework')}
            onMouseOver={e => { if (openHw.length > 0) e.currentTarget.style.background = T.bl; }}
            onMouseOut={e => e.currentTarget.style.background = T.surface}
          >
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>Open Homework</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:36, color: openHw.length > 0 ? '#b07020' : T.ink, lineHeight:0.9, marginBottom:8}}>{openHw.length}</div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginBottom: openHw.length > 0 ? 8 : 0}}>{openHw.length === 1 ? 'assignment due' : 'assignments due'}{openHw.length > 0 ? ' →' : ''}</div>
            {openHw.length > 0 && (() => {
              const bySubj = subjects.map(s => ({ s, count: openHw.filter(h => h.subj === s.id).length })).filter(x => x.count > 0).slice(0, 3);
              return (
                <div style={{borderTop:`1px solid ${T.bl}`, paddingTop:8, display:'flex', flexDirection:'column', gap:4}}>
                  {bySubj.map(({s, count}) => (
                    <div key={s.id} style={{display:'flex', alignItems:'center', gap:6}}>
                      <div style={{width:4, height:4, borderRadius:1, background:s.color, flexShrink:0}}/>
                      <div style={{fontFamily:T.mono, fontSize:9.5, color:T.ink3, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.short}</div>
                      <div style={{fontFamily:T.mono, fontSize:9.5, color:'#b07020'}}>{count}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Bottom section: Subject Balance + Grade Distribution & Insights */}
        {subjects.length > 0 && (
          <div className="shq-grades-mix" style={{marginBottom:12}}>

            {/* Subject Balance radar */}
            {subjects.length >= 3 ? (() => {
              const radarSubjs = subjects.slice(0, 8);
              const n = radarSubjs.length;
              const CX = 85, CY2 = 85, RAD = 58;
              const angleStep = (2 * Math.PI) / n;
              const pt = (i, r) => [CX + r * Math.sin(i * angleStep), CY2 - r * Math.cos(i * angleStep)];
              const gridLines = [1,2,3,4].map(l => radarSubjs.map((_, i) => pt(i, RAD*l/4)).map(p=>p.join(',')).join(' '));
              const dataPoints = radarSubjs.map((s, i) => { const g = grades[s.id] ? (GPA_MAP[grades[s.id]]||0) : 0; return pt(i, Math.max((g/4)*RAD,2)); });
              return (
                <div style={{background:T.surface, borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:14}}>
                  <div style={{flexShrink:0}}>
                    <svg width={170} height={170} viewBox="0 0 170 170">
                      {gridLines.map((pts,l) => <polygon key={l} points={pts} fill="none" stroke={T.border} strokeWidth={0.6} opacity={0.5}/>)}
                      {radarSubjs.map((_,i) => { const [x,y]=pt(i,RAD); return <line key={i} x1={CX} y1={CY2} x2={x} y2={y} stroke={T.border} strokeWidth={0.5} opacity={0.35}/>; })}
                      <polygon points={dataPoints.map(p=>p.join(',')).join(' ')} fill={`${T.accent}20`} stroke={T.accent} strokeWidth={1.5} strokeLinejoin="round"/>
                      {dataPoints.map((p,i) => <circle key={i} cx={p[0]} cy={p[1]} r={2} fill={radarSubjs[i].color}/>)}
                      {radarSubjs.map((s,i) => { const [x,y]=pt(i,RAD+11); return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{fontFamily:T.mono,fontSize:8,fill:T.ink3}}>{s.short||s.name.slice(0,5)}</text>; })}
                    </svg>
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{display:'flex', alignItems:'center', gap:5, marginBottom:5}}>
                      <div style={{width:5, height:5, borderRadius:'50%', background:T.accent}}/>
                      <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em'}}>Subject Balance</div>
                    </div>
                    <div style={{display:'flex', flexDirection:'column', gap:4}}>
                      {radarSubjs.map(s => {
                        const g = grades[s.id]; const gv = g ? (GPA_MAP[g]||0) : null;
                        return (
                          <div key={s.id} style={{display:'flex', alignItems:'center', gap:7}}>
                            <div style={{width:4, height:4, borderRadius:1, background:s.color, flexShrink:0}}/>
                            <div style={{fontFamily:T.ui, fontSize:10.5, color:T.ink2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.short}</div>
                            <div style={{fontFamily:T.mono, fontSize:9.5, fontWeight:600, color: g?(gv>=3.7?'#3a8a52':gv>=3?T.accent:gv>=2?'#b07020':'#bf4a30'):T.border}}>{g||'—'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div style={{background:T.surface, borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3}}>Add 3+ subjects to see Subject Balance.</div>
              </div>
            )}

            {/* Grade Distribution + Grade Insights + Study Activity side by side */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
              <div style={{background:T.surface, borderRadius:12, padding:'18px 22px'}}>
                <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:12}}>
                  <div style={{width:6, height:6, borderRadius:'50%', background:'#3a8a52'}}/>
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Grade Distribution · {gradedCount}/{subjects.length}</div>
                </div>
                {gradedCount === 0
                  ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3}}>Set grades to see the distribution.</div>
                  : ['A','B','C','D','F'].map(letter => (
                    <div key={letter} style={{display:'flex', alignItems:'center', gap:10, marginBottom:8}}>
                      <div style={{width:14, fontFamily:T.mono, fontSize:10, color:T.ink2, fontWeight:600}}>{letter}</div>
                      <div style={{flex:1, height:7, background:T.bl, borderRadius:3, overflow:'hidden'}}>
                        <div style={{height:'100%', width:`${gradedCount?(gradeMix[letter]/gradedCount)*100:0}%`, background:gradeMixColors[letter], borderRadius:3, transition:'width 0.3s'}}/>
                      </div>
                      <div style={{width:16, textAlign:'right', fontFamily:T.mono, fontSize:10, color:T.ink3}}>{gradeMix[letter]}</div>
                    </div>
                  ))
                }
              </div>
              <div style={{background:T.surface, borderRadius:12, padding:'18px 22px', flex:1}}>
                <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:12}}>
                  <div style={{width:6, height:6, borderRadius:'50%', background:'#4285f4'}}/>
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Grade Insights</div>
                </div>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3, lineHeight:1.7}}>
                  {insights || 'Insights appear once you log your first grade.'}
                </div>
              </div>
              {/* Study Activity card */}
              <div style={{background:T.surface, borderRadius:12, padding:'18px 22px'}}>
                <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:12}}>
                  <div style={{width:6, height:6, borderRadius:'50%', background:'#b07020'}}/>
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Study Activity</div>
                </div>
                {(() => {
                  const hwTotal = homework.length;
                  const hwDone = homework.filter(h => h.done).length;
                  const hwOpen = hwTotal - hwDone;
                  const notesTotal = notes.length;
                  const quizzesTotal = quizzes.length;
                  const rows = [
                    { label: 'Homework', done: hwDone, open: hwOpen, total: hwTotal, color: T.accent },
                    { label: 'Notes', done: notesTotal, open: 0, total: notesTotal, color: '#4285f4' },
                    { label: 'Quizzes', done: quizzesTotal, open: 0, total: quizzesTotal, color: '#b07020' },
                  ];
                  return (
                    <div style={{display:'flex', flexDirection:'column', gap:10}}>
                      {rows.map(r => (
                        <div key={r.label}>
                          <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                            <div style={{fontFamily:T.ui, fontSize:11, color:T.ink2}}>{r.label}</div>
                            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>
                              {r.label === 'Homework' ? `${r.done}/${r.total} done` : `${r.total}`}
                            </div>
                          </div>
                          <div style={{height:5, background:T.bl, borderRadius:3, overflow:'hidden'}}>
                            <div style={{height:'100%', width:`${r.total ? (r.done/r.total)*100 : 0}%`, background:r.color, borderRadius:3, transition:'width 0.3s'}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {subjects.length === 0 ? (
          <div style={{background:T.surface, padding:'48px 32px', borderRadius:12, textAlign:'center', maxWidth:480, margin:'0 auto'}}>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:T.ink, marginBottom:8}}>No subjects yet.</div>
            <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink3, lineHeight:1.6, marginBottom:20}}>Add your classes to track letter grades, GPA, and trends in one place.</div>
            <button type="button" onClick={() => onRequestSidebar?.('addSubject')} style={{padding:'9px 22px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Add your first subject</button>
          </div>
        ) : (
        <div className="shq-grades-table" style={{borderRadius:12, overflow:'hidden', border:`1px solid ${T.border}`}}>
        {/* Table header */}
        <div style={{display:'grid', gridTemplateColumns:'280px 1fr 100px 56px 68px 84px', padding:'8px 16px', background:T.surface, borderBottom:`1px solid ${T.border}`}}>
          {['Subject','Progress','Trend','GPA','Grade',''].map((h,i) => (
            <div key={h+i} style={{fontFamily:T.mono, fontSize:9.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em', textAlign: i>0 ? 'center' : 'left'}}>{h}</div>
          ))}
        </div>

        {/* Subject rows */}
        <div style={{display:'flex', flexDirection:'column'}}>
          {subjects.map((s, idx) => {
            const hw        = homework.filter(h => h.subj === s.id);
            const openCount = hw.filter(h => !h.done).length;
            const noteCount = notes.filter(n => n.subj === s.id).length;
            const quizCount = quizzes.filter(q => q.subj === s.id).length;
            const myGrade   = grades[s.id] || '';
            const hasGrade  = !!myGrade;
            const gpaVal    = hasGrade ? (GPA_MAP[myGrade] ?? 0) : null;
            const gradeColor = gpaVal != null
              ? (gpaVal >= 3.7 ? '#3a8a52' : gpaVal >= 3.0 ? T.accent : gpaVal >= 2.0 ? '#b07020' : '#bf4a30')
              : T.ink3;
            return (
              <div key={s.id} id={`grade-row-${s.id}`}
                style={{display:'grid', gridTemplateColumns:'280px 1fr 100px 56px 68px 84px', alignItems:'center', padding:'0 16px', background:T.surface, cursor:'pointer', transition:'background 0.13s', borderTop: idx > 0 ? `1px solid ${T.bl}` : 'none'}}
                onClick={() => onNav?.('subject', s.id)}
                onMouseOver={e => e.currentTarget.style.background = T.bg}
                onMouseOut={e => e.currentTarget.style.background = T.surface}
              >
                {/* Subject name + meta */}
                <div style={{display:'flex', alignItems:'center', gap:10, padding:'12px 0'}}>
                  <div style={{width:3, height:32, borderRadius:2, background:s.color, flexShrink:0}} />
                  <div style={{minWidth:0}}>
                    <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink, lineHeight:1.2, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.name}</div>
                    <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.08em', display:'flex', gap:6}}>
                      {openCount > 0 ? <span style={{color:'#b07020'}}>{openCount} open hw</span> : <span>{hw.length} hw</span>}
                      <span style={{opacity:0.4}}>·</span><span>{quizCount} quiz</span>
                      <span style={{opacity:0.4}}>·</span><span>{noteCount} notes</span>
                    </div>
                  </div>
                </div>
                {/* Grade bar — fills the middle */}
                <div style={{padding:'0 16px'}}>
                  <div style={{height:3, background:T.bl, borderRadius:2, overflow:'hidden'}}>
                    {hasGrade && <div style={{height:'100%', width:`${Math.min((gpaVal/4)*100,100)}%`, background:gradeColor, borderRadius:2, transition:'width 0.3s'}}/>}
                  </div>
                </div>
                {/* Sparkline */}
                <div style={{display:'flex', justifyContent:'center', alignItems:'center'}}>
                  {(() => {
                    const pts = gradeSparklinePoints(gradeHistory, s.id);
                    if (!pts) return <span style={{fontFamily:T.mono, fontSize:11, color:T.border}}>—</span>;
                    return (
                      <svg width={80} height={18} viewBox="0 0 108 18" style={{overflow:'visible'}}>
                        <polyline points={pts} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    );
                  })()}
                </div>
                {/* GPA */}
                <div style={{fontFamily:T.mono, fontSize:12, color: hasGrade ? T.ink2 : T.border, textAlign:'center', fontWeight:500}}>
                  {gpaVal != null ? gpaVal.toFixed(1) : '—'}
                </div>
                {/* Grade */}
                <div style={{display:'flex', justifyContent:'center'}}>
                  <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize: hasGrade ? 20 : 13, color: hasGrade ? gradeColor : T.border, lineHeight:1}}>
                    {myGrade || '—'}
                  </div>
                </div>
                {/* Grade setter */}
                <div style={{display:'flex', justifyContent:'center'}} onClick={e => e.stopPropagation()}>
                  <select value={myGrade} onChange={e => setGrade(s.id, e.target.value)}
                    aria-label={`Set grade for ${s.name}`}
                    style={{background: hasGrade ? T.bl : T.accentSoft, border:`1.5px solid ${hasGrade ? T.border : T.accent}`, padding:'5px 8px', fontFamily:T.mono, fontSize:10, color: hasGrade ? T.ink3 : T.accent, cursor:'pointer', appearance:'none', textAlign:'center', width:68, borderRadius:8, transition:'border-color 0.12s'}}
                    onMouseOver={e => e.currentTarget.style.borderColor = s.color}
                    onMouseOut={e => e.currentTarget.style.borderColor = hasGrade ? T.border : T.accent}
                  >
                    <option value="">{hasGrade ? 'Change' : 'Set'}</option>
                    {GRADE_OPTS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{display:'flex', justifyContent:'space-between', padding:'7px 16px', background:T.surface, borderTop:`1px solid ${T.border}`}}>
          <div style={{fontFamily:T.mono, fontSize:9.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'} · use Set to log grades</div>
          <div style={{fontFamily:T.mono, fontSize:9.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{graded.length} of {subjects.length} graded</div>
        </div>
        </div>
        )}


      {/* Past Courses modal */}
      {showPastModal && createPortal(
        <div style={{position:'fixed',inset:0,zIndex:9000,background:'rgba(24,21,14,0.35)',display:'flex',alignItems:'center',justifyContent:'center'}}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowPastModal(false); }}>
          <div style={{background:T.surface,borderRadius:16,padding:'24px 28px',width:520,maxWidth:'calc(100vw - 32px)',maxHeight:'80vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(24,21,14,0.22)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div>
                <div style={{fontFamily:T.mono,fontSize:9.5,color:T.ink3,textTransform:'uppercase',letterSpacing:'0.13em',marginBottom:4}}>Weighted GPA</div>
                <div style={{fontFamily:T.serif,fontStyle:'italic',fontSize:20,color:T.ink}}>Past Courses</div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <label style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',border:`1px solid ${T.border}`,borderRadius:7,cursor:'pointer',fontFamily:T.mono,fontSize:10,color:T.ink3,background:T.bg}}>
                  <svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M5.5 1v8M2.5 6l3 3 3-3M1 11h9"/></svg>
                  Import PDF
                  <input type="file" accept=".pdf" style={{display:'none'}} onChange={async e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async ev => {
                      const b64 = ev.target.result.split(',')[1];
                      try {
                        const res = await fetch('/api/parse-grades-pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pdf: b64 }) });
                        const { courses } = await res.json();
                        if (courses?.length) onUpdate?.({ pastCourses: [...pastCourses, ...courses.map(c => ({...c, id:'pc-'+Date.now().toString(36)+Math.random().toString(36).slice(2)}))] });
                      } catch(err) { alert('Could not parse PDF. Try adding courses manually.'); }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}/>
                </label>
                <button type="button" onClick={() => setShowPastModal(false)}
                  style={{background:'none',border:`1px solid ${T.border}`,color:T.ink3,fontFamily:T.mono,fontSize:10,padding:'5px 12px',borderRadius:7,cursor:'pointer'}}>Done</button>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:8,alignItems:'flex-end',marginBottom:16}}>
              <div>
                <div style={{fontFamily:T.mono,fontSize:9,color:T.ink3,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Course name</div>
                <input value={pastForm.name} onChange={e => setPastForm(f=>({...f,name:e.target.value}))}
                  placeholder="e.g. AP Chemistry"
                  onKeyDown={e => e.key==='Enter' && addPastCourse()}
                  style={{width:'100%',background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,padding:'7px 10px',fontFamily:T.ui,fontSize:12,color:T.ink,outline:'none',boxSizing:'border-box',height:34}}
                  onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border}/>
              </div>
              <div>
                <div style={{fontFamily:T.mono,fontSize:9,color:T.ink3,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Grade</div>
                <select value={pastForm.grade} onChange={e=>setPastForm(f=>({...f,grade:e.target.value}))}
                  style={{width:'100%',background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,padding:'7px 10px',fontFamily:T.mono,fontSize:12,color:T.ink,cursor:'pointer',boxSizing:'border-box',appearance:'none',WebkitAppearance:'none',height:34}}>
                  <option value="">—</option>
                  {GRADE_OPTS.map(g=><option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontFamily:T.mono,fontSize:9,color:T.ink3,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Type</div>
                <select value={pastForm.type} onChange={e=>setPastForm(f=>({...f,type:e.target.value}))}
                  style={{width:'100%',background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,padding:'7px 10px',fontFamily:T.mono,fontSize:12,color:T.ink,cursor:'pointer',boxSizing:'border-box',appearance:'none',WebkitAppearance:'none',height:34}}>
                  <option value="regular">Regular</option>
                  <option value="honors">Honors +0.5</option>
                  <option value="ap">AP / IB +1.0</option>
                </select>
              </div>
              <button type="button" onClick={addPastCourse} disabled={!pastForm.name.trim()||!pastForm.grade}
                style={{padding:'7px 14px',border:'none',background:pastForm.name.trim()&&pastForm.grade?T.accent:T.border,color:'#fff',fontFamily:T.mono,fontSize:9.5,cursor:pastForm.name.trim()&&pastForm.grade?'pointer':'default',borderRadius:7,alignSelf:'flex-end'}}>Add</button>
            </div>
            {pastCourses.length === 0
              ? <div style={{fontFamily:T.serif,fontStyle:'italic',fontSize:13,color:T.ink3,padding:'12px 0'}}>No past courses yet. Add them above to improve your weighted GPA.</div>
              : <div style={{borderTop:`1px solid ${T.bl}`}}>
                  {pastCourses.map((c,i) => {
                    const weighted = Math.min((GPA_MAP[c.grade]||0)+getPastBonus(c.type),5.0);
                    const col = weighted>=4.5?'#3a8a52':weighted>=3.5?T.accent:weighted>=2.5?'#b07020':'#bf4a30';
                    return (
                      <div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<pastCourses.length-1?`1px solid ${T.bl}`:'none'}}>
                        <div style={{flex:1,fontFamily:T.ui,fontSize:12.5,color:T.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</div>
                        <div style={{fontFamily:T.mono,fontSize:9,color:T.ink3,textTransform:'uppercase',letterSpacing:'0.07em',flexShrink:0}}>{c.type==='ap'?'AP/IB':c.type==='honors'?'Hon':'Reg'}</div>
                        <div style={{fontFamily:T.mono,fontSize:12,color:col,fontWeight:600,flexShrink:0,minWidth:28,textAlign:'center'}}>{c.grade}</div>
                        <div style={{fontFamily:T.mono,fontSize:10,color:T.ink3,flexShrink:0}}>{weighted.toFixed(1)}</div>
                        <button type="button" onClick={()=>removePastCourse(c.id)}
                          style={{background:'none',border:'none',color:T.ink3,fontSize:16,cursor:'pointer',padding:'0 4px',lineHeight:1,opacity:0.45}}
                          onMouseOver={e=>e.currentTarget.style.opacity='1'} onMouseOut={e=>e.currentTarget.style.opacity='0.45'}>×</button>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        </div>
      , document.body)}
    </div>
  );
}

function AddToolModal({ open, onClose, onSave }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('PRODUCTIVITY');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const dismiss = useCallback(() => { setClosing(true); setTimeout(onClose, 320); }, [onClose]);

  useEffect(() => {
    if (open) {
      setName('');
      setUrl('');
      setDesc('');
      setCat('PRODUCTIVITY');
      setColor(PRESET_COLORS[0]);
      setClosing(false);
    }
  }, [open]);

  useModalA11y(open, dismiss, panelRef);
  if (!open) return null;

  const submit = () => {
    if (!name.trim() || !url.trim()) return;
    onSave({
      id: makeCustomToolId(name.trim()),
      name: name.trim(),
      url: url.trim(),
      desc: desc.trim() || `Open ${name.trim()} in a new tab.`,
      cat,
      color,
      custom: true,
    });
    dismiss();
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="shq-modal-box" style={{
        width:420, maxWidth:'92vw', background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'36px 32px 28px', position:'relative', opacity:0, outline:'none',
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button aria-label="Close dialog" onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>

        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>Add a <span style={{color:T.accent}}>tool</span></div>
        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:22}}>Name · URL · category</div>

        <div style={{marginBottom:14}}>
          <label htmlFor="tool-modal-name" style={MODAL_LABEL}>Name</label>
          <input id="tool-modal-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. ChatGPT" autoFocus
            style={MODAL_FIELD} {...focusBorder} />
        </div>

        <div style={{marginBottom:14}}>
          <label htmlFor="tool-modal-url" style={MODAL_LABEL}>URL</label>
          <input id="tool-modal-url" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="https://chat.openai.com"
            style={MODAL_FIELD} {...focusBorder} />
        </div>

        <div style={{marginBottom:14}}>
          <label htmlFor="tool-modal-desc" style={MODAL_LABEL}>Description <span style={{opacity:0.6, textTransform:'none', letterSpacing:0}}>(optional)</span></label>
          <input id="tool-modal-desc" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description for the tools list"
            style={MODAL_FIELD} {...focusBorder} />
        </div>

        <div style={{marginBottom:14}}>
          <div style={MODAL_LABEL}>Category</div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {TOOL_CATS.map(c => (
              <button key={c} type="button" onClick={() => setCat(c)} style={{
                padding:'7px 12px', border:`1px solid ${cat===c ? T.accent : T.border}`,
                background: cat===c ? T.accentSoft : 'transparent', borderRadius:8,
                fontFamily:T.mono, fontSize:10, color: cat===c ? T.accent : T.ink3,
                fontWeight: cat===c ? 600 : 400, cursor:'pointer',
              }}>{c}</button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:22}}>
          <div style={MODAL_LABEL}>Color</div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {PRESET_COLORS.map(c => (
              <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} style={{
                width:22, height:22, borderRadius:6, background:c, border: color===c ? `2px solid ${T.ink}` : '2px solid transparent', cursor:'pointer', padding:0,
              }} />
            ))}
          </div>
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button type="button" onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer'}}
            onMouseOver={e => e.currentTarget.style.background=T.bl} onMouseOut={e => e.currentTarget.style.background='transparent'}>Cancel</button>
          <button type="button" onClick={submit} disabled={!name.trim() || !url.trim()} style={{padding:'9px 24px', border:'none', background: name.trim() && url.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:10, color:'#fff', letterSpacing:'0.06em', cursor: name.trim() && url.trim() ? 'pointer' : 'default', fontWeight:600}}>Add Tool</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── 8. Tools ───────────────────────────────────────────── */
function ToolsScreen({ userData, onUpdate }) {
  const [filter, setFilter] = useState('ALL');
  const [breakdownPeriod, setBreakdownPeriod] = useState('all');
  const [showAddTool, setShowAddTool] = useState(false);
  const cats = ['ALL','AI','DESIGN','PRODUCTIVITY'];
  const customTools = userData?.customTools || [];
  const allTools = useMemo(() => getAllTools(customTools), [customTools]);
  const validToolIds = useMemo(() => toolIdSet(allTools), [allTools]);
  const filtered = filter === 'ALL' ? allTools : allTools.filter(t => t.cat === filter);
  const toolOpens = userData?.toolOpens || [];
  const weekOpens = toolOpensThisWeek(toolOpens);
  const recentOpens = normalizeToolOpens(toolOpens, validToolIds);
  const lastOpen = recentOpens[0] || null;
  const lastTool = lastOpen ? toolById(lastOpen.toolId, allTools) : null;
  const counts = toolOpenCounts(toolOpens);
  const periodKey = breakdownPeriod === 'week' ? 'week' : 'all';
  const periodCounts = toolOpenCountsInPeriod(toolOpens, periodKey);
  const trackedTools = allTools
    .filter(t => periodCounts[t.id] > 0)
    .map(t => ({ ...t, sessions: periodCounts[t.id] }))
    .sort((a, b) => b.sessions - a.sessions);
  const maxSessions = trackedTools[0]?.sessions || 1;
  const connectedCount = connectedToolsCount(toolOpens);
  const topTool = allTools
    .map(t => ({ ...t, sessions: counts[t.id] || 0 }))
    .sort((a, b) => b.sessions - a.sessions)[0];
  const topToolEntry = topTool?.sessions > 0 ? topTool : null;
  const notesCount = userData?.notes?.length || 0;
  const suggestions = buildToolSuggestions(toolOpens, { notesCount, tools: allTools });
  const usageInsight = buildToolUsageInsight(toolOpens, periodKey, allTools.length);

  const openTool = (tool) => {
    if (tool?.id) onUpdate && onUpdate({ toolOpens: appendToolOpen(toolOpens, tool.id, validToolIds) });
    if (tool?.url) window.open(tool.url, '_blank', 'noopener,noreferrer');
  };

  const addCustomTool = (tool) => {
    onUpdate && onUpdate({ customTools: [...customTools, tool] });
  };

  const QUICK_LAUNCH = [
    { tool: allTools.find(t => t.id==='claude'),     label:'Ask Claude a question', sub:'Start new conversation', key:'⌘1' },
    { tool: allTools.find(t => t.id==='figma'),      label:'New Figma file',        sub:'Open design canvas',     key:'⌘2' },
    { tool: allTools.find(t => t.id==='notebooklm'), label:'Open NotebookLM',       sub:'Study from your notes',  key:'⌘3' },
    { tool: allTools.find(t => t.id==='notion'),     label:'New Notion page',       sub:'Capture & organise',     key:'⌘4' },
  ].filter(ql => ql.tool?.id);

  useEffect(() => {
    const onKey = (e) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const n = Number(e.key);
      if (n < 1 || n > 4) return;
      e.preventDefault();
      const tool = QUICK_LAUNCH[n - 1]?.tool;
      if (!tool?.id) return;
      onUpdate && onUpdate({ toolOpens: appendToolOpen(toolOpens, tool.id, validToolIds) });
      if (tool.url) window.open(tool.url, '_blank', 'noopener,noreferrer');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolOpens, onUpdate, validToolIds]);

  const statCards = [
    { label:'THIS WEEK', val:String(weekOpens), sub: weekOpens > 0 ? (weekOpens === 1 ? 'open this week' : 'opens this week') : 'Open any tool to start', accent:T.accent },
    { label:'TOP TOOL', val:topToolEntry?.name || '—', sub: topToolEntry ? `${topToolEntry.sessions} session${topToolEntry.sessions === 1 ? '' : 's'}` : 'No sessions yet', accent:topToolEntry?.color || T.ink3 },
    { label:'CONNECTED', val:`${connectedCount}/${allTools.length}`, sub: connectedCount > 0 ? `${connectedCount} tool${connectedCount === 1 ? '' : 's'} tracked` : 'Use a tool to track it', accent:'#3a8a52' },
    { label:'LAST OPENED', val:lastTool?.name || '—', sub: lastOpen ? formatToolWhen(lastOpen.at) : 'No activity yet', accent:'#4285f4' },
  ];

  const TOOL_ROW_COLS = 'minmax(180px,1fr) 88px 64px 80px 56px';

  const TrendBadge = ({ trend }) => {
    if (trend === 'up') return <span style={{fontFamily:T.mono, fontSize:10, color:'#3a8a52'}}>↑ Up</span>;
    if (trend === 'down') return <span style={{fontFamily:T.mono, fontSize:10, color:'#bf4a30'}}>↓ Down</span>;
    if (trend === 'flat') return <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>→ Flat</span>;
    return <span style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>—</span>;
  };

  return (
    <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto'}}>
        <AddToolModal open={showAddTool} onClose={() => setShowAddTool(false)} onSave={addCustomTool} />

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12}}>
          <div>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:6}}>External Apps</div>
            <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
              <span style={{fontFamily:T.ui, fontWeight:700, fontSize:28, color:T.ink}}>Your </span>
              <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:30, color:T.ink}}>command center.</span>
            </h1>
            <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3}}>Opens in a new tab · ⌘1–4 for quick launch</div>
          </div>
          <button type="button" onClick={() => setShowAddTool(true)} style={{
            padding:'7px 18px', border:'none', background:T.accent, color:'#fff',
            fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8, flexShrink:0,
          }}>+ Add Tool</button>
        </div>

        {/* Stat cards */}
        <div className="shq-tools-stats" style={{marginBottom:12}}>
          {statCards.map(c => (
            <div key={c.label} style={{background:T.surface, padding:'20px 22px', borderRadius:12, borderBottom:`2px solid ${c.accent}28`}}>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em', marginBottom:12}}>{c.label}</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:30, color:T.ink, lineHeight:1.1, marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c.val}</div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Insights row */}
        <div className="shq-tools-mid" style={{marginBottom:12, background:'transparent'}}>

          {/* Intelligent suggestions */}
          <div className="shq-tools-mid-card" style={{background:T.surface, padding:'12px 16px', borderRadius:12}}>
            <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:10}}>
              <div style={{width:6, height:6, borderRadius:'50%', background:'#3a8a52', flexShrink:0}} />
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', flex:1}}>Intelligent Suggestions</div>
              {suggestions.length > 0 && <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{suggestions.length} active</div>}
            </div>
            <div className="shq-tools-mid-body">
            {suggestions.length === 0
              ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3, lineHeight:1.5}}>You've tried every tool — keep exploring.</div>
              : suggestions.map((sg, i) => (
              <div key={i} style={{display:'flex', alignItems:'center', gap:9, padding:'7px 0', borderBottom: i < suggestions.length - 1 ? `1px solid ${T.bl}` : 'none'}}>
                <ToolBrandIcon tool={sg.tool} size={22} />
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:1}}>
                    <span style={{fontFamily:T.ui, fontSize:11.5, color:T.ink, fontWeight:500}}>{sg.tool.name}</span>
                    <span style={{fontFamily:T.mono, fontSize:10, padding:'1px 5px', background:T.bl, color:T.ink3, letterSpacing:'0.07em'}}>TIP</span>
                  </div>
                  <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, lineHeight:1.4}}>{sg.msg}</div>
                </div>
                <button type="button" onClick={() => openTool(sg.tool)} style={{fontFamily:T.mono, fontSize:10, color:T.accent, background:'none', border:'none', padding:0, flexShrink:0, cursor:'pointer'}}>{sg.action} →</button>
              </div>
            ))}
            </div>
          </div>

          {/* Usage breakdown */}
          <div className="shq-tools-mid-card" style={{background:T.surface, padding:'12px 16px', borderRadius:12}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Usage Breakdown</div>
              <select
                value={breakdownPeriod}
                onChange={e => setBreakdownPeriod(e.target.value)}
                style={{background:T.bl, border:`1px solid ${T.border}`, borderRadius:6, padding:'2px 7px', fontFamily:T.mono, fontSize:10, color:T.ink3, cursor:'pointer'}}
              >
                <option value="all">All Time</option>
                <option value="week">This Week</option>
              </select>
            </div>
            <div className="shq-tools-mid-body">
            {trackedTools.length === 0
              ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3, lineHeight:1.5}}>No usage data yet.</div>
              : trackedTools.slice(0, 3).map((tool, i, arr) => (
              <div key={tool.id} style={{padding:'7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.bl}` : 'none'}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, minWidth:0}}>
                    <div style={{width:5, height:5, borderRadius:'50%', background:tool.color, flexShrink:0}} />
                    <span style={{fontFamily:T.ui, fontSize:11.5, color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{tool.name}</span>
                  </div>
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, flexShrink:0}}>{tool.sessions}</div>
                </div>
                <div style={{height:2, background:T.bl, borderRadius:1, overflow:'hidden'}}>
                  <div style={{width:`${(tool.sessions / maxSessions) * 100}%`, height:'100%', background:tool.color, opacity:0.65}} />
                </div>
              </div>
            ))}
            </div>
          </div>

          {/* Usage insight */}
          <div className="shq-tools-mid-card" style={{background:T.surface, padding:'12px 16px', display:'flex', flexDirection:'column', borderRadius:12}}>
            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
              <span style={{color:T.accent, fontSize:10, lineHeight:1}}>★</span>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Usage Insight</div>
            </div>
            <div className="shq-tools-mid-body" style={{gap:10}}>
            {usageInsight
              ? usageInsight.split(/(?<=\.)\s+/).map((sentence, i) => (
                <div key={i} style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13.5, color: i === 0 ? T.ink2 : T.ink3, lineHeight:1.55}}>
                  {sentence}
                </div>
              ))
              : <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13.5, color:T.ink3, lineHeight:1.55}}>Use your tools to generate insights.</div>
            }
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, paddingTop:4, borderTop:`1px solid ${T.bl}`}}>
              {connectedCount} of {allTools.length} tools tracked · {weekOpens} open{weekOpens !== 1 ? 's' : ''} this week
            </div>
            </div>
          </div>
        </div>

        {/* Bottom: tool table + sidebar */}
        <div className="shq-tools-bottom">

          {/* Left: unified tool card with filters */}
          <div className="shq-tools-main">
            <div className="shq-tools-main-card" style={{background:T.surface, borderRadius:12, overflow:'hidden'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, padding:'12px 14px', borderBottom:`1px solid ${T.bl}`, flexWrap:'wrap'}}>
                {cats.map(c => {
                  const count = c === 'ALL' ? allTools.length : allTools.filter(t => t.cat === c).length;
                  const act = filter === c;
                  return (
                    <button key={c} onClick={() => setFilter(c)} style={{
                      padding:'6px 14px', borderRadius:20,
                      border: act ? `1.5px solid ${T.accent}` : '1.5px solid transparent',
                      background: act ? T.accentSoft : T.bl,
                      color: act ? T.accent : T.ink3,
                      fontFamily:T.mono, fontSize:10, letterSpacing:'0.09em',
                      cursor:'pointer', transition:'all 0.12s', whiteSpace:'nowrap',
                    }}>
                      {c} <span style={{opacity:0.55}}>{count}</span>
                    </button>
                  );
                })}
                <div style={{marginLeft:'auto', fontFamily:T.mono, fontSize:10, color:T.ink3}}>{filtered.length} shown</div>
              </div>

              <div className="shq-tools-table">
                <div style={{display:'grid', gridTemplateColumns:TOOL_ROW_COLS, gap:8, padding:'7px 16px', borderBottom:`1px solid ${T.border}`, background:T.surface}}>
                  {['TOOL','7D ACTIVITY','SESSIONS','LAST USED','TREND'].map((h, i) => (
                    <div key={h} style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', textAlign: i > 0 ? 'center' : 'left'}}>{h}</div>
                  ))}
                </div>

                {filtered.map((tool, idx) => {
                  const sessions = counts[tool.id] || 0;
                  const lastAt = toolLastUsedAt(tool.id, toolOpens);
                  const sparkPts = toolActivitySparkline(tool.id, toolOpens);
                  const trend = toolTrend(tool.id, toolOpens);
                  return (
                    <div key={tool.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTool(tool); } }}
                      onClick={() => openTool(tool)}
                      style={{display:'grid', gridTemplateColumns:TOOL_ROW_COLS, gap:8, alignItems:'center', padding:'12px 16px', background:T.surface, cursor:'pointer', transition:'background 0.1s', borderBottom: idx < filtered.length - 1 ? `1px solid ${T.bl}` : 'none'}}
                      onMouseOver={e => e.currentTarget.style.background = T.bl}
                      onMouseOut={e => e.currentTarget.style.background = T.surface}
                    >
                      <div style={{display:'flex', alignItems:'center', gap:11, minWidth:0}}>
                        <ToolBrandIcon tool={tool} size={28} />
                        <div style={{minWidth:0}}>
                          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                            <span style={{fontFamily:T.ui, fontSize:13, color:T.ink, fontWeight:500}}>{tool.name}</span>
                            <span style={{fontFamily:T.mono, fontSize:10, padding:'1.5px 5px', background:T.bl, color:T.ink3, letterSpacing:'0.07em', borderRadius:3}}>{tool.cat}</span>
                          </div>
                          <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{tool.desc}</div>
                        </div>
                      </div>
                      <div style={{display:'flex', justifyContent:'center', alignItems:'center'}}>
                        {sparkPts
                          ? <svg width={56} height={18} viewBox="0 0 56 18" style={{display:'block'}}><polyline points={sparkPts} fill="none" stroke={tool.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
                          : <svg width={56} height={18} viewBox="0 0 56 18" style={{display:'block'}}><line x1={2} y1={9} x2={54} y2={9} stroke={T.border} strokeWidth={1} strokeDasharray="2 2"/></svg>
                        }
                      </div>
                      <div style={{fontFamily:T.mono, fontSize:11, color:T.ink2, textAlign:'center'}}>{sessions}</div>
                      <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textAlign:'center'}}>{formatToolLastUsed(lastAt)}</div>
                      <div style={{display:'flex', justifyContent:'center'}} onClick={e => e.stopPropagation()}>
                        <TrendBadge trend={trend} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="shq-tools-side">

            <div className="shq-tools-quick" style={{background:T.surface, borderRadius:12, padding:'16px 18px'}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Quick Launch</div>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>⌘1–4</div>
              </div>
              {QUICK_LAUNCH.map((ql, i) => (
                <button key={i} type="button" onClick={() => openTool(ql.tool)}
                  style={{display:'flex', alignItems:'center', gap:9, padding:'7px 0', borderBottom: i < QUICK_LAUNCH.length - 1 ? `1px solid ${T.bl}` : 'none', cursor:'pointer', width:'100%', background:'none', borderLeft:'none', borderRight:'none', borderTop:'none', textAlign:'left'}}
                  onMouseOver={e => e.currentTarget.style.background = T.bl}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ToolBrandIcon tool={ql.tool} size={22} />
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:1}}>{ql.label}</div>
                    <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3}}>{ql.sub}</div>
                  </div>
                  <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, flexShrink:0}}>{ql.key}</div>
                </button>
              ))}
            </div>

            <div className="shq-tools-activity" style={{background:T.surface, borderRadius:12, padding:'16px 18px'}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
                <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Activity</div>
                <div style={{fontFamily:T.mono, fontSize:10, color:'#3a8a52', letterSpacing:'0.08em'}}>Live</div>
              </div>
              <div className="shq-tools-activity-list">
              {recentOpens.length === 0
                ? <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, lineHeight:1.7}}>No activity yet. Open a tool to start tracking.</div>
                : recentOpens.slice(0, 6).map((entry, i, arr) => {
                  const tool = toolById(entry.toolId, allTools);
                  if (!tool) return null;
                  return (
                    <button key={entry.id} type="button" onClick={() => openTool(tool)}
                      style={{gap:8, padding:'0 2px', borderBottom: i < arr.length - 1 ? `1px solid ${T.bl}` : 'none', width:'100%', background:'none', border:'none', borderTop:'none', borderLeft:'none', borderRight:'none', cursor:'pointer', textAlign:'left'}}
                      onMouseOver={e => e.currentTarget.style.opacity = '0.7'}
                      onMouseOut={e => e.currentTarget.style.opacity = '1'}
                    >
                      <div style={{width:5, height:5, borderRadius:1, background:tool.color, flexShrink:0}} />
                      <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{tool.name}</div>
                      <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, flexShrink:0}}>{formatToolWhen(entry.at)}</div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
    </div>
  );
}

/* ── 9. Subjects ────────────────────────────────────────── */
function SubjectsScreen({ profile, userData, onNav, onRequestSidebar }) {
  const subjects = profile?.subjects || [];
  const homework = userData?.homework || [];
  const quizzes  = userData?.quizzes  || [];
  const notes    = userData?.notes    || [];
  const grades   = userData?.grades   || {};
  const gradeHistory = userData?.gradeHistory || [];

  const openHw  = homework.filter(h => !h.done);
  const gpaStr  = calcGPA(subjects, grades);
  const graded  = subjects.filter(s => grades[s.id] && grades[s.id] !== '—');
  const termLabel = profile?.term ? `${profile.term.charAt(0).toUpperCase()}${profile.term.slice(1)}` : 'Spring';

  const topGpa = graded.length
    ? graded.reduce((a, b) => (GPA_MAP[grades[b.id]] || 0) > (GPA_MAP[grades[a.id]] || 0) ? b : a)
    : null;
  const bottomGpa = graded.length >= 2
    ? graded.reduce((a, b) => (GPA_MAP[grades[b.id]] || 0) < (GPA_MAP[grades[a.id]] || 0) ? b : a)
    : null;

  return (
    <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto', overflowX:'hidden'}}>

      {/* Header */}
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:22, flexWrap:'wrap', gap:16}}>
        <div>
          <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:7}}>
            {subjects.length} {subjects.length === 1 ? 'class' : 'classes'} · {termLabel} Term
          </div>
          <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
            <span style={{fontFamily:T.ui, fontWeight:700, fontSize:29, color:T.ink}}>Your </span>
            <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:31, color:T.ink}}>subjects.</span>
          </h1>
          <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3}}>
            {subjects.length === 0
              ? 'Add your classes to track homework, grades, and quizzes.'
              : `${openHw.length} open assignment${openHw.length !== 1 ? 's' : ''} · ${graded.length} of ${subjects.length} graded`}
          </div>
        </div>
        <div style={{display:'flex', gap:8, flexShrink:0}}>
          <button type="button" onClick={() => onRequestSidebar?.('addSubject')} style={{
            display:'flex', alignItems:'center', gap:6, padding:'7px 13px', border:'none',
            background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10,
            letterSpacing:'0.07em', cursor:'pointer', borderRadius:8,
          }}>+ Add Subject</button>
          {subjects.length > 0 && (
            <button type="button" onClick={() => onRequestSidebar?.('manageSubjects')} style={{
              display:'flex', alignItems:'center', gap:6, padding:'7px 13px',
              border:`1px solid ${T.border}`, background:T.surface, color:T.ink3,
              fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8,
            }}
              onMouseOver={e => e.currentTarget.style.borderColor = T.accent}
              onMouseOut={e => e.currentTarget.style.borderColor = T.border}
            >Manage</button>
          )}
        </div>
      </div>

      {subjects.length === 0 ? (
        <div style={{background:T.surface, padding:'48px 32px', borderRadius:12, textAlign:'center', maxWidth:480, margin:'0 auto'}}>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:T.ink, marginBottom:8}}>No subjects yet.</div>
          <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink3, lineHeight:1.6, marginBottom:20}}>Add your classes to start tracking homework, grades, and quizzes in one place.</div>
          <button type="button" onClick={() => onRequestSidebar?.('addSubject')} style={{padding:'9px 22px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:10, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Add your first subject</button>
        </div>
      ) : (
        <>
          {/* Term overview strip */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20}}>
            {[
              { label:'Classes', val:subjects.length, sub:`${termLabel} Term`, color:T.accent },
              { label:'Open HW', val:openHw.length, sub:openHw.length === 1 ? 'assignment due' : 'assignments due', color:openHw.length > 0 ? '#b07020' : T.ink3 },
              { label:'Quizzes', val:quizzes.length, sub:'this term', color:'#4285f4' },
              { label:'Term GPA', val:gpaStr, sub:graded.length ? `${graded.length} of ${subjects.length} graded` : 'log grades to track', color:'#3a8a52' },
            ].map(c => (
              <div key={c.label} style={{background:T.surface, borderRadius:12, padding:'16px 20px', borderBottom:`2px solid ${c.color}30`}}>
                <div style={{fontFamily:T.mono, fontSize:9.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:7}}>{c.label}</div>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:26, color:T.ink, lineHeight:1, marginBottom:4}}>{c.val}</div>
                <div style={{fontFamily:T.mono, fontSize:9.5, color:c.color}}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Subject cards */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
            {subjects.map(s => {
              const hw        = homework.filter(h => h.subj === s.id && !h.done);
              const allHw     = homework.filter(h => h.subj === s.id);
              const doneHw    = allHw.filter(h => h.done).length;
              const qz        = quizzes.filter(q => q.subj === s.id);
              const noteCount = notes.filter(n => n.subj === s.id).length;
              const myGrade   = grades[s.id] || null;
              const hasGrade  = !!myGrade;
              const gpaVal    = hasGrade ? (GPA_MAP[myGrade] ?? 0) : null;
              const sparkPts  = gradeSparklinePoints(gradeHistory, s.id, 120, 28);
              const gradeColor = gpaVal != null
                ? (gpaVal >= 3.7 ? '#3a8a52' : gpaVal >= 3.0 ? T.accent : gpaVal >= 2.0 ? '#b07020' : '#bf4a30')
                : T.ink3;

              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onNav?.('subject', s.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav?.('subject', s.id); }}}
                  style={{
                    background:T.surface, borderRadius:12, overflow:'hidden',
                    cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s',
                    borderTop:`3px solid ${s.color}`,
                  }}
                  onMouseOver={e => { e.currentTarget.style.boxShadow='0 6px 24px -8px rgba(24,21,14,0.14)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                  onMouseOut={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none'; }}
                >
                  <div style={{padding:'14px 16px 14px'}}>
                    {/* Subject name + grade */}
                    <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:10}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontFamily:T.mono, fontSize:9, color:s.color, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4}}>{s.short}</div>
                        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink, lineHeight:1.25, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.name}</div>
                      </div>
                      <div style={{textAlign:'right', flexShrink:0}}>
                        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:hasGrade ? 24 : 18, color:gradeColor, lineHeight:1}}>{hasGrade ? myGrade : '—'}</div>
                        {gpaVal != null && <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, marginTop:2}}>{gpaVal.toFixed(1)} GPA</div>}
                      </div>
                    </div>

                    {/* GPA bar */}
                    <div style={{height:3, background:T.bl, borderRadius:2, overflow:'hidden', marginBottom: sparkPts ? 10 : 14}}>
                      <div style={{height:'100%', width: hasGrade ? `${Math.min((gpaVal/4)*100,100)}%` : '0%', background:s.color, borderRadius:2, transition:'width 0.4s'}}/>
                    </div>

                    {/* Sparkline — only if history exists */}
                    {sparkPts && (
                      <div style={{marginBottom:12}}>
                        <svg width="100%" height={28} viewBox="0 0 120 28" preserveAspectRatio="none" style={{display:'block'}}>
                          <polyline points={sparkPts} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75}/>
                        </svg>
                      </div>
                    )}

                    {/* Stats — compact pills */}
                    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                      <div style={{
                        display:'flex', alignItems:'center', gap:4, padding:'3px 7px',
                        background: hw.length > 0 ? '#b0702014' : T.bl,
                        borderRadius:5, flex:1, minWidth:0,
                      }}>
                        <div style={{width:5, height:5, borderRadius:'50%', background: hw.length > 0 ? '#b07020' : T.ink3, flexShrink:0}}/>
                        <div style={{fontFamily:T.mono, fontSize:9, color: hw.length > 0 ? '#b07020' : T.ink3, whiteSpace:'nowrap'}}>
                          {hw.length > 0 ? `${hw.length} due` : allHw.length > 0 ? `${doneHw}/${allHw.length} HW` : '0 HW'}
                        </div>
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:4, padding:'3px 7px', background:T.bl, borderRadius:5}}>
                        <div style={{width:5, height:5, borderRadius:'50%', background: qz.length > 0 ? '#4285f4' : T.ink3, flexShrink:0}}/>
                        <div style={{fontFamily:T.mono, fontSize:9, color: qz.length > 0 ? '#4285f4' : T.ink3}}>{qz.length} QZ</div>
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:4, padding:'3px 7px', background:T.bl, borderRadius:5}}>
                        <div style={{width:5, height:5, borderRadius:'50%', background:T.ink3, flexShrink:0}}/>
                        <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3}}>{noteCount} notes</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add subject card */}
            {subjects.length < 10 && (
              <button type="button" onClick={() => onRequestSidebar?.('addSubject')}
                style={{
                  background:'transparent', borderRadius:12, border:`1.5px dashed ${T.border}`,
                  cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', gap:8, minHeight:160,
                  transition:'border-color 0.15s, background 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor=T.accent; e.currentTarget.style.background=`${T.accent}06`; }}
                onMouseOut={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background='transparent'; }}
              >
                <div style={{width:28, height:28, borderRadius:7, border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.mono, fontSize:18, color:T.ink3, lineHeight:1}}>+</div>
                <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase'}}>Add Subject</div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Subject Detail Screen ──────────────────────────────── */
function SubjectDetailScreen({ profile, userData, onUpdate, onNav, screenAction }) {
  const subjectId = screenAction;
  const subjects  = profile?.subjects || [];
  const s         = subjects.find(s => s.id === subjectId);
  const homework  = userData?.homework  || [];
  const quizzes   = userData?.quizzes   || [];
  const notes     = userData?.notes     || [];
  const grades    = userData?.grades    || {};
  const gradeHistory = userData?.gradeHistory || [];

  if (!s) {
    return (
      <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto'}}>
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:18, color:T.ink3, marginTop:40}}>Subject not found.</div>
        <button type="button" onClick={() => onNav?.('subjects')} style={{marginTop:16, fontFamily:T.mono, fontSize:10, color:T.accent, background:'none', border:'none', padding:0, cursor:'pointer'}}>← Back to subjects</button>
      </div>
    );
  }

  const hw        = homework.filter(h => h.subj === s.id && !h.done);
  const doneHw    = homework.filter(h => h.subj === s.id && h.done);
  const subjQz    = quizzes.filter(q => q.subj === s.id);
  const subjNotes = notes.filter(n => n.subj === s.id);
  const myGrade   = grades[s.id] || null;
  const gpaVal    = myGrade ? GPA_MAP[myGrade] : null;
  const gradeColor = gpaVal != null ? (gpaVal >= 3.7 ? '#3a8a52' : gpaVal >= 3.0 ? T.accent : '#bf4a30') : T.ink3;
  const sparkPts  = gradeSparklinePoints(gradeHistory, s.id, 200, 32);

  const toggleHw = (id) => {
    onUpdate?.({ homework: homework.map(h => h.id === id ? { ...h, done: !h.done } : h) });
  };

  const fmtDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  };

  return (
    <div className="screen-enter shq-screen-pad" style={{flex:1, overflowY:'auto'}}>
      {/* Header */}
      <div style={{marginBottom:22}}>
        <button type="button" onClick={() => onNav?.('subjects')} style={{fontFamily:T.mono, fontSize:10, color:T.ink3, background:'none', border:'none', padding:'0 0 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:5}}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2L4 6l4 4"/></svg>
          Subjects
        </button>
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap'}}>
          <div style={{display:'flex', alignItems:'center', gap:14}}>
            <div style={{width:40, height:40, borderRadius:10, background:`${s.color}18`, border:`2px solid ${s.color}50`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
              <div style={{width:12, height:12, borderRadius:3, background:s.color}} />
            </div>
            <div>
              <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:4}}>{s.short || s.name}</div>
              <h1 style={{margin:0, lineHeight:1.1}}>
                <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:30, color:T.ink}}>{s.name}</span>
              </h1>
            </div>
          </div>
          {myGrade && (
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:42, color:gradeColor, lineHeight:0.9, letterSpacing:'-0.02em'}}>{myGrade}</div>
              {gpaVal != null && <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:5}}>{gpaVal.toFixed(1)} GPA</div>}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14}}>
        {[
          { label:'OPEN HW',  val:hw.length,        accent: hw.length > 0 ? '#b07020' : T.ink3 },
          { label:'QUIZZES',  val:subjQz.length,    accent:'#2a60a0' },
          { label:'NOTES',    val:subjNotes.length, accent:T.accent },
        ].map(c => (
          <div key={c.label} style={{background:T.surface, padding:'14px 16px', borderRadius:10, borderBottom:`2px solid ${c.accent}28`}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em', marginBottom:6}}>{c.label}</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:26, color:c.accent === T.ink3 ? T.ink : c.accent, lineHeight:1}}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Grade bar + sparkline */}
      {myGrade && (
        <div style={{background:T.surface, borderRadius:12, padding:'16px 20px', marginBottom:14}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em'}}>Grade Progress</div>
            <div style={{fontFamily:T.mono, fontSize:10, color:gradeColor}}>{myGrade}</div>
          </div>
          <div style={{height:3, background:T.border, borderRadius:2, overflow:'hidden', marginBottom: sparkPts ? 12 : 0}}>
            <div style={{width:`${Math.min((gpaVal / 4) * 100, 100)}%`, height:'100%', background:s.color, borderRadius:2, transition:'width 0.3s'}} />
          </div>
          {sparkPts && (
            <svg width="100%" height={32} viewBox="0 0 200 32" preserveAspectRatio="none" style={{display:'block'}}>
              <polyline points={sparkPts} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
        {/* Open Homework */}
        <div style={{background:T.surface, borderRadius:12, padding:'16px 18px'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Open Homework</div>
            <button type="button" onClick={() => onNav?.('homework')} style={{fontFamily:T.mono, fontSize:10, color:T.accent, background:'none', border:'none', padding:0, cursor:'pointer'}}>All →</button>
          </div>
          {hw.length === 0
            ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3}}>All caught up.</div>
            : hw.map((h, i) => (
              <div key={h.id} onClick={() => toggleHw(h.id)} style={{display:'flex', alignItems:'flex-start', gap:9, padding:'7px 0', borderBottom: i < hw.length - 1 ? `1px solid ${T.bl}` : 'none', cursor:'pointer'}}>
                <div style={{width:14, height:14, borderRadius:3, border:`1.5px solid ${T.border}`, marginTop:1, flexShrink:0}} />
                <div style={{minWidth:0}}>
                  <div style={{fontFamily:T.ui, fontSize:12, color:T.ink, lineHeight:1.3}}>{h.title}</div>
                  {h.due && <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:2}}>Due {fmtDate(h.due)}</div>}
                </div>
              </div>
            ))
          }
          {doneHw.length > 0 && (
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:10}}>{doneHw.length} completed</div>
          )}
        </div>

        {/* Quizzes */}
        <div style={{background:T.surface, borderRadius:12, padding:'16px 18px'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Quizzes</div>
            <button type="button" onClick={() => onNav?.('quizzes')} style={{fontFamily:T.mono, fontSize:10, color:T.accent, background:'none', border:'none', padding:0, cursor:'pointer'}}>All →</button>
          </div>
          {subjQz.length === 0
            ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3}}>No quizzes scheduled.</div>
            : subjQz.map((q, i) => (
              <div key={q.id} style={{padding:'7px 0', borderBottom: i < subjQz.length - 1 ? `1px solid ${T.bl}` : 'none'}}>
                <div style={{fontFamily:T.ui, fontSize:12, color:T.ink, lineHeight:1.3}}>{q.title}</div>
                {q.date && <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:2}}>{fmtDate(q.date)}</div>}
                {q.readiness && <div style={{fontFamily:T.mono, fontSize:10, color:T.accent, marginTop:2}}>Readiness: {q.readiness}/5</div>}
              </div>
            ))
          }
        </div>

        {/* Notes */}
        <div style={{background:T.surface, borderRadius:12, padding:'16px 18px', gridColumn:'1 / -1'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
            <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Notes</div>
            <button type="button" onClick={() => onNav?.('notes')} style={{fontFamily:T.mono, fontSize:10, color:T.accent, background:'none', border:'none', padding:0, cursor:'pointer'}}>All notes →</button>
          </div>
          {subjNotes.length === 0
            ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3}}>No notes for this subject yet.</div>
            : <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:10}}>
                {subjNotes.map(n => (
                  <div key={n.id} style={{background:T.bg, borderRadius:8, padding:'12px 14px', borderLeft:`2px solid ${s.color}`}}>
                    <div style={{fontFamily:T.ui, fontSize:12, color:T.ink, fontWeight:500, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{n.title}</div>
                    <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical'}}>{n.preview || n.body}</div>
                    {n.date && <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:6}}>{n.date}</div>}
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

/* ── Welcome Screen ─────────────────────────────────────── */
function WelcomeScreen({ onSignIn, onSetup }) {
  const [mouse, setMouse]       = useState({x:-999, y:-999});
  const [overlay, setOverlay]   = useState(false);
  const [grade, setGrade]       = useState('');
  const [googleUser, setGoogleUser] = useState(null);
  const [gLoading, setGLoading]     = useState(false);
  const [gError, setGError]         = useState('');

  const handleGoogleSignIn = () => {
    if (!window.google?.accounts?.oauth2) { setGLoading(false); setGError('Google sign-in is still loading. If it never appears, it may be blocked by a browser extension.'); return; }
    setGError('');
    setGLoading(true);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid profile email',
      callback: async (resp) => {
        if (resp.error) { setGError('Google sign-in failed. Please try again.'); setGLoading(false); return; }
        setGoogleAccessToken(resp.access_token, resp.expires_in);
        try {
          const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
            { headers: { Authorization: 'Bearer ' + resp.access_token } });
          const u = await r.json();
          // Restore this user's saved profile. Try the server first (verified
          // by their token, lets data follow them across devices); if the
          // server has nothing, fall back to the copy saved in this browser.
          let existing = null;
          try {
            existing = await fetch('/api/profile', { headers: authHeaders() }).then(r => r.ok ? r.json() : null);
          } catch(e) {}
          if (!existing?.name) {
            const local = loadProfileByEmail(u.email);
            if (local?.name) existing = local;
          }
          if (existing?.name) { onSignIn(existing); return; }
          setGoogleUser({ name: u.name, email: u.email, picture: u.picture });
        } catch(e) { setGError('Could not reach Google or the Scholar API. Check your connection and try again.'); }
        setGLoading(false);
      },
    });
    client.requestAccessToken({ prompt: '' });
  };

  const WORD = 'Scholar';
  const MODULE_LINE = 'Homework, grades, notes, flashcards, and your whole semester in one place.';

  return (
    <div onMouseMove={e => setMouse({x:e.clientX, y:e.clientY})}
      style={{
        position:'fixed', inset:0, zIndex:900, background:T.bg, fontFamily:T.ui, overflow:'hidden',
        backgroundImage:`radial-gradient(${T.border} 1px, transparent 1px)`,
        backgroundSize:'24px 24px',
        backgroundPosition:'12px 12px',
      }}>
      <style>{`
        @keyframes shq-letter { from{opacity:0;transform:translateY(10px) skewX(-3deg)} to{opacity:1;transform:none} }
        @keyframes shq-up     { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes shq-drawh  { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes shq-drawv  { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        .shq-google { transition:transform 0.18s ease,box-shadow 0.18s ease,border-color 0.18s ease; }
        .shq-google:hover { transform:translateY(-2px); box-shadow:0 6px 20px -8px rgba(24,21,14,0.12); border-color:${T.accent} !important; }
        .shq-ghost { transition:transform 0.18s ease,box-shadow 0.18s ease,border-color 0.18s ease; }
        .shq-ghost:hover { transform:translateY(-2px); box-shadow:0 4px 16px -10px rgba(24,21,14,0.08); border-color:${T.ink2} !important; }
        .shq-primary { transition:transform 0.18s ease,box-shadow 0.18s ease,background 0.18s ease; }
        .shq-primary:hover { transform:translateY(-2px); box-shadow:0 8px 24px -8px rgba(184,148,58,0.45); }
        .shq-input { transition:border-color 0.12s; }
        .shq-input:focus { outline:none; border-color:${T.accent} !important; }
        .shq-welcome-hero { --frame: clamp(28px, 4.5vmin, 56px); --hero-scale: clamp(0.88, min(100vw / 920, 100dvh / 720), 1.2); }
        .shq-welcome-frame { position:absolute; pointer-events:none; overflow:hidden; }
        .shq-welcome-frame--outer { inset: var(--frame); }
        .shq-welcome-frame--inner { inset: calc(var(--frame) + 8px); }
        .shq-welcome-body {
          position:absolute; inset:var(--frame);
          display:flex; flex-direction:column; align-items:center; justify-content:space-between;
          padding:clamp(10px, 1.8vh, 22px) clamp(16px, 4vw, 48px);
        }
        .shq-welcome-main {
          flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
          width:100%; max-width:min(92vw, 780px);
          transform:scale(var(--hero-scale)); transform-origin:center center;
        }
        .shq-welcome-wordmark {
          font-family:${T.serif}; font-style:italic; font-weight:400;
          font-size:clamp(72px, min(13vw, 11dvh), 220px);
          line-height:0.9; color:${T.ink}; letter-spacing:-0.02em; display:flex;
        }
        .shq-welcome-tagline {
          margin-top:clamp(14px, 2.2vh, 28px);
          font-family:${T.serif}; font-style:italic;
          font-size:clamp(15px, min(1.9vw, 2.4dvh), 24px);
          color:${T.ink2}; text-align:center;
        }
        .shq-welcome-desc {
          margin-top:clamp(14px, 2vh, 22px);
          max-width:min(88vw, 420px);
          font-family:${T.ui};
          font-size:clamp(13px, min(1.1vw, 1.5dvh), 15px);
          color:${T.ink3}; text-align:center; line-height:1.65;
        }
        .shq-welcome-ctas {
          margin-top:clamp(28px, 4vh, 48px);
          display:flex; gap:clamp(10px, 1.5vw, 14px); flex-wrap:wrap; justify-content:center;
        }
        .shq-welcome-btn {
          font-family:${T.ui}; font-size:clamp(13px, min(1.2vw, 1.6dvh), 16px);
          padding:clamp(12px, 1.6vh, 15px) clamp(22px, 2.6vw, 32px);
          border-radius:8px; cursor:pointer; font-weight:500;
        }
        .shq-welcome-eyebrow {
          font-family:${T.mono}; font-size:clamp(10px, min(1vw, 1.4dvh), 12px);
          letter-spacing:0.16em; text-transform:uppercase; color:${T.ink3}; text-align:center;
        }
        .shq-welcome-footer-label {
          font-family:${T.mono}; font-size:clamp(9px, min(0.9vw, 1.2dvh), 11px);
          letter-spacing:0.14em; text-transform:uppercase; color:${T.ink3}; text-align:center;
        }
      `}</style>

      {/* Cursor spotlight */}
      <div style={{position:'fixed', inset:0, pointerEvents:'none', zIndex:1,
        background:`radial-gradient(380px circle at ${mouse.x}px ${mouse.y}px,rgba(184,148,58,0.07) 0%,transparent 70%)`,
        transition:'background 0.12s ease'}} />
      {/* Ambient warmth */}
      <div style={{position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
        background:`radial-gradient(ellipse 70% 50% at 50% 100%, rgba(184,148,58,0.06) 0%, transparent 70%)`}} />

      {/* ── Hero ── */}
      <div className="shq-welcome-hero" style={{position:'relative', height:'100dvh', minHeight:580}}>
        {/* Double hairline frame */}
        {['outer', 'inner'].map((layer, fi) => (
          <div key={layer} className={`shq-welcome-frame shq-welcome-frame--${layer}`}>
            <div style={{position:'absolute', top:0, left:0, right:0, height:1, background:T.border, transformOrigin:'left',   animation:`shq-drawh ${0.55+fi*0.08}s ${0.18+fi*0.08}s ease both`}} />
            <div style={{position:'absolute', bottom:0, left:0, right:0, height:1, background:T.border, transformOrigin:'right',  animation:`shq-drawh ${0.55+fi*0.08}s ${0.34+fi*0.08}s ease both`}} />
            <div style={{position:'absolute', top:0, bottom:0, left:0, width:1,   background:T.border, transformOrigin:'top',    animation:`shq-drawv ${0.55+fi*0.08}s ${0.26+fi*0.08}s ease both`}} />
            <div style={{position:'absolute', top:0, bottom:0, right:0, width:1,  background:T.border, transformOrigin:'bottom', animation:`shq-drawv ${0.55+fi*0.08}s ${0.42+fi*0.08}s ease both`}} />
          </div>
        ))}

        <div className="shq-welcome-body">
          {/* Eyebrow */}
          <div className="shq-welcome-eyebrow" style={{animation:'shq-up 0.5s 0.28s both'}}>
            — A Student Dashboard —
          </div>

          {/* Center */}
          <div className="shq-welcome-main">
            <div className="shq-welcome-wordmark">
              {WORD.split('').map((ch,i) => (
                <span key={i} style={{display:'inline-block', animation:`shq-letter 0.5s ${0.48+i*0.055}s cubic-bezier(0.2,0.8,0.2,1) both`}}>{ch}</span>
              ))}
              <span style={{display:'inline-block', color:T.accent, animation:'shq-letter 0.5s 0.87s cubic-bezier(0.2,0.8,0.2,1) both'}}>.</span>
            </div>

            <div className="shq-welcome-tagline" style={{animation:'shq-up 0.6s 1.1s both'}}>
              A second brain for serious students.
            </div>

            <p className="shq-welcome-desc" style={{animation:'shq-up 0.6s 1.22s both'}}>
              {MODULE_LINE}
            </p>

            <div className="shq-welcome-ctas" style={{animation:'shq-up 0.6s 1.38s both'}}>
              <button className="shq-primary shq-welcome-btn" onClick={onSetup} style={{
                border:'none', background:T.accent, color:T.surface,
              }}>
                Open your notebook →
              </button>
              <button className="shq-google shq-welcome-btn" onClick={() => setOverlay(true)} style={{
                display:'flex', alignItems:'center', gap:10,
                border:`1px solid ${T.border}`, background:T.surface,
                color:T.ink,
              }}>
                <GoogleG size={16} colored /> Sign in with Google
              </button>
            </div>
          </div>

          {/* Footer */}
          <div style={{animation:'shq-up 0.6s 1.5s both'}}>
            <div className="shq-welcome-footer-label">— Scholar · 2026 School Year —</div>
          </div>
        </div>
      </div>

      {/* ── Sign-in overlay ── */}
      {overlay && (
        <div style={{position:'fixed', inset:0, zIndex:10, background:'rgba(248,246,240,0.88)', backdropFilter:'blur(14px)', display:'flex', alignItems:'center', justifyContent:'center'}}
          onClick={() => { setOverlay(false); setGoogleUser(null); setGrade(''); }}>
          <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'36px 40px', width:400, boxShadow:'0 24px 64px -18px rgba(24,21,14,0.16)'}}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:22}}>
              <div style={{width:34, height:34, border:`1px solid ${T.accent}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                <span style={{fontFamily:T.serif, fontStyle:'italic', fontSize:19, color:T.accent, lineHeight:1}}>S</span>
              </div>
              <div>
                <div style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.16em', textTransform:'uppercase', color:T.ink3, marginBottom:3}}>Scholar</div>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink, lineHeight:1}}>
                  {googleUser ? `Welcome, ${googleUser.name.split(' ')[0]}.` : 'Sign in.'}
                </div>
              </div>
            </div>

            <div style={{height:1, background:T.border, marginBottom:22}} />

            {!googleUser ? (
              <>
                <button onClick={handleGoogleSignIn} disabled={gLoading} style={{
                  width:'100%', padding:'12px', border:`1px solid ${T.border}`, borderRadius:6,
                  background:T.surface, color:T.ink, fontFamily:T.ui, fontSize:14, fontWeight:500,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                  cursor: gLoading ? 'wait' : 'pointer', transition:'all 0.15s',
                  opacity: gLoading ? 0.65 : 1,
                }}>
                  <GoogleG size={18} colored />
                  {gLoading ? 'Opening Google…' : 'Sign in with Google'}
                </button>
                {gError && <div role="status" style={{fontFamily:T.ui, fontSize:12, color:'#bf4a30', lineHeight:1.5, marginTop:10}}>{gError}</div>}

                <div style={{textAlign:'center', marginTop:20}}>
                  <button onClick={() => { setOverlay(false); onSetup(); }} style={{background:'none', border:'none', fontFamily:T.mono, fontSize:10, color:T.ink3, cursor:'pointer', letterSpacing:'0.08em'}}>
                    New user? Set up a full profile →
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Confirmed Google account */}
                <div style={{display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:T.bg, borderRadius:8, marginBottom:22}}>
                  {googleUser.picture
                    ? <img src={googleUser.picture} alt={`${googleUser.name} profile photo`} style={{width:36, height:36, borderRadius:'50%', flexShrink:0}} />
                    : <div style={{width:36, height:36, borderRadius:'50%', background:T.accentSoft, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                        <span style={{fontFamily:T.serif, fontStyle:'italic', fontSize:17, color:T.accent}}>{googleUser.name[0]}</span>
                      </div>
                  }
                  <div>
                    <div style={{fontFamily:T.ui, fontSize:13, fontWeight:500, color:T.ink}}>{googleUser.name}</div>
                    <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:2}}>{googleUser.email}</div>
                  </div>
                </div>

                {/* Grade (optional) */}
                <div style={{marginBottom:26}}>
                  <div style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:8}}>
                    Year <span style={{opacity:0.45}}>— optional</span>
                  </div>
                  <div style={{display:'flex', gap:7}}>
                    {[['freshman','Fr.'],['sophomore','So.'],['junior','Jr.'],['senior','Sr.']].map(([k,l]) => (
                      <button key={k} onClick={() => setGrade(g => g===k ? '' : k)} style={{
                        flex:1, padding:'9px 0', borderRadius:6, cursor:'pointer',
                        border: grade===k ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                        background: grade===k ? T.accentSoft : T.bg,
                        color: grade===k ? T.accent : T.ink3,
                        fontFamily:T.mono, fontSize:10, transition:'all 0.12s',
                      }}>{l}</button>
                    ))}
                  </div>
                </div>

                <button onClick={() => { setOverlay(false); onSetup({ name: googleUser.name, email: googleUser.email, picture: googleUser.picture, grade: grade || 'junior' }); }} style={{
                  width:'100%', padding:'13px', border:'none', borderRadius:6, cursor:'pointer',
                  background:T.accent, color:T.surface,
                  fontFamily:T.ui, fontSize:14, fontWeight:500, transition:'all 0.15s',
                }}>
                  Set up my classes →
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleG({ size = 16, colored = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{flexShrink:0}}>
      <path fill={colored ? '#4285F4' : '#fff'} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" opacity=".9"/>
      <path fill={colored ? '#34A853' : '#fff'} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".9"/>
      <path fill={colored ? '#FBBC05' : '#fff'} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" opacity=".9"/>
      <path fill={colored ? '#EA4335' : '#fff'} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity=".9"/>
    </svg>
  );
}

/* ── Setup Flow (3-step onboarding) ─────────────────────── */
function SetupFlow({ onComplete, onBack, initialData }) {
  const [step, setStep] = useState(1);
  const [exit, setExit] = useState(false);
  const [animDir, setAnimDir] = useState(null);  // 'forward' | 'back' | null
  const [animating, setAnimating] = useState(false);

  // Step 1 — pre-fill from Google if available
  const [name, setName]   = useState(initialData?.name || '');
  const [grade, setGrade] = useState(initialData?.grade || '');
  // Step 2
  const [school, setSchool]     = useState('');
  const [startM, setStartM]     = useState(8);
  const [startY, setStartY]     = useState(CY);
  // Step 3
  const [subjects, setSubjects] = useState([{tid:1, name:'', color:PRESET_COLORS[0]}]);
  const [picker, setPicker]     = useState(null);

  const addSubj = () => {
    if (subjects.length >= 10) return;
    setSubjects(s => [...s, {tid:Date.now(), name:'', color:PRESET_COLORS[s.length % PRESET_COLORS.length]}]);
  };
  const removeSubj = (tid) => setSubjects(s => s.filter(x => x.tid !== tid));
  const updateSubj = (tid, patch) => setSubjects(s => s.map(x => x.tid===tid ? {...x,...patch} : x));

  const validSubjects = subjects.filter(s => s.name.trim().length > 0);

  const canNext1 = name.trim().length > 1 && grade !== '';
  const canNext2 = school.trim().length > 0;
  const canFinish = validSubjects.length > 0;

  const animateStep = (nextStep, dir) => {
    setAnimDir(dir);
    setAnimating(true);
    setTimeout(() => {
      setStep(nextStep);
      setAnimDir(dir === 'forward' ? 'enter-forward' : 'enter-back');
      setTimeout(() => { setAnimating(false); setAnimDir(null); }, 350);
    }, 300);
  };

  const goBack = () => {
    if (step === 1) { setExit(true); setTimeout(() => { setExit(false); onBack(); }, 350); }
    else if (!animating) animateStep(step - 1, 'back');
  };

  const goNext = () => {
    if (step < 3 && !animating) animateStep(step + 1, 'forward');
    else if (step === 3) {
      const builtSubjects = validSubjects.map(s => ({
        id: makeSubjId(s.name), name: s.name.trim(), short: makeShort(s.name),
        color: s.color, grade:'—', gpa:0, pct:0,
      }));
      onComplete({ name: name.trim(), grade, school: school.trim(), subjects: builtSubjects, startMonth: startM, startYear: startY, completedAt: Date.now(), email: initialData?.email || '', picture: initialData?.picture || '' });
    }
  };

  const canProceed = step===1 ? canNext1 : step===2 ? canNext2 : canFinish;
  const nextLabel  = step===3 ? 'Open my dashboard →' : 'Next →';

  const STEP_LABELS = ['About You', 'Your School', 'Your Classes'];

  const FLOAT_ICONS = [
    { emoji:'📚', x:8,  y:52 },
    { emoji:'✏️', x:72, y:58 },
    { emoji:'🎓', x:38, y:75 },
    { emoji:'💡', x:85, y:42 },
    { emoji:'📐', x:18, y:82 },
    { emoji:'🧪', x:60, y:85 },
    { emoji:'🌟', x:48, y:48 },
    { emoji:'📝', x:82, y:72 },
  ];

  // Live dashboard preview
  const DashboardPreview = () => {
    const pName = name.trim() || 'Student';
    const pGrade = grade ? grade.charAt(0).toUpperCase()+grade.slice(1) : '—';
    const pSchool = school.trim() || '—';
    const pSubjs = validSubjects.length > 0 ? validSubjects : [{name:'Your classes', color:T.border}];
    return (
      <div style={{width:'100%', maxWidth:340, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', boxShadow:'0 20px 60px -16px rgba(24,21,14,0.16), 0 4px 16px rgba(24,21,14,0.06)'}}>
        {/* Mini sidebar */}
        <div style={{display:'flex', height:260}}>
          <div style={{width:56, background:T.bg, borderRight:`1px solid ${T.border}`, padding:'12px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:2}}>
            <div style={{width:24, height:24, borderRadius:6, background:`linear-gradient(135deg, ${T.accent}, #9a7828)`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:8}}>
              <span style={{fontFamily:T.serif, fontStyle:'italic', fontSize:12, color:'#fff'}}>{pName[0]}</span>
            </div>
            {['◷','◫','◈','▤','◇','☆','⊞'].map((ic,i) => (
              <div key={i} style={{width:32, height:24, borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color: i===0 ? T.accent : T.ink3, background: i===0 ? T.accentSoft : 'transparent', opacity: i===0 ? 1 : 0.4}}>{ic}</div>
            ))}
          </div>
          {/* Mini content */}
          <div style={{flex:1, padding:'14px 16px', overflow:'hidden'}}>
            <div style={{fontFamily:T.mono, fontSize:6.5, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:2}}>Good morning</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16, color:T.ink, marginBottom:12, lineHeight:1.2}}>{pName.split(' ')[0]}'s Dashboard</div>
            {/* Stats row */}
            <div style={{display:'flex', gap:6, marginBottom:12}}>
              {[{l:'GPA',v:'—'},{l:'Open',v:'0'},{l:'Streak',v:'0'}].map(s => (
                <div key={s.l} style={{flex:1, background:T.bg, borderRadius:6, padding:'6px 8px', textAlign:'center'}}>
                  <div style={{fontFamily:T.mono, fontSize:11, fontWeight:600, color:T.ink}}>{s.v}</div>
                  <div style={{fontFamily:T.mono, fontSize:5.5, color:T.ink3, letterSpacing:'0.1em', textTransform:'uppercase'}}>{s.l}</div>
                </div>
              ))}
            </div>
            {/* Subject pills */}
            <div style={{fontFamily:T.mono, fontSize:6, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6}}>Subjects</div>
            <div style={{display:'flex', flexDirection:'column', gap:3}}>
              {pSubjs.slice(0,4).map((s,i) => (
                <div key={i} style={{display:'flex', alignItems:'center', gap:6, padding:'4px 8px', background:T.bg, borderRadius:5}}>
                  <div style={{width:5, height:5, borderRadius:2, background:s.color, flexShrink:0}} />
                  <span style={{fontFamily:T.ui, fontSize:10, color:T.ink2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Bottom info bar */}
        <div style={{borderTop:`1px solid ${T.border}`, padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', background:T.bg}}>
          <div>
            <div style={{fontFamily:T.ui, fontSize:10, fontWeight:600, color:T.ink}}>{pName}</div>
            <div style={{fontFamily:T.mono, fontSize:6.5, color:T.ink3}}>{pGrade}{pSchool !== '—' ? ` · ${pSchool}` : ''}</div>
          </div>
          <div style={{display:'flex', gap:4}}>
            {[1,2,3].map(s => (
              <div key={s} style={{width: s<=step ? 16 : 8, height:3, borderRadius:2, background: s<=step ? T.accent : T.border, transition:'all 0.4s ease'}} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Unlock checklist
  const UNLOCK_ITEMS = [
    { label:'Your name on the dashboard', step:1, check: () => !!name.trim(),          desc:'Personalized greeting every time you log in' },
    { label:'Year-based course load',     step:1, check: () => !!grade,                 desc:'Recommendations tuned to ' + (grade || 'your year') },
    { label:'Semester week tracker',      step:2, check: () => step >= 2,               desc:'Always know which week you\'re in — "Week 3 of 16"' },
    { label:'Your school on your profile',step:2, check: () => !!school.trim(),         desc:(school.trim() || 'Your school') + ' displayed across your dashboard' },
    { label:'Per-subject grades',         step:3, check: () => validSubjects.length >= 1, desc:'GPA calculated across each class you add' },
    { label:'Class-linked study tools',   step:3, check: () => subjects.length >= 2,      desc:'Flashcards, notes, and quizzes sorted by subject' },
  ];

  const UnlockChecklist = () => (
    <div style={{width:'100%', maxWidth:340}}>
      <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:8}}>What you'll unlock</div>
      <div style={{display:'flex', flexDirection:'column', gap:1}}>
        {UNLOCK_ITEMS.map((item, i) => {
          const done = item.check();
          const current = step === item.step && !done;
          return (
            <div key={i} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0'}}>
              <div style={{width:16, height:16, borderRadius:4, border: done ? 'none' : `1.5px solid ${current ? T.accent+'60' : T.border}`, background: done ? T.accent : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.3s'}}>
                {done && <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6l2.5 2.5 5-5"/></svg>}
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:T.ui, fontSize:10.5, color: done || current ? T.ink : T.ink2, fontWeight: done || current ? 500 : 400}}>{item.label}</div>
                <div style={{fontFamily:T.mono, fontSize:10, color: done || current ? T.ink2 : T.ink3}}>{item.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const inputStyle = {width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, background:T.bg, fontFamily:T.ui, fontSize:14, color:T.ink, outline:'none', boxSizing:'border-box', borderRadius:6};

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:900, background:T.surface,
      display:'flex', flexDirection:'column', fontFamily:T.ui,
      opacity: exit ? 0 : 1, transform: exit ? 'scale(0.97)' : 'scale(1)',
      transition: exit ? 'opacity 0.35s ease, transform 0.35s ease' : 'none',
    }}>
      <style>{`
        .shq-ob-input::placeholder{color:${T.ink3}}
        .shq-ob-select option{background:${T.surface}}
        .shq-yr-btn:hover{border-color:${T.accent}!important}
        @keyframes shq-page-out-fwd {
          0%   { opacity:1; transform:translateX(0) rotateY(0); }
          100% { opacity:0; transform:translateX(-60px) rotateY(-8deg); }
        }
        @keyframes shq-page-out-back {
          0%   { opacity:1; transform:translateX(0) rotateY(0); }
          100% { opacity:0; transform:translateX(60px) rotateY(8deg); }
        }
        @keyframes shq-page-in-fwd {
          0%   { opacity:0; transform:translateX(60px) rotateY(6deg); }
          100% { opacity:1; transform:translateX(0) rotateY(0); }
        }
        @keyframes shq-page-in-back {
          0%   { opacity:0; transform:translateX(-60px) rotateY(-6deg); }
          100% { opacity:1; transform:translateX(0) rotateY(0); }
        }
      `}</style>

      {/* Stepped progress bar */}
      <div style={{display:'flex', alignItems:'center', gap:0, padding:'0 48px', height:44, flexShrink:0, borderBottom:`1px solid ${T.border}`, background:T.surface}}>
        {STEP_LABELS.map((label, i) => {
          const s = i + 1;
          const done = step > s;
          const active = step === s;
          return (
            <React.Fragment key={s}>
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <div style={{
                  width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                  background: done ? T.accent : active ? T.accentSoft : T.bl,
                  border: active ? `1.5px solid ${T.accent}` : done ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                  transition:'all 0.25s',
                }}>
                  {done
                    ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6l2.5 2.5 4.5-5"/></svg>
                    : <span style={{fontFamily:T.mono, fontSize:10, color: active ? T.accent : T.ink3}}>{s}</span>
                  }
                </div>
                <span style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color: active ? T.accent : done ? T.ink2 : T.ink3, fontWeight: active ? 500 : 400}}>{label}</span>
              </div>
              {s < 3 && <div style={{flex:1, height:1, background: done ? T.accent : T.border, margin:'0 16px', transition:'background 0.3s'}} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Two-column body */}
      <div style={{flex:1, minHeight:0, display:'flex', overflow:'hidden'}}>

        {/* Left — form */}
        <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', overflowY:'auto', padding:'56px 48px 40px', position:'relative', backgroundImage:`radial-gradient(${T.border} 1px, transparent 1px)`, backgroundSize:'20px 20px', backgroundPosition:'10px 10px'}}>



          <div style={{maxWidth:480, position:'relative', zIndex:1, perspective:'800px',
            animation: animDir === 'forward' ? 'shq-page-out-fwd 0.3s ease forwards'
                     : animDir === 'back' ? 'shq-page-out-back 0.3s ease forwards'
                     : animDir === 'enter-forward' ? 'shq-page-in-fwd 0.35s ease forwards'
                     : animDir === 'enter-back' ? 'shq-page-in-back 0.35s ease forwards'
                     : 'none',
          }}>
            {/* Step 1 */}
            {step===1 && (
              <>
                <h2 style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:42, lineHeight:1.1, margin:'0 0 28px', color:T.ink}}>
                  Let's set up your <em style={{color:T.accent}}>dashboard.</em>
                </h2>
                <div style={{marginBottom:22}}>
                  <div style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:10}}>What's your name?</div>
                  <input autoFocus className="shq-ob-input" value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && canNext1) goNext(); }}
                    placeholder="e.g. Julian" style={inputStyle}
                    onFocus={e => e.target.style.borderColor=T.accent}
                    onBlur={e => e.target.style.borderColor=T.border} />
                </div>
                <div style={{marginBottom:0}}>
                  <div style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:10}}>What year are you in?</div>
                  <div style={{display:'flex', gap:8}}>
                    {[['freshman','Freshman'],['sophomore','Sophomore'],['junior','Junior'],['senior','Senior']].map(([k,l]) => (
                      <button key={k} className="shq-yr-btn" onClick={() => setGrade(k)} style={{
                        flex:1, height:40, borderRadius:6, fontSize:12.5, cursor:'pointer',
                        border: grade===k ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                        background: grade===k ? T.accentSoft : T.bg,
                        color: grade===k ? T.accent : T.ink2,
                        fontFamily:T.ui, fontWeight: grade===k ? 500 : 400, transition:'all 0.12s',
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Step 2 */}
            {step===2 && (
              <>
                <h2 style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:42, lineHeight:1.1, margin:'0 0 28px', color:T.ink}}>
                  Tell us about your <em style={{color:T.accent}}>school.</em>
                </h2>
                <div style={{marginBottom:22}}>
                  <div style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:10}}>School name</div>
                  <input autoFocus className="shq-ob-input" value={school} onChange={e => setSchool(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && canNext2) goNext(); }}
                    placeholder="e.g. Lincoln High School" style={inputStyle}
                    onFocus={e => e.target.style.borderColor=T.accent}
                    onBlur={e => e.target.style.borderColor=T.border} />
                </div>
                <div style={{marginBottom:36}}>
                  <div style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:10}}>When does your school year start?</div>
                  <div style={{display:'flex', gap:10}}>
                    <select className="shq-ob-select" value={startM} onChange={e => setStartM(Number(e.target.value))}
                      style={{...inputStyle, flex:2, padding:'10px 14px', cursor:'pointer', appearance:'none'}}>
                      {MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select className="shq-ob-select" value={startY} onChange={e => setStartY(Number(e.target.value))}
                      style={{...inputStyle, flex:1, padding:'10px 14px', cursor:'pointer', appearance:'none'}}>
                      {[CY-1,CY,CY+1].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                {/* Ornamental rule */}
                <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:28}}>
                  <div style={{flex:1, height:1, background:T.border}} />
                  <div style={{width:4, height:4, borderRadius:'50%', background:T.accent, opacity:0.5}} />
                  <div style={{flex:1, height:1, background:T.border}} />
                </div>

                {/* Semester timeline */}
                <div style={{marginBottom:24}}>
                  <div style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.16em', textTransform:'uppercase', color:T.ink3, marginBottom:14}}>Your semester at a glance</div>
                  <div style={{display:'flex', gap:3, marginBottom:10}}>
                    {Array.from({length:5}, (_,i) => {
                      const m = (startM + i) % 12;
                      return (
                        <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                          <div style={{width:'100%', height:28, borderRadius:5, background: i===0 ? `linear-gradient(135deg, ${T.accent}18, ${T.accent}30)` : T.bg, border:`1px solid ${i===0 ? T.accent+'40' : T.border}`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                            {i===0 && <div style={{width:6, height:6, borderRadius:'50%', background:T.accent}} />}
                          </div>
                          <span style={{fontFamily:T.mono, fontSize:10, color: i===0 ? T.accent : T.ink3, letterSpacing:'0.08em', textTransform:'uppercase'}}>{MONTHS[m].slice(0,3)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{fontFamily:T.ui, fontSize:10.5, color:T.ink3, textAlign:'center'}}>
                    {school.trim() ? school.trim() : 'Your school'}'s year begins {MONTHS[startM]} {startY}
                  </div>
                </div>

                {/* Why this matters */}
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                  {[
                    {ic:'◷', title:'Smart deadlines', desc:'We\'ll track assignment dates relative to your semester calendar'},
                    {ic:'◈', title:'Term-aware GPA', desc:'Grades reset each term so your GPA stays accurate and current'},
                    {ic:'▤', title:'Week numbering', desc:'See "Week 3 of 16" so you always know where you stand'},
                    {ic:'☆', title:'Break detection', desc:'We\'ll account for holidays and breaks in your planning'},
                  ].map(item => (
                    <div key={item.title} style={{padding:'14px 16px', border:`1px solid ${T.border}`, background:T.bg, borderRadius:8, display:'flex', gap:10, alignItems:'flex-start'}}>
                      <span style={{fontSize:14, lineHeight:1, flexShrink:0, opacity:0.5}}>{item.ic}</span>
                      <div>
                        <div style={{fontFamily:T.ui, fontSize:11, fontWeight:500, color:T.ink, marginBottom:3}}>{item.title}</div>
                        <div style={{fontFamily:T.mono, fontSize:10, color:T.ink3, lineHeight:1.5, letterSpacing:'0.02em'}}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pull quote */}
                <div style={{marginTop:24, padding:'16px 0', borderTop:`1px solid ${T.border}`}}>
                  <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16, color:T.ink3, lineHeight:1.6, textAlign:'center', letterSpacing:'-0.01em'}}>
                    "Your semester, organized in one place."
                  </div>
                </div>
              </>
            )}

            {/* Step 3 */}
            {step===3 && (
              <>
                <h2 style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:42, lineHeight:1.1, margin:'0 0 10px', color:T.ink}}>
                  What classes are you <em style={{color:T.accent}}>taking?</em>
                </h2>
                <p style={{fontFamily:T.ui, fontSize:13, color:T.ink3, margin:'0 0 22px', lineHeight:1.6}}>Add up to 10. You can always change these later.</p>

                <div style={{display:'flex', flexDirection:'column', gap:8, maxHeight:240, overflowY:'auto', paddingRight:4, marginBottom:16}}>
                  {subjects.map((s,i) => (
                    <div key={s.tid} style={{display:'flex', alignItems:'center', gap:8}}>
                      <div style={{position:'relative', flexShrink:0}}>
                        <div onClick={() => setPicker(picker===s.tid ? null : s.tid)}
                          style={{width:28, height:28, borderRadius:5, background:s.color, cursor:'pointer', border:`2px solid rgba(0,0,0,0.12)`}} />
                        {picker===s.tid && (
                          <div style={{position:'absolute', top:34, left:0, zIndex:10, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:8, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, boxShadow:'0 8px 24px rgba(24,21,14,0.14)'}}>
                            {PRESET_COLORS.map(c => (
                              <div key={c} onClick={() => { updateSubj(s.tid,{color:c}); setPicker(null); }}
                                style={{width:22, height:22, borderRadius:4, background:c, cursor:'pointer', outline: s.color===c ? `2px solid ${T.accent}` : 'none', outlineOffset:1}} />
                            ))}
                          </div>
                        )}
                      </div>
                      <input className="shq-ob-input" value={s.name} onChange={e => updateSubj(s.tid,{name:e.target.value})}
                        placeholder={`Class ${i+1} (e.g. AP Biology)`}
                        style={{...inputStyle, flex:1}}
                        onFocus={e => e.target.style.borderColor=T.accent}
                        onBlur={e => e.target.style.borderColor=T.border} />
                      {subjects.length > 1 && (
                        <button onClick={() => removeSubj(s.tid)}
                          style={{border:0, background:'transparent', color:T.ink3, cursor:'pointer', fontSize:18, padding:'0 4px', flexShrink:0}}>×</button>
                      )}
                    </div>
                  ))}
                </div>
                {subjects.length < 10 && (
                  <button onClick={addSubj} style={{padding:'7px 14px', borderRadius:6, fontSize:12.5, border:`1px solid ${T.border}`, background:'transparent', color:T.ink3, fontFamily:T.ui, cursor:'pointer', alignSelf:'flex-start'}}>
                    + Add another class
                  </button>
                )}

                {/* Ornamental rule */}
                <div style={{display:'flex', alignItems:'center', gap:12, marginTop:24, marginBottom:20}}>
                  <div style={{flex:1, height:1, background:T.border}} />
                  <div style={{width:4, height:4, borderRadius:'50%', background:T.accent, opacity:0.5}} />
                  <div style={{flex:1, height:1, background:T.border}} />
                </div>

                {/* Pull quote */}
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:18, color:T.ink3, lineHeight:1.6, textAlign:'center', letterSpacing:'-0.01em'}}>
                  "Almost there — one step away from your dashboard."
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right — preview & checklist */}
        <div style={{width:420, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', overflowY:'auto', borderLeft:`1px solid ${T.border}`, padding:'56px 36px 32px', gap:20, position:'relative', background:`linear-gradient(180deg, ${T.surface} 0%, ${T.bg} 100%)`}}>
          <DashboardPreview />
          <UnlockChecklist />
        </div>
      </div>

      {/* Footer */}
      <div style={{display:'flex', alignItems:'center', padding:'18px 48px', flexShrink:0, borderTop:`1px solid ${T.border}`, position:'relative'}}>
        <button onClick={goBack} style={{background:'none', border:'none', padding:0, cursor:'pointer', fontSize:13.5, color:T.ink3, fontFamily:T.ui}}>← Back</button>
        <span style={{position:'absolute', left:'50%', transform:'translateX(-50%)', fontFamily:T.mono, fontSize:9.5, letterSpacing:'0.22em', color:T.ink3, textTransform:'uppercase'}}>ANNO MMXXVI</span>
        <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:28}}>
          <span style={{fontFamily:T.mono, fontSize:10, letterSpacing:'0.16em', color:T.ink3, textTransform:'uppercase'}}>Printed for one reader</span>
          <button onClick={goNext} disabled={!canProceed} style={{
            height:42, padding:'0 26px', borderRadius:6, border:'none', cursor: canProceed ? 'pointer' : 'default',
            background: canProceed ? T.accent : T.bl,
            color: canProceed ? T.surface : T.ink3,
            fontFamily:T.ui, fontSize:13.5, fontWeight:500, transition:'all 0.15s',
          }}>{nextLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ── App ────────────────────────────────────────────────── */
const SCREENS = {
  today:      TodayScreen,
  homework:   HomeworkScreen,
  quizzes:    QuizzesScreen,
  notes:      NotesScreen,
  flashcards: FlashcardsScreen,
  schedule:   ScheduleScreen,
  grades:     GradesScreen,
  tools:      ToolsScreen,
  subjects:   SubjectsScreen,
  subject:    SubjectDetailScreen,
};

function App() {
  const [profile, setProfile]   = useState(() => loadProfile());
  const [inSetup, setInSetup]   = useState(false);
  const [screen, setScreen]     = useState('today');
  const [key, setKey]           = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast]       = useState('');
  const [screenAction, setScreenAction] = useState(null);
  const [sidebarAction, setSidebarAction] = useState(null);
  const [userData, setUserData] = useState(() => {
    const p = loadProfile();
    return p ? (loadUserData(p.email) || defaultUserData()) : defaultUserData();
  });

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const nav = (s, action) => {
    setScreen(s);
    setKey(k => k + 1);
    setSidebarOpen(false);
    setScreenAction(action || null);
  };
  const requestSidebar = (action) => setSidebarAction(action);
  const Screen = SCREENS[screen] || TodayScreen;

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const close = () => { if (mq.matches) setSidebarOpen(false); };
    mq.addEventListener('change', close);
    return () => mq.removeEventListener('change', close);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sidebarOpen]);

  useEffect(() => {
    const map = {
      today: 'Today',
      homework: 'Homework',
      quizzes: 'Quizzes',
      notes: 'Notes',
      flashcards: 'Flashcards',
      schedule: 'Schedule',
      grades: 'Grades',
      tools: 'Tools',
      subjects: 'Subjects',
    };
    const label = map[screen] || 'Dashboard';
    document.title = `Scholar — ${label}`;
  }, [screen]);

  const updateUserData = (update) => {
    setUserData(prev => {
      const next = normalizeUserData({ ...prev, ...update, updatedAt: Date.now() });
      if (profile?.email) {
        saveUserData(profile.email, next);
        saveServerUserData(next); // best-effort cloud save so work follows the user
      }
      setToast('Saved.');
      return next;
    });
  };

  const handleSignIn = (p) => {
    const saved = loadProfileByEmail(p.email);
    const merged = (saved && saved.subjects?.length && !p.subjects?.length)
      ? { ...saved, name: p.name || saved.name, picture: p.picture || saved.picture }
      : p;
    saveProfile(merged);
    setProfile(merged);
    const localUD = loadUserData(merged.email) || defaultUserData();
    setUserData(localUD);
    setInSetup(false);
    saveServerProfile(merged);

    // Reconcile this device's work with the cloud: whichever is newer wins.
    fetchServerUserData().then(serverUD => {
      if (serverUD && (serverUD.updatedAt || 0) > (localUD.updatedAt || 0)) {
        saveUserData(merged.email, serverUD);
        setUserData(serverUD);
      } else if (localUD.updatedAt) {
        saveServerUserData(localUD);
      }
    });
  };

  const handleSignOut = () => {
    clearSensitiveLocalData();
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setUserData(defaultUserData());
    setInSetup(false);
    setScreen('today');
  };

  const persistProfile = (p) => {
    saveProfile(p);
    setProfile(p);
    saveServerProfile(p);
    setKey(k => k + 1);
  };

  const [setupPrefill, setSetupPrefill] = useState(null);

  // On load (and whenever the signed-in user changes), silently renew the
  // Google token so cloud saves work after a reload, then reconcile this
  // device's work with the cloud (newest wins).
  useEffect(() => {
    const email = profile?.email;
    if (!email) return;
    let cancelled = false;

    const reconcile = () => {
      fetchServerUserData().then(serverUD => {
        if (cancelled) return;
        const localUD = loadUserData(email) || defaultUserData();
        if (serverUD && (serverUD.updatedAt || 0) > (localUD.updatedAt || 0)) {
          saveUserData(email, serverUD);
          setUserData(serverUD);
        } else if ((localUD.updatedAt || 0) > (serverUD?.updatedAt || 0)) {
          saveServerUserData(localUD);
        }
      });
    };

    // 1) Reuse a still-valid saved token immediately — no reconnect needed.
    if (restoreGoogleToken()) {
      setSyncStatus('synced');
      reconcile();
      return () => { cancelled = true; };
    }

    // 2) Otherwise try a silent background renewal; if blocked, show "offline".
    const tryAuth = (attempt = 0) => {
      if (cancelled) return;
      if (!window.google?.accounts?.oauth2) {
        if (attempt < 20) setTimeout(() => tryAuth(attempt + 1), 300);
        return;
      }
      acquireGoogleToken(true).then(token => {
        if (cancelled) return;
        if (!token) { setSyncStatus('offline'); return; }
        setSyncStatus('synced');
        reconcile();
      });
    };
    tryAuth();
    return () => { cancelled = true; };
  }, [profile?.email]);

  // Reliable manual reconnect (triggered by tapping the sync badge): does a
  // user-initiated Google token request, which works even when the silent
  // background renewal can't.
  const reconnectCloud = async () => {
    const token = await acquireGoogleToken(false);
    if (!token || !profile?.email) { setSyncStatus('offline'); return; }
    const serverUD = await fetchServerUserData();
    const localUD = loadUserData(profile.email) || defaultUserData();
    if (serverUD && (serverUD.updatedAt || 0) > (localUD.updatedAt || 0)) {
      saveUserData(profile.email, serverUD);
      setUserData(serverUD);
      setSyncStatus('synced');
    } else {
      saveServerUserData(localUD);
    }
  };

  if (!profile && !inSetup) {
    return <WelcomeScreen onSignIn={handleSignIn} onSetup={(data) => { setSetupPrefill(data || null); setInSetup(true); }} />;
  }

  if (!profile && inSetup) {
    return <SetupFlow onComplete={handleSignIn} onBack={() => { setSetupPrefill(null); setInSetup(false); }} initialData={setupPrefill} />;
  }

  return (
    <div style={{height:'100vh', display:'flex', overflow:'hidden', background:T.bg, fontFamily:T.ui, color:T.ink}}>
      <a className="shq-skip" href="#shq-main">Skip to content</a>
      <div
        className={`shq-sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <MobileHeader onMenuOpen={() => setSidebarOpen(true)} sidebarOpen={sidebarOpen} />
      <Sidebar
        screen={screen}
        onNav={nav}
        profile={profile}
        userData={userData}
        onSignOut={handleSignOut}
        open={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        requestedAction={sidebarAction}
        onActionHandled={() => setSidebarAction(null)}
        onAddSubject={subj => {
          persistProfile({ ...profile, subjects: [...(profile.subjects||[]), subj] });
        }}
        onUpdateProfile={persistProfile}
      />
      <main id="shq-main" tabIndex={-1} style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', outline:'none'}}>
        <Screen
          key={key}
          profile={profile}
          userData={userData}
          onUpdate={updateUserData}
          onNav={nav}
          onRequestSidebar={requestSidebar}
          screenAction={screenAction}
          onScreenActionHandled={() => setScreenAction(null)}
        />
      </main>
      <SyncBadge onReconnect={reconnectCloud} />
      <Toast message={toast} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
