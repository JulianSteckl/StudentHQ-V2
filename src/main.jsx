import React from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { T } from './theme.js';
import { GOOGLE_CLIENT_ID, authHeaders, setGoogleAccessToken, restoreGoogleToken, PROFILE_KEY, loadProfile, loadProfileByEmail, saveProfile, loadUserData, saveUserData, defaultUserData, fetchServerUserData, saveServerUserData, getSyncStatus, onSyncStatus, setSyncStatus } from './storage.js';
import { PRESET_COLORS, MONTHS, CY, makeSubjId, makeShort, SUBJECTS, HOMEWORK, QUIZZES_DATA, NOTES_DATA, SCHEDULE_DATA, DECKS, QUIZ, HIST, GPA_MAP, TOOLS_DATA, GPA, subjectBy, calcGPA, pickBestGradedSubject, makeSubjectBy, greeting, formatDate } from './data.js';
import { ICO, NAV } from './icons.jsx';
import { appendGradeHistory, gradeSparklinePoints, appendToolOpen, toolOpensThisWeek, toolOpenCounts, toolById, formatToolWhen, buildToolUsageInsight, normalizeUserData, normalizeToolOpens } from './user-data-helpers.js';

const { useState, useEffect, useRef } = React;
const ReactDOM = { createRoot, createPortal };

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
      style={{position:'fixed', left:12, bottom:10, zIndex:1000, display:'flex', alignItems:'center', gap:7, fontFamily:T.mono, fontSize:8.5, color:s.c, background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:'6px 12px', boxShadow:'0 2px 10px rgba(24,21,14,0.06)', cursor: clickable ? 'pointer' : 'default'}}>
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

  useEffect(() => { if (open) { setName(''); setColor(PRESET_COLORS[(existingCount||0) % PRESET_COLORS.length]); setClosing(false); } }, [open]);

  if (!open) return null;

  const dismiss = () => { setClosing(true); setTimeout(onClose, 320); };
  const submit = () => {
    if (!name.trim()) return;
    onAdd({ id: makeSubjId(name), name: name.trim(), short: makeShort(name), color, grade:'—', gpa:0, pct:0 });
    dismiss();
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div style={{
        width:380, background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'36px 32px 28px', position:'relative', opacity:0,
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>

        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>Add a <span style={{color:T.accent}}>class</span></div>
        <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:24}}>Up to 10 subjects · you can always change these later</div>

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
          <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:8}}>Color</div>
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
          <button onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:9, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer', transition:'background 0.15s'}}
            onMouseOver={e => e.currentTarget.style.background=T.bl} onMouseOut={e => e.currentTarget.style.background='transparent'}>Cancel</button>
          <button onClick={submit} disabled={!name.trim()} style={{padding:'9px 24px', border:'none', background: name.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:9, color:'#fff', letterSpacing:'0.06em', cursor: name.trim() ? 'pointer' : 'default', transition:'background 0.15s, transform 0.1s', fontWeight:600}}
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

  useEffect(() => {
    if (open && profile) {
      setName(profile.name || '');
      setGrade(profile.grade || 'junior');
      setSchool(profile.school || '');
      setClosing(false);
    }
  }, [open]);

  if (!open) return null;

  const dismiss = () => { setClosing(true); setTimeout(onClose, 320); };
  const submit = () => {
    if (!name.trim()) return;
    onSave({ ...profile, name: name.trim(), grade, school: school.trim() });
    dismiss();
  };

  const GRADES = [['freshman','Freshman'],['sophomore','Sophomore'],['junior','Junior'],['senior','Senior']];

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div style={{
        width:380, background:T.surface, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'36px 32px 28px', position:'relative', opacity:0,
        boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)',
        animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`,
      }}>
        <button onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>

        <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:20}}>
          {profile?.picture ? (
            <img src={profile.picture} style={{width:40, height:40, borderRadius:10, objectFit:'cover'}} referrerPolicy="no-referrer" />
          ) : (
            <div style={{width:40, height:40, borderRadius:10, background:`linear-gradient(135deg, ${T.accent}, #9a7828)`, display:'flex', alignItems:'center', justifyContent:'center'}}>
              <span style={{fontFamily:T.serif, fontSize:18, color:'#fff', fontWeight:600}}>{(name || 'U')[0]}</span>
            </div>
          )}
          <div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:T.ink}}>Edit <span style={{color:T.accent}}>profile</span></div>
            <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, letterSpacing:'0.08em'}}>{profile?.email || ''}</div>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', display:'block', marginBottom:5}}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s'}}
            onFocus={e => e.target.style.borderColor=T.accent} onBlur={e => e.target.style.borderColor=T.border} />
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', display:'block', marginBottom:5}}>School</label>
          <input value={school} onChange={e => setSchool(e.target.value)} placeholder="e.g. University of Cincinnati"
            style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s'}}
            onFocus={e => e.target.style.borderColor=T.accent} onBlur={e => e.target.style.borderColor=T.border} />
        </div>

        <div style={{marginBottom:24}}>
          <label style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', display:'block', marginBottom:5}}>Year</label>
          <div style={{display:'flex', gap:6}}>
            {GRADES.map(([k,l]) => (
              <button key={k} onClick={() => setGrade(k)} style={{
                flex:1, padding:'8px 0', border:`1px solid ${grade===k ? T.accent : T.border}`,
                background: grade===k ? T.accentSoft : 'transparent', borderRadius:8,
                fontFamily:T.mono, fontSize:9, color: grade===k ? T.accent : T.ink3,
                fontWeight: grade===k ? 600 : 400, cursor:'pointer', transition:'all 0.15s', letterSpacing:'0.04em',
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:9, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer', transition:'background 0.15s'}}
            onMouseOver={e => e.currentTarget.style.background=T.bl} onMouseOut={e => e.currentTarget.style.background='transparent'}>Cancel</button>
          <button onClick={submit} disabled={!name.trim()} style={{padding:'9px 24px', border:'none', background: name.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:9, color:'#fff', letterSpacing:'0.06em', cursor: name.trim() ? 'pointer' : 'default', transition:'all 0.15s', fontWeight:600}}
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

  const dismiss = () => { setClosing(true); setTimeout(() => { setClosing(false); onClose(); }, 280); };
  const save = (id, val) => {
    const next = {...keys, [id]: val};
    setKeys(next);
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(next));
  };

  if (!open) return null;
  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }}
      style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div style={{background:T.surface, borderRadius:12, width:420, maxHeight:'80vh', overflowY:'auto', border:`1px solid ${T.border}`, boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)', opacity:0, animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`}}>
        <div style={{padding:'24px 28px 0'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
            <h3 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, fontWeight:400, margin:0, color:T.ink}}>AI Connections</h3>
            <button onClick={dismiss} style={{background:'none', border:'none', cursor:'pointer', padding:4, color:T.ink3, fontSize:18, lineHeight:1}}>×</button>
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
                  {connected && <span style={{marginLeft:'auto', fontFamily:T.mono, fontSize:7.5, color:p.color, letterSpacing:'0.08em', textTransform:'uppercase', background:p.color+'15', padding:'2px 7px', borderRadius:4}}>Connected</span>}
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
                  <button onClick={() => setVisible(v => ({...v, [p.id]: !v[p.id]}))} style={{padding:'0 8px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bg, cursor:'pointer', fontFamily:T.mono, fontSize:9, color:T.ink3}}>
                    {visible[p.id] ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            );
          })}
          <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, lineHeight:1.6, letterSpacing:'0.02em', textAlign:'center', padding:'4px 0'}}>
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

  const subjects = profile?.subjects || [];

  useEffect(() => { if (open) { setClosing(false); setEditId(null); setNewName(''); setPicker(null); setNewColor(PRESET_COLORS[subjects.length % PRESET_COLORS.length]); } }, [open]);

  if (!open) return null;

  const dismiss = () => { setClosing(true); setTimeout(onClose, 280); };
  const save = (newSubjects) => {
    onUpdateProfile({ ...profile, subjects: newSubjects });
  };
  const remove = (id) => save(subjects.filter(s => s.id !== id));
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
      <div style={{background:T.surface, borderRadius:12, width:420, maxHeight:'80vh', display:'flex', flexDirection:'column', border:`1px solid ${T.border}`, boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)', opacity:0, animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards`}}>
        <div style={{padding:'24px 28px 0'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
            <h3 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, fontWeight:400, margin:0, color:T.ink}}>Manage Subjects</h3>
            <button onClick={dismiss} style={{background:'none', border:'none', cursor:'pointer', padding:4, color:T.ink3, fontSize:18, lineHeight:1}}>×</button>
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
                    onKeyDown={e => { if (e.key === 'Enter') confirmEdit(s.id); if (e.key === 'Escape') setEditId(null); }}
                    onBlur={() => confirmEdit(s.id)}
                    style={{flex:1, padding:'4px 8px', border:`1px solid ${T.accent}`, borderRadius:5, fontFamily:T.ui, fontSize:12, color:T.ink, outline:'none', background:T.surface}} />
                ) : (
                  <span onClick={() => startEdit(s)} style={{flex:1, fontFamily:T.ui, fontSize:12, color:T.ink, cursor:'text'}}>{s.name}</span>
                )}
                <span style={{fontFamily:T.mono, fontSize:8, color:T.ink3, letterSpacing:'0.06em', flexShrink:0}}>{s.short}</span>
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
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8}}>Add new subject</div>
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
              <button onClick={addSubject} disabled={!newName.trim()} style={{padding:'0 14px', border:'none', borderRadius:6, background: newName.trim() ? T.accent : T.border, color:'#fff', fontFamily:T.mono, fontSize:9, fontWeight:600, letterSpacing:'0.06em', cursor: newName.trim() ? 'pointer' : 'default', transition:'all 0.15s'}}>Add</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Sidebar({ screen, onNav, profile, userData, onSignOut, onAddSubject, onUpdateProfile }) {
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

  const SL = (t) => <div style={{fontFamily:T.mono, fontSize:7, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.16em', padding:'12px 12px 4px'}}>{t}</div>;

  const NAV_GROUPS = [
    { label: 'Dashboard', items: NAV.filter(n => ['today','homework','quizzes'].includes(n.id)) },
    { label: 'Study',     items: NAV.filter(n => ['notes','flashcards'].includes(n.id)) },
    { label: 'Academics', items: NAV.filter(n => ['schedule','grades','subjects','tools'].includes(n.id)) },
  ];

  const navBtn = (item) => {
    const act = screen === item.id;
    const hovering = hov === item.id;
    return (
      <button key={item.id} onClick={() => onNav(item.id)}
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
        {item.id === 'homework' && hwOpen > 0 && <span style={{fontFamily:T.mono, fontSize:8, color:T.ink3, background:T.bl, padding:'1px 5px', borderRadius:4, lineHeight:'14px'}}>{hwOpen}</span>}
        {item.id === 'grades' && gpa !== '—' && <span style={{fontFamily:T.mono, fontSize:8, color:T.accent, fontWeight:600}}>{gpa}</span>}
        {item.id === 'subjects' && subjects.length > 0 && <span style={{fontFamily:T.mono, fontSize:8, color:T.ink3, background:T.bl, padding:'1px 5px', borderRadius:4, lineHeight:'14px'}}>{subjects.length}</span>}
      </button>
    );
  };

  return (
    <>
    <aside style={{
      width:200, flexShrink:0,
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
            <div style={{fontFamily:T.mono, fontSize:7, color:T.ink3, letterSpacing:'0.08em'}}>Student workspace</div>
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
            <span style={{fontFamily:T.mono, fontSize:7, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.16em'}}>Subjects</span>
            <button onClick={() => setShowAddModal(true)} style={{width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${T.border}`, background:'transparent', borderRadius:4, color:T.ink3, fontSize:11, cursor:'pointer', lineHeight:1, padding:0, transition:'all 0.15s'}}
              onMouseOver={e => {e.currentTarget.style.background=T.accent; e.currentTarget.style.borderColor=T.accent; e.currentTarget.style.color='#fff'}}
              onMouseOut={e => {e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.ink3}}>+</button>
          </div>
          <div style={{padding:'0 6px'}}>
            {subjects.length === 0 && (
              <div style={{padding:'6px', fontFamily:T.mono, fontSize:8.5, color:T.ink3, opacity:0.6, textAlign:'center'}}>No subjects yet</div>
            )}
            {subjects.map(s => {
              const g = grades[s.id];
              const hwForSubj = homework.filter(h => h.subj === s.id && !h.done).length;
              return (
                <div key={s.id}
                  onMouseOver={e => e.currentTarget.style.background=T.bl}
                  onMouseOut={e => e.currentTarget.style.background='transparent'}
                  style={{display:'flex', alignItems:'center', gap:7, padding:'4px 8px', height:32, margin:'0', borderRadius:5, background:'transparent', cursor:'default', transition:'background 0.12s'}}>
                  <div style={{width:6, height:6, borderRadius:2, background:s.color, flexShrink:0}} />
                  <span style={{flex:1, fontSize:11, fontFamily:T.ui, color:T.ink2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.short || s.name}</span>
                  {hwForSubj > 0 && <span style={{fontFamily:T.mono, fontSize:7, color:T.ink3}}>{hwForSubj}</span>}
                  {g && g !== '—' && <span style={{fontFamily:T.mono, fontSize:8, color:s.color, fontWeight:600}}>{g}</span>}
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
                <div style={{fontFamily:T.mono, fontSize:7, color:T.ink3, marginTop:3, paddingTop:3, borderTop:`1px solid ${T.border}`}}>{todayDone}/{todayHw.length} complete</div>
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
              <img src={profile.picture} style={{width:24, height:24, borderRadius:6, objectFit:'cover'}} referrerPolicy="no-referrer" />
            ) : (
              <div style={{width:24, height:24, borderRadius:6, background:`linear-gradient(135deg, ${T.accent}, #9a7828)`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <span style={{fontFamily:T.serif, fontSize:12, color:'#fff', fontWeight:600}}>{(profile?.name || 'U')[0]}</span>
              </div>
            )}
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontFamily:T.ui, fontSize:11, fontWeight:600, color:T.ink, lineHeight:'14px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{profile?.name || 'Student'}</div>
              <div style={{fontFamily:T.mono, fontSize:7, color:T.ink3, letterSpacing:'0.05em'}}>{profile ? (profile.grade.charAt(0).toUpperCase()+profile.grade.slice(1)) : 'Student'}{streak > 0 ? ` · ${streak}d streak` : ''}</div>
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
        {eyebrow && <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:12}}>{eyebrow}</div>}
        <h1 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:'clamp(36px,4.5vw,56px)', fontWeight:400, color:T.ink, margin:0, letterSpacing:'-0.025em', lineHeight:1.04}}>{title}</h1>
      </div>
      {right && <div style={{textAlign:'right'}}>{right}</div>}
    </div>
  );
}
function Hr({ mb=32 }) { return <div style={{height:1, background:T.border, marginBottom:mb}} />; }

/* ── 1. Today ───────────────────────────────────────────── */
function TodayScreen({ profile, userData, onUpdate }) {
  const ud       = userData || defaultUserData();
  const subjects = profile?.subjects || [];
  const subjectBy = makeSubjectBy(subjects);
  const homework  = ud.homework || [];
  const quizzes   = ud.quizzes  || [];
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

  const Btn = ({children, gold}) => (
    <button style={{padding:'7px 14px', border: gold ? 'none' : `1px solid ${T.border}`, background: gold ? T.accent : T.surface, color: gold ? '#fff' : T.ink3, fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer', display:'flex', alignItems:'center', gap:6}}>{children}</button>
  );

  return (
    <div className="screen-enter" style={{flex:1, overflowY:'auto'}}>
      {/* Header */}
      <div style={{padding:'26px 52px 0', display:'flex', alignItems:'flex-start', justifyContent:'space-between'}}>
        <div>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:5}}>
            {dayStr} · {dateStr} · {timeStr} · Spring Term
          </div>
          <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
            <span style={{fontFamily:T.ui, fontWeight:700, fontSize:29, color:T.ink}}>{timeLabel}, </span>
            <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:31, color:T.ink}}>{firstName}.</span>
          </h1>
          <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3, letterSpacing:'0.05em'}}>
            {open.length} things to finish tonight · {quizzes.length} quizzes scheduled
          </div>
        </div>
        <div style={{display:'flex', gap:8, flexShrink:0, marginTop:4}}>
          <Btn>✦ Customize</Btn>
          <Btn gold>+ Add</Btn>
        </div>
      </div>

      {/* 4 stat cards */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, margin:'20px 52px 12px'}}>
        {[
          { label:'OPEN TASKS',    val:open.length,        sub:'all on track',                                              accent:T.accent  },
          { label:'GPA',           val:gpa,                sub:'Unweighted · Spring',                                        accent:'#3a8a52' },
          { label:'STUDY STREAK',  val:String(streak),     sub:'days running',                                               accent:'#2a60a0' },
          { label:'QUIZZES AHEAD', val:quizzes.length,     sub:quizzes.length>0?`${quizzes[0].date} upcoming`:'none scheduled', accent:'#9254de' },
        ].map(c => (
          <div key={c.label} style={{background:T.surface, padding:'22px 24px 20px', borderRadius:12, minHeight:100, borderBottom:`2px solid ${c.accent}30`}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:10}}>{c.label}</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:38, color:T.ink, lineHeight:0.9, marginBottom:10}}>{c.val}</div>
            <div style={{fontFamily:T.mono, fontSize:8, color:c.accent}}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Week mini-calendar */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:10, margin:'0 52px 12px'}}>
        {weekDays.map(d => (
          <div key={d.n} style={{background:d.today ? T.accentSoft : T.surface, padding:'16px 14px 14px', position:'relative', overflow:'hidden', borderRadius:12, minHeight:72}}>
            {d.today && <div style={{position:'absolute', bottom:-14, right:-14, width:48, height:48, borderRadius:'50%', background:T.accent, opacity:0.12}}/>}
            <div style={{fontFamily:T.mono, fontSize:7.5, color:d.today?T.accent:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:8}}>{d.n}</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:26, color:d.today?T.accent:T.ink3, lineHeight:1}}>{d.date}</div>
          </div>
        ))}
      </div>

      {/* Current period */}
      <div style={{margin:'0 52px 12px', background:T.surface, padding:'20px 26px', borderLeft:`3px solid ${T.accent}`, borderRadius:12}}>
        <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:7}}>
          {open.length===0 ? 'All done for today · enjoy your evening' : `${open.length} tasks remaining · stay focused`}
        </div>
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:28, color:T.ink, lineHeight:1.1, marginBottom:12}}>
          {curPeriod ? subjectBy(curPeriod.subj).name : 'Free time'}
        </div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, border:`1px solid ${T.border}`, padding:'4px 10px', letterSpacing:'0.09em', textTransform:'uppercase'}}>
            {curPeriod ? 'Class in session' : 'No class in session'}
          </span>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:2}}>Tomorrow</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink3}}>Clear ahead</div>
          </div>
        </div>
      </div>

      {/* Game plan */}
      <div style={{margin:'0 52px 12px', background:T.surface, padding:'17px 26px', borderRadius:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:13}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:22, height:22, background:T.accent, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
              <span style={{color:'#fff', fontSize:11}}>✦</span>
            </div>
            <div>
              <div style={{fontFamily:T.ui, fontSize:13, color:T.ink, fontWeight:500}}>Game plan for today</div>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3}}>AI · updates with your homework & schedule</div>
            </div>
          </div>
          <button style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, background:'none', border:`1px solid ${T.border}`, padding:'5px 11px', cursor:'pointer', transition:'border-color 0.12s'}}
            onMouseOver={e=>e.currentTarget.style.borderColor=T.accent}
            onMouseOut={e=>e.currentTarget.style.borderColor=T.border}
          >↻ Refresh</button>
        </div>
        {open.length === 0
          ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3}}>Review your notes and plan out your evening.</div>
          : open.slice(0,4).map((hw,i) => {
              const s = subjectBy(hw.subj);
              return (
                <div key={i} style={{display:'flex', gap:12, marginBottom:8}}>
                  <span style={{fontFamily:T.mono, fontSize:9, color:T.ink3, flexShrink:0, width:12}}>{i+1}</span>
                  <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink2, lineHeight:1.5}}>{s.short}: {hw.title} — {hw.est}</div>
                </div>
              );
            })
        }
      </div>

      {/* Bottom 3-column */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, margin:'0 52px 28px'}}>
        {/* Workload */}
        <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
          <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:11}}>Workload</div>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>Due Today</div>
            <span style={{fontFamily:T.mono, fontSize:8, color:T.accent, cursor:'pointer'}}>All homework →</span>
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
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:7}}>Quizzes Ahead</div>
            {quizzes.slice(0,2).map(q => {
              const s = subjectBy(q.subj);
              return (
                <div key={q.title} style={{display:'flex', gap:7, alignItems:'center', marginBottom:5}}>
                  <div style={{width:5, height:5, borderRadius:1, background:s.color, flexShrink:0}}/>
                  <div style={{flex:1, fontFamily:T.ui, fontSize:11.5, color:T.ink2}}>{q.title.split('—')[0].trim()}</div>
                  <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, flexShrink:0}}>{q.date}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Schedule & Notes */}
        <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
          <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:11}}>Schedule & Notes</div>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>Schedule</div>
            <span style={{fontFamily:T.mono, fontSize:8, color:T.accent, cursor:'pointer'}}>Edit → {dayStr.slice(0,3)}</span>
          </div>
          {schedule.filter(p => p.subj).slice(0,5).map(p => {
            const s = subjectBy(p.subj);
            return (
              <div key={p.period} style={{display:'flex', alignItems:'center', gap:7, marginBottom:5}}>
                <div style={{width:4, height:4, borderRadius:1, background:s.color, flexShrink:0}}/>
                <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink2, flex:1}}>{s.short}</div>
                <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, flexShrink:0}}>{p.time.split('–')[0].trim()}</div>
              </div>
            );
          })}
          {schedule.length === 0 && <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, opacity:0.5}}>No schedule set — add classes in Schedule.</div>}
          {schedule.filter(p=>!p.subj&&p.room==='Library').map(p => (
            <div key="lib" style={{fontFamily:T.mono, fontSize:8, color:T.ink3, marginTop:6}}>2:45 → Study Hall</div>
          ))}
        </div>

        {/* Progress */}
        <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
          <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:11}}>Progress</div>
          <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:7}}>Study Streak</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:42, color:T.accent, lineHeight:0.9, marginBottom:4}}>{streak}</div>
          <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, marginBottom:14}}>days</div>
          <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, lineHeight:1.6, marginBottom:16}}>{streak > 0 ? `Day ${streak} — keep it going.` : 'Start your streak today.'}</div>
          <div style={{display:'flex', gap:3, flexWrap:'wrap'}}>
            {Array.from({length:14}).map((_,i) => (
              <div key={i} style={{width:11, height:11, borderRadius:2, background: i < streak ? T.accent : T.bl}}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 2. Homework ────────────────────────────────────────── */
function HomeworkScreen({ profile, userData, onUpdate }) {
  const subjects  = profile?.subjects || [];
  const subjectBy = makeSubjectBy(subjects);
  const homework  = userData?.homework || [];

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubj,  setNewSubj]  = useState(subjects[0]?.id || '');
  const [newDue,   setNewDue]   = useState('Tonight');
  const [newEst,   setNewEst]   = useState('30 min');

  const addHomework = () => {
    if (!newTitle.trim()) return;
    const item = { id: Date.now()+'', subj: newSubj || subjects[0]?.id || '', title: newTitle.trim(), due: newDue, urgent: newDue === 'Tonight', done: false, est: newEst };
    onUpdate && onUpdate({ homework: [...homework, item] });
    setNewTitle(''); setShowAdd(false);
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
        <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink, lineHeight:1.3, marginBottom:3, textDecoration: hw.done ? 'line-through' : 'none', opacity: hw.done ? 0.5 : 1}}>{hw.title}</div>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <span style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3}}>{s.short}</span>
          <span style={{fontFamily:T.mono, fontSize:7.5, color: hw.urgent ? '#bf4a30' : T.ink3}}>{hw.due}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'28px 52px'}}>
        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20}}>
          <div>
            <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:6}}>Workload · This Week</div>
            <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
              <span style={{fontFamily:T.ui, fontWeight:700, fontSize:28, color:T.ink}}>Homework, </span>
              <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:30, color:T.ink}}>all of it.</span>
            </h1>
            <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.05em'}}>
              {open.length === 0 ? 'Nothing due — enjoy the break ✓' : `${open.length} assignments open · ${urgent.length} urgent`}
            </div>
          </div>
          <button onClick={() => setShowAdd(s => !s)} style={{padding:'7px 18px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer', flexShrink:0}}>+ Add</button>
        </div>

        {/* Add homework form */}
        {showAdd && (
          <div style={{background:T.surface, border:`1px solid ${T.border}`, padding:'16px 20px', marginBottom:12, display:'flex', flexWrap:'wrap', gap:10, alignItems:'flex-end'}}>
            <div style={{flex:'1 1 200px'}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5}}>Assignment</div>
              <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addHomework()} placeholder="e.g. Read chapter 5" style={{width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, fontFamily:T.ui, fontSize:13, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box'}} />
            </div>
            <div style={{flex:'0 1 140px'}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5}}>Subject</div>
              <select value={newSubj} onChange={e=>setNewSubj(e.target.value)} style={{width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, fontFamily:T.ui, fontSize:13, color:T.ink, background:T.bg, cursor:'pointer'}}>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.short || s.name}</option>)}
              </select>
            </div>
            <div style={{flex:'0 1 120px'}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5}}>Due</div>
              <select value={newDue} onChange={e=>setNewDue(e.target.value)} style={{width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, fontFamily:T.ui, fontSize:13, color:T.ink, background:T.bg, cursor:'pointer'}}>
                {['Tonight','Tomorrow','Wed','Thu','Fri','Next Week'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{flex:'0 1 120px'}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5}}>Est. Time</div>
              <select value={newEst} onChange={e=>setNewEst(e.target.value)} style={{width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, fontFamily:T.ui, fontSize:13, color:T.ink, background:T.bg, cursor:'pointer'}}>
                {['15 min','30 min','45 min','1 hr','1 hr 30 min','2 hr','3 hr'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button onClick={addHomework} style={{padding:'8px 20px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer', flexShrink:0}}>Save →</button>
            <button onClick={()=>setShowAdd(false)} style={{padding:'8px 14px', border:`1px solid ${T.border}`, background:'none', color:T.ink3, fontFamily:T.mono, fontSize:8.5, cursor:'pointer', flexShrink:0}}>Cancel</button>
          </div>
        )}

        {/* 5 stat cards */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:12}}>
          {[
            { label:'OPEN WORK',   val:open.length,         sub:'assignments',                               accent:T.accent  },
            { label:'URGENT',      val:urgent.length,       sub:'need attention',                            accent:'#bf4a30' },
            { label:'DUE TODAY',   val:tonight.length,      sub:'assignments',                               accent:'#b07020' },
            { label:'EST. TIME',   val:estDisplay,          sub:'remaining',                                 accent:'#2a60a0' },
            { label:'COMPLETION',  val:`${completionPct}%`, sub:`${done.length} of ${homework.length} done`, accent:'#3a8a52' },
          ].map(c => (
            <div key={c.label} style={{background:T.surface, padding:'24px 20px', borderRadius:12, minHeight:100, borderBottom:`2px solid ${c.accent}28`}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em', marginBottom:10}}>{c.label}</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:34, color:T.ink, lineHeight:0.9, marginBottom:8}}>{c.val}</div>
              <div style={{fontFamily:T.mono, fontSize:8, color:c.accent}}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Board label */}
        <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', padding:'10px 0 8px'}}>Assignment Board</div>

        {/* Kanban */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
          {COLS.map(col => (
            <div key={col.label} style={{background:T.surface, borderRadius:12, minHeight:180}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:`1px solid ${T.bl}`}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <div style={{width:6, height:6, borderRadius:'50%', background:col.color}}/>
                  <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{col.label}</div>
                </div>
                <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3}}>{col.items.length}</div>
              </div>
              <div style={{padding:'9px 10px'}}>
                {col.items.length === 0
                  ? <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', padding:'22px 0', opacity:0.35}}>EMPTY</div>
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
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>Homework by Subject</div>
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
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>Quick Actions</div>
            {[['+','Add Homework'],['✦','Generate Study Plan'],['+','Create Flashcards'],['→','Open Due Today'],['+','Start Focus Session']].map(([ic,lb]) => (
              <div key={lb} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${T.bl}`, cursor:'pointer'}}
                onMouseOver={e => e.currentTarget.style.opacity='0.6'}
                onMouseOut={e => e.currentTarget.style.opacity='1'}
              >
                <div style={{width:28, height:28, borderRadius:'50%', background:T.accentSoft, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <span style={{fontFamily:T.mono, fontSize:11, color:T.accent, fontWeight:700}}>{ic}</span>
                </div>
                <span style={{fontFamily:T.ui, fontSize:12, color:T.ink2}}>{lb}</span>
              </div>
            ))}
          </div>

          {/* This Week */}
          <div style={{background:T.surface, borderRadius:12, padding:'20px 22px'}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>This Week</div>
            {[['COMPLETED', done.length],['OPEN', open.length],['AVG. COMPLETION','1.3d early'],['MOST ACTIVE', open.length>0?subjectBy(open[0].subj).short:'—']].map(([l,v]) => (
              <div key={l} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${T.bl}`}}>
                <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{l}</div>
                <div style={{fontFamily:T.mono, fontSize:11, color: l==='AVG. COMPLETION'?T.accent:T.ink, fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}

/* ── 3. Quizzes ─────────────────────────────────────────── */
function QuizzesScreen({ profile, userData }) {
  const subjectBy = makeSubjectBy(profile?.subjects || []);
  const quizzes   = userData?.quizzes || [];
  const cc = (c) => c >= 0.75 ? '#3a8a52' : c >= 0.55 ? '#b07020' : '#bf4a30';
  const cl = (c) => c >= 0.75 ? 'strong' : c >= 0.55 ? 'fair' : 'weak';
  return (
    <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'56px 72px'}}>
      <PageHeader eyebrow={`${quizzes.length} upcoming`} title="Quizzes" />
      <Hr />
      {quizzes.length === 0 && (
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:18, color:T.ink3, lineHeight:1.8}}>No quizzes scheduled yet. Add quiz dates from your Homework screen or directly here.</div>
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
                  <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase'}}>{s.name}</div>
                </div>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, lineHeight:1.25, marginBottom:14}}>{q.title}</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:7}}>
                  {q.topics.map(t => (
                    <span key={t} style={{fontFamily:T.mono, fontSize:9, color:T.ink2, background:T.bl, padding:'3px 9px', letterSpacing:'0.02em'}}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{textAlign:'right', flexShrink:0, minWidth:96}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:32, color:T.accent, lineHeight:1, letterSpacing:'-0.02em', marginBottom:10}}>{q.date}</div>
                <div style={{display:'flex', alignItems:'center', gap:7, justifyContent:'flex-end', marginBottom:4}}>
                  <div style={{width:64, height:2.5, background:T.border, borderRadius:2, overflow:'hidden'}}>
                    <div style={{width:`${pct}%`, height:'100%', background:cc(q.confidence), borderRadius:2}} />
                  </div>
                  <span style={{fontFamily:T.mono, fontSize:9, color:cc(q.confidence)}}>{pct}%</span>
                </div>
                <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{cl(q.confidence)}</div>
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

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '');
      setSubj(initial?.subj || subjects[0]?.id || '');
      setBody(initial?.body ?? initial?.preview ?? '');
      setClosing(false);
    }
  }, [open]);

  if (!open) return null;
  const isEdit = !!(initial && initial.id);
  const dismiss = () => { setClosing(true); setTimeout(onClose, 320); };
  const submit = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), subj: subj || subjects[0]?.id || '', body });
    dismiss();
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div style={{ width:520, maxWidth:'92vw', background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'36px 32px 28px', position:'relative', opacity:0, boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)', animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards` }}>
        <button onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>{isEdit ? 'Edit ' : 'New '}<span style={{color:T.accent}}>note</span></div>
        <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:22}}>Saved to your account · syncs across devices</div>

        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Note title" autoFocus
          style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', marginBottom:16}}
          onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />

        {subjects.length > 0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:8}}>Subject</div>
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

        <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Write your note…" rows={8}
          style={{width:'100%', padding:'12px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:13, lineHeight:1.6, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:24}}
          onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:9, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer'}}
            onMouseOver={e=>e.currentTarget.style.background=T.bl} onMouseOut={e=>e.currentTarget.style.background='transparent'}>Cancel</button>
          <button onClick={submit} disabled={!title.trim()} style={{padding:'9px 24px', border:'none', background: title.trim() ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:9, color:'#fff', letterSpacing:'0.06em', cursor: title.trim() ? 'pointer' : 'default', fontWeight:600}}>{isEdit ? 'Save changes' : 'Create note'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function NotesScreen({ profile, userData, onUpdate }) {
  const subjectBy = makeSubjectBy(profile?.subjects || []);
  const subjects  = profile?.subjects || [];
  const notes     = userData?.notes   || [];
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

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
  const deleteNote = (id) => { onUpdate({ notes: notes.filter(n => n.id !== id) }); setActive(null); };
  const noteEditor = <NoteEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} onSave={saveNote} subjects={subjects} initial={editTarget} />;

  if (active) {
    const note = notes.find(n => n.id === active);
    if (!note) { setActive(null); return null; }
    const s = subjectBy(note.subj);
    return (
      <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'56px 72px'}}>
        {noteEditor}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28}}>
          <button onClick={() => setActive(null)} style={{background:'none', border:'none', padding:0, fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', display:'flex', alignItems:'center', gap:7, cursor:'pointer'}}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2L4 6l4 4"/></svg>
            All Notes
          </button>
          <div style={{display:'flex', gap:8}}>
            <button onClick={() => openEdit(note)} style={{padding:'7px 16px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>Edit</button>
            <button onClick={() => deleteNote(note.id)} style={{padding:'7px 16px', border:`1px solid ${T.border}`, background:T.surface, color:'#bf4a30', fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>Delete</button>
          </div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:9, marginBottom:16}}>
          <div style={{width:6, height:6, borderRadius:1.5, background:s.color}}/>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.11em', textTransform:'uppercase'}}>{s.name} · {note.date}</div>
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
    <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'28px 52px'}}>
        {noteEditor}
        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20}}>
          <div>
            <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:7}}>Notes</div>
            <h1 style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:38, color:T.ink, margin:'0 0 5px', lineHeight:1.05}}>Notes.</h1>
            <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3}}>Your personal knowledge base.</div>
          </div>
          <button onClick={() => openNew()} style={{padding:'8px 18px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer', flexShrink:0, marginTop:4}}>+ New note</button>
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
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>{c.label}</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:c.label==='LAST EDITED'?24:34, color: c.label==='KNOWLEDGE GROWTH'?c.accent:T.ink, lineHeight:0.9, marginBottom:8}}>{c.val}</div>
              <div style={{fontFamily:T.mono, fontSize:8, color:c.accent}}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{position:'relative', marginBottom:1}}>
          <div style={{position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', color:T.ink3, pointerEvents:'none'}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes, subjects, tags…"
            style={{width:'100%', padding:'11px 48px', background:T.surface, border:`1px solid ${T.border}`, fontFamily:T.ui, fontSize:13, color:T.ink, outline:'none', boxSizing:'border-box'}}
          />
          <div style={{position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', fontFamily:T.mono, fontSize:8.5, color:T.ink3}}>⌘K</div>
        </div>

        {/* Recent Notes panel */}
        <div style={{background:T.border, marginBottom:1}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:T.surface, borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:'flex', alignItems:'center', gap:7}}>
              <div style={{width:6, height:6, borderRadius:'50%', background:T.accent}}/>
              <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em'}}>Recent Notes</div>
            </div>
            <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3}}>{filtered.length}</div>
          </div>
          {filtered.length === 0 ? (
            <div style={{background:T.surface, padding:'48px 24px', textAlign:'center'}}>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink2, marginBottom:6}}>{notes.length === 0 ? 'Nothing here yet' : 'No matching notes'}</div>
              <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, marginBottom:18}}>{notes.length === 0 ? 'Create your first note to start building your knowledge base.' : 'Try a different search.'}</div>
              {notes.length === 0 && <button onClick={() => openNew()} style={{padding:'9px 20px', border:`1px solid ${T.accent}`, background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:9, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Create your first note</button>}
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
                    <span style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{s.short}</span>
                    <span style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, marginLeft:'auto'}}>{note.date}</span>
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
        <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', padding:'9px 0 8px'}}>Subject Library · {subjects.length}</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:12}}>
          {subjNotes.map(({subj:s, notes:sn}) => (
            <div key={s.id} style={{background:T.surface, padding:'15px 16px', borderRadius:12, borderLeft:`3px solid ${s.color}`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink, lineHeight:1.2}}>{s.name}</div>
                <button onClick={() => { const first = sn[0]; if (first) setActive(first.id); else openNew(s.id); }} style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, background:'none', border:'none', cursor:'pointer', padding:0, flexShrink:0, marginLeft:6}}>Open →</button>
              </div>
              <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, marginBottom:7}}>{sn.length} notes</div>
              {sn.length > 0 && <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>{sn[0].preview}</div>}
              <button onClick={() => openNew(s.id)} style={{marginTop:9, fontFamily:T.mono, fontSize:7.5, color:s.color, background:`${s.color}14`, border:`1px solid ${s.color}35`, padding:'4px 10px', cursor:'pointer', letterSpacing:'0.07em'}}>+ Create note</button>
            </div>
          ))}
        </div>

        {/* Floating cards — Knowledge Insights + AI Workspace */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
          <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:14}}>
              <div style={{width:6, height:6, borderRadius:'50%', background:T.accent}}/>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Knowledge Insights</div>
            </div>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:3}}>Most Active</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16, color:T.ink, marginBottom:3}}>{mostActiveSubj?.name || '—'}</div>
            <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, marginBottom:14}}>{mostActiveSubj ? notes.filter(n=>n.subj===mostActiveSubj.id).length : 0} notes</div>
            {[['Last Edited', mostRecentNote?.date||'—'],['Total Notes',notes.length],['Subjects',subjects.length]].map(([label,val]) => (
              <div key={label} style={{marginBottom:10}}>
                <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:2}}>{label}</div>
                <div style={{fontFamily:T.ui, fontSize:12, color:T.ink2}}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:13}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <div style={{width:6, height:6, borderRadius:'50%', background:'#6c63ff'}}/>
                <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em'}}>AI Workspace</div>
              </div>
              <span style={{fontFamily:T.mono, fontSize:7.5, background:'rgba(108,99,255,0.1)', color:'#6c63ff', padding:'2px 6px'}}>AI</span>
            </div>
            {[
              {ic:'✦', label:'Generate study guide',     sub:'AI summary from all notes'},
              {ic:'◈', label:'Summarise subject notes',  sub:'Distil key concepts'},
              {ic:'⊞', label:'Create flashcard deck',    sub:'Turn notes into study cards'},
              {ic:'◉', label:'Find knowledge gaps',      sub:'Identify missing areas'},
            ].map(a => (
              <div key={a.label} style={{display:'flex', gap:9, alignItems:'flex-start', padding:'9px 0', borderBottom:`1px solid ${T.bl}`, cursor:'pointer'}}
                onMouseOver={e => e.currentTarget.style.opacity='0.65'}
                onMouseOut={e => e.currentTarget.style.opacity='1'}
              >
                <div style={{width:22, height:22, background:T.bl, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:3, flexShrink:0}}>
                  <span style={{fontSize:11, color:'#6c63ff'}}>{a.ic}</span>
                </div>
                <div>
                  <div style={{fontFamily:T.ui, fontSize:12, color:T.ink, fontWeight:500, marginBottom:2}}>{a.label}</div>
                  <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3}}>{a.sub}</div>
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

  useEffect(() => {
    if (open) {
      setQ(initial?.q || '');
      setA(initial?.a || '');
      setSubj(initial?.subj || subjects[0]?.id || '');
      setClosing(false);
    }
  }, [open]);

  if (!open) return null;
  const isEdit = !!(initial && initial.id);
  const dismiss = () => { setClosing(true); setTimeout(onClose, 320); };
  const submit = () => {
    if (!q.trim() || !a.trim()) return;
    onSave({ q: q.trim(), a: a.trim(), subj: subj || subjects[0]?.id || '' });
    dismiss();
  };

  return ReactDOM.createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }} style={{position:'fixed', inset:0, zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(24,21,14,0.25)', opacity:0, animation:`shq-modal-fade-${closing?'out':'in'} ${closing?'0.28s':'0.35s'} ease forwards`}}>
      <div style={{ width:500, maxWidth:'92vw', background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:'36px 32px 28px', position:'relative', opacity:0, boxShadow:'0 24px 80px -16px rgba(24,21,14,0.18)', animation:`shq-modal-slide-${closing?'down':'up'} ${closing?'0.26s':'0.4s'} cubic-bezier(0.16,1,0.3,1) ${closing?'0s':'0.05s'} forwards` }}>
        <button onClick={dismiss} style={{position:'absolute', top:14, right:16, border:'none', background:'none', color:T.ink3, fontSize:18, cursor:'pointer', padding:4, lineHeight:1}}>×</button>
        <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, marginBottom:4}}>{isEdit ? 'Edit ' : 'New '}<span style={{color:T.accent}}>flashcard</span></div>
        <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:22}}>Saved to your account · syncs across devices</div>

        <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:6}}>Question / Term</div>
        <textarea value={q} onChange={e=>setQ(e.target.value)} placeholder="e.g. What is the Central Limit Theorem?" rows={2} autoFocus
          style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:13, lineHeight:1.5, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:16}}
          onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />

        <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:6}}>Answer / Definition</div>
        <textarea value={a} onChange={e=>setA(e.target.value)} placeholder="The answer…" rows={3}
          style={{width:'100%', padding:'10px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:13, lineHeight:1.6, color:T.ink, background:T.bg, outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:16}}
          onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />

        {subjects.length > 0 && (
          <div style={{marginBottom:24}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:8}}>Subject</div>
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
          <button onClick={dismiss} style={{padding:'9px 20px', border:`1px solid ${T.border}`, background:'transparent', borderRadius:10, fontFamily:T.mono, fontSize:9, color:T.ink3, letterSpacing:'0.06em', cursor:'pointer'}}
            onMouseOver={e=>e.currentTarget.style.background=T.bl} onMouseOut={e=>e.currentTarget.style.background='transparent'}>Cancel</button>
          <button onClick={submit} disabled={!q.trim() || !a.trim()} style={{padding:'9px 24px', border:'none', background: (q.trim() && a.trim()) ? T.accent : T.border, borderRadius:10, fontFamily:T.mono, fontSize:9, color:'#fff', letterSpacing:'0.06em', cursor: (q.trim() && a.trim()) ? 'pointer' : 'default', fontWeight:600}}>{isEdit ? 'Save changes' : 'Create card'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FlashcardsScreen({ profile, userData, onUpdate }) {
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const card = flashCards[qi % Math.max(flashCards.length, 1)] || { q: 'No flashcards yet', a: 'Add your first card to start studying.' };
  const next = (e) => { if (e) e.stopPropagation(); setFl(false); setRecall(''); setRevealed(false); setQi((qi+1) % Math.max(flashCards.length, 1)); };

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
    onUpdate({ flashcards: flashCards.filter(c => c.id !== id) });
    setQi(0);
  };
  const cardEditor = <FlashcardEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} onSave={saveCard} subjects={subjects} initial={editTarget} />;
  const backBtn = (
    <button onClick={() => { setMode(null); setFl(false); setQi(0); setRecall(''); setRevealed(false); }} style={{display:'flex', alignItems:'center', gap:7, background:'none', border:'none', padding:0, fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', cursor:'pointer'}}>
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
          <button onClick={() => openNew()} style={{padding:'10px 22px', border:`1px solid ${T.accent}`, background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:9, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Create your first card</button>
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
          <button onClick={() => openNew()} style={{padding:'7px 16px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ New flashcard</button>
        </div>
        <h1 style={{fontFamily:T.serif, fontStyle:'italic', fontSize:30, fontWeight:400, color:T.ink, margin:'0 0 20px'}}>Key Concepts</h1>
        {flashCards.length === 0 ? (
          <div style={{fontFamily:T.ui, fontSize:13, color:T.ink3}}>No cards yet — add one to build your reference sheet.</div>
        ) : flashCards.map(c => {
          const s = subjectBy(c.subj);
          return (
            <div key={c.id} style={{background:T.surface, borderRadius:12, padding:'16px 18px', marginBottom:10, borderLeft:`3px solid ${s.color}`}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6}}>
                <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{s.short}</div>
                <div style={{display:'flex', gap:10}}>
                  <button onClick={() => openEditCard(c)} style={{fontFamily:T.mono, fontSize:8, color:T.ink3, background:'none', border:'none', cursor:'pointer', padding:0}}>Edit</button>
                  <button onClick={() => deleteCard(c.id)} style={{fontFamily:T.mono, fontSize:8, color:'#bf4a30', background:'none', border:'none', cursor:'pointer', padding:0}}>Delete</button>
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
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3}}>{qi+1} / {flashCards.length}</div>
        </div>
        <div style={{flex:1, display:'flex', flexDirection:'column'}}>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:14}}>{mode === 'type' ? 'Type the answer' : 'Write what you recall'}</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, lineHeight:1.5, marginBottom:20}}>{card.q}</div>
          <textarea value={recall} onChange={e=>setRecall(e.target.value)} placeholder="Your answer…" rows={mode==='written'?6:3}
            style={{width:'100%', padding:'12px 14px', border:`1px solid ${T.border}`, borderRadius:10, fontFamily:T.ui, fontSize:14, lineHeight:1.6, color:T.ink, background:T.surface, outline:'none', boxSizing:'border-box', resize:'vertical', marginBottom:16}}
            onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.border} />
          {revealed && (
            <div style={{background:T.accentSoft, border:`1px solid ${T.accent}40`, borderRadius:10, padding:'16px 18px', marginBottom:16}}>
              {mode === 'type' && <div style={{fontFamily:T.mono, fontSize:8.5, color: correct ? '#3a8a52' : '#b07020', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8}}>{correct ? '✓ Correct' : 'Compare with the answer'}</div>}
              <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6}}>Answer</div>
              <div style={{fontFamily:T.serif, fontSize:17, color:T.ink, lineHeight:1.6}}>{card.a}</div>
            </div>
          )}
          <div style={{display:'flex', gap:10}}>
            {!revealed
              ? <button onClick={() => setRevealed(true)} style={{padding:'11px 24px', border:'none', background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:9, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8, fontWeight:600}}>Reveal answer</button>
              : <button onClick={() => next()} style={{padding:'11px 24px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:9, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>Next card →</button>}
          </div>
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
    {id:'multiple',   ic:'⊡', icC:'#2a60a0', title:'Multiple choice',  sub:'Auto-generated quiz',          soon:true },
    {id:'truefalse',  ic:'T/F',icC:'#3a8a52', title:'True / False',    sub:'Is this definition correct?',  soon:true },
  ];

  if (mode === 'flashcards') {
    return (
      <div className="screen-enter" style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'40px 60px 0'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
          <button onClick={() => { setMode(null); setFl(false); setQi(0); }} style={{display:'flex', alignItems:'center', gap:7, background:'none', border:'none', padding:0, fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase', cursor:'pointer'}}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2L4 6l4 4"/></svg>
            Back to Study Modes
          </button>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3}}>{qi+1} / {Math.max(flashCards.length, 1)}</div>
        </div>
        <div onClick={() => setFl(!fl)} style={{flex:1, border:`1px solid ${fl?T.accent:T.border}`, padding:'40px 60px', cursor:'pointer', background: fl?T.accentSoft:T.surface, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', transition:'all 0.18s'}}>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:fl?T.accent:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:20}}>{fl ? 'Answer' : `Question ${qi+1}`}</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:fl?20:24, color:T.ink, lineHeight:1.65, maxWidth:500}}>{fl ? card.a : card.q}</div>
          {!fl && <div style={{fontFamily:T.mono, fontSize:8.5, color:`${T.ink3}88`, marginTop:22, letterSpacing:'0.1em'}}>click to reveal</div>}
        </div>
        {fl && (
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginTop:8, flexShrink:0}}>
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
    <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'28px 52px'}}>
      {/* Header */}
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20}}>
        <div>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:6}}>Study & Practice · This Week</div>
          <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
            <span style={{fontFamily:T.ui, fontWeight:700, fontSize:28, color:T.ink}}>Study & </span>
            <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:30, color:T.ink}}>practice.</span>
          </h1>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3}}>Practice anytime · all subjects</div>
        </div>
        <button onClick={() => openNew()} style={{padding:'7px 16px', border:`1px solid ${T.accent}`, background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer', flexShrink:0, borderRadius:8}}>+ New flashcard</button>
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
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>{c.label}</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:36, color:T.ink, lineHeight:0.9, marginBottom:8}}>{c.val}</div>
            <div style={{fontFamily:T.mono, fontSize:8, color:c.accent}}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Study Modes */}
      <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>Study Modes</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12}}>
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
            <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.03em', marginBottom:18}}>{m.sub}</div>
            {m.soon
              ? <span style={{fontFamily:T.mono, fontSize:8, color:T.ink3, border:`1px solid ${T.border}`, padding:'5px 12px', letterSpacing:'0.07em', borderRadius:4}}>SOON</span>
              : <button onClick={() => setMode(m.id)} style={{fontFamily:T.mono, fontSize:8.5, color:m.icC, background:'none', border:`1px solid ${m.icC}50`, padding:'5px 14px', cursor:'pointer', letterSpacing:'0.07em'}}>START →</button>}
          </div>
        ))}
      </div>

      {/* Your cards */}
      <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', margin:'28px 0 14px'}}>Your Cards · {flashCards.length}</div>
      {flashCards.length === 0 ? (
        <div style={{background:T.surface, borderRadius:12, padding:'32px 24px', textAlign:'center'}}>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:18, color:T.ink2, marginBottom:6}}>Nothing here yet</div>
          <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, marginBottom:16}}>Create flashcards to study them in any mode above.</div>
          <button onClick={() => openNew()} style={{padding:'9px 20px', border:`1px solid ${T.accent}`, background:T.accent, color:'#fff', fontFamily:T.mono, fontSize:9, letterSpacing:'0.07em', cursor:'pointer', borderRadius:8}}>+ Create your first card</button>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12}}>
          {flashCards.map(c => {
            const s = subjectBy(c.subj);
            return (
              <div key={c.id} style={{background:T.surface, borderRadius:12, padding:'15px 16px', borderLeft:`3px solid ${s.color}`}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7}}>
                  <span style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{s.short}</span>
                  <div style={{display:'flex', gap:10}}>
                    <button onClick={() => openEditCard(c)} style={{fontFamily:T.mono, fontSize:8, color:T.ink3, background:'none', border:'none', cursor:'pointer', padding:0}}>Edit</button>
                    <button onClick={() => deleteCard(c.id)} style={{fontFamily:T.mono, fontSize:8, color:'#bf4a30', background:'none', border:'none', cursor:'pointer', padding:0}}>Delete</button>
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
function ScheduleScreen({ profile, userData }) {
  const subjectBy = makeSubjectBy(profile?.subjects || []);
  const homework  = userData?.homework || [];
  const quizzes   = userData?.quizzes  || [];
  const [weekOffset, setWeekOffset] = useState(0);
  const [planOpen,   setPlanOpen]   = useState(true);
  const [secs,       setSecs]       = useState(25 * 60);
  const [running,    setRunning]    = useState(false);
  const [sessions,   setSessions]   = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecs(s => {
        if (s <= 1) { setRunning(false); setSessions(n => n+1); return 25*60; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(secs/60)).padStart(2,'0');
  const ss = String(secs%60).padStart(2,'0');

  const now = new Date();
  const dow = now.getDay();
  const monOffset = (dow + 6) % 7;
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - monOffset + weekOffset * 7);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 4);
  const fmt = d => d.toLocaleDateString('en-US',{month:'short', day:'numeric'});

  const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
  const dayCards = DAYS.map((name, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    const isToday = d.toDateString() === now.toDateString();
    const dayHW = homework.filter(hw => {
      if (hw.done) return false;
      if (name === 'Mon' && hw.due === 'Tonight')    return weekOffset === 0 && dow <= 1;
      if (name === 'Tue' && hw.due === 'Tomorrow')   return weekOffset === 0 && dow === 1;
      if (name === 'Wed' && hw.due === 'Wed')         return true;
      if (name === 'Thu' && hw.due === 'Thu')         return true;
      if (name === 'Fri' && hw.due === 'Fri')         return true;
      return false;
    });
    return { name, date: d.getDate(), isToday, dayHW };
  });

  const totalTasks = homework.filter(h => !h.done).length;

  const PLAN_DAYS = [
    { day:'Monday',    tasks: homework.filter(h=>h.urgent&&!h.done).slice(0,1).map(h=>subjectBy(h.subj).short+': '+h.title.slice(0,35)) },
    { day:'Tuesday',   tasks: homework.filter(h=>h.due==='Tomorrow'&&!h.done).slice(0,1).map(h=>subjectBy(h.subj).short+': '+h.title.slice(0,35)) },
    { day:'Wednesday', tasks: homework.filter(h=>h.due==='Wed'&&!h.done).slice(0,1).map(h=>subjectBy(h.subj).short+': '+h.title.slice(0,35)) },
  ].filter(d => d.tasks.length > 0);

  const workloadDays = ['M','T','W','T','F'];
  const workloadVals = [urgent=>urgent, thisWeek=>thisWeek, upcoming=>upcoming, 0, 0];
  const barMax = Math.max(totalTasks, 1);

  const NavBtn = ({children, onClick}) => (
    <button onClick={onClick} style={{padding:'6px 12px', border:`1px solid ${T.border}`, background:T.surface, color:T.ink3, fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.06em', cursor:'pointer'}}
      onMouseOver={e=>e.currentTarget.style.borderColor=T.accent}
      onMouseOut={e=>e.currentTarget.style.borderColor=T.border}
    >{children}</button>
  );

  return (
    <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'28px 52px'}}>
      {/* Header */}
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:18}}>
        <div>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:6}}>
            Spring · Week {weekOffset === 0 ? '·' : weekOffset > 0 ? '+'+weekOffset : weekOffset} · This Week
          </div>
          <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
            <span style={{fontFamily:T.ui, fontWeight:700, fontSize:28, color:T.ink}}>Your </span>
            <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:30, color:T.ink}}>schedule.</span>
          </h1>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3}}>{fmt(weekStart)} – {fmt(weekEnd)} · {dayCards.reduce((a,d)=>a+d.dayHW.length,0)} items</div>
        </div>
        <div style={{display:'flex', gap:6, flexShrink:0, marginTop:6}}>
          <NavBtn onClick={()=>setWeekOffset(w=>w-1)}>← Week</NavBtn>
          <NavBtn onClick={()=>setWeekOffset(w=>w+1)}>Week →</NavBtn>
          <NavBtn onClick={()=>setWeekOffset(0)}>Today</NavBtn>
        </div>
      </div>

      {/* AI Study Plan */}
      <div style={{background:T.surface, marginBottom:1, border:`1px solid ${T.border}`}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', borderBottom: planOpen ? `1px solid ${T.border}` : 'none'}}>
          <div style={{display:'flex', alignItems:'center', gap:9}}>
            <div style={{display:'flex', gap:3}}>
              {['#bf4a30','#b8943a','#3a8a52'].map(c=><div key={c} style={{width:7,height:7,borderRadius:'50%',background:c}}/>)}
            </div>
            <div style={{fontFamily:T.ui, fontSize:13, color:T.ink, fontWeight:500}}>AI Study Plan</div>
            <span style={{fontFamily:T.mono, fontSize:7.5, background:'rgba(108,99,255,0.1)', color:'#6c63ff', padding:'2px 6px'}}>AI</span>
            <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3}}>Adapts to your homework, quizzes, and due dates</div>
          </div>
          <div style={{display:'flex', gap:7}}>
            <button style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, background:'none', border:`1px solid ${T.border}`, padding:'4px 10px', cursor:'pointer'}}
              onMouseOver={e=>e.currentTarget.style.borderColor=T.accent}
              onMouseOut={e=>e.currentTarget.style.borderColor=T.border}
            >↻ Regenerate</button>
            <button onClick={()=>setPlanOpen(o=>!o)} style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, background:'none', border:`1px solid ${T.border}`, padding:'4px 10px', cursor:'pointer'}}>{planOpen?'Hide plan':'Show plan'}</button>
          </div>
        </div>
        {planOpen && (
          <div style={{padding:'14px 18px'}}>
            {PLAN_DAYS.length === 0
              ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3}}>Log homework and quiz dates to generate your personalised plan.</div>
              : PLAN_DAYS.map(p => (
                  <div key={p.day} style={{display:'flex', gap:12, marginBottom:7}}>
                    <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em', width:64, flexShrink:0, paddingTop:1}}>{p.day}</div>
                    <div style={{flex:1}}>
                      {p.tasks.map(t=><div key={t} style={{fontFamily:T.ui, fontSize:12.5, color:T.ink2, lineHeight:1.5}}>{t}</div>)}
                    </div>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr) 1fr', gap:12, marginBottom:12}}>
        {[
          {label:'TASKS DUE',  val: dayCards.reduce((a,d)=>a+d.dayHW.length,0), accent:T.accent  },
          {label:'QUIZZES',    val: quizzes.length,                                              accent:'#9254de' },
          {label:'EST. STUDY', val: `${Math.ceil(homework.filter(h=>!h.done).length*0.75)}h`,    accent:'#2a60a0' },
          {label:'URGENT',     val: homework.filter(h=>h.urgent&&!h.done).length,                accent:'#bf4a30' },
        ].map(c => (
          <div key={c.label} style={{background:T.surface, padding:'22px 18px', borderRadius:12, minHeight:90, borderBottom:`2px solid ${c.accent}28`}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em', marginBottom:8}}>{c.label}</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:30, color:T.ink, lineHeight:0.9, marginBottom:5}}>{c.val}</div>
            <div style={{width:24, height:2, background:c.accent, opacity:0.5}}/>
          </div>
        ))}
        {/* Workload Distribution mini bar chart */}
        <div style={{background:T.surface, padding:'11px 16px'}}>
          <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8}}>Workload Distribution</div>
          <div style={{display:'flex', alignItems:'flex-end', gap:4, height:28}}>
            {dayCards.map((d,i) => {
              const h = barMax > 0 ? Math.round((d.dayHW.length / barMax) * 28) : 4;
              return (
                <div key={i} style={{display:'flex', flexDirection:'column', alignItems:'center', flex:1, gap:3}}>
                  <div style={{width:'100%', background:d.isToday?T.accent:T.bl, height:Math.max(h,3), transition:'height 0.2s', borderRadius:1}}/>
                  <div style={{fontFamily:T.mono, fontSize:7, color:d.isToday?T.accent:T.ink3, letterSpacing:'0.06em'}}>{d.name[0]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Weekly grid Mon–Fri */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:12}}>
        {dayCards.map(d => (
          <div key={d.name} style={{background: d.isToday ? T.accentSoft : T.surface, padding:'18px 16px', borderTop: d.isToday ? `2px solid ${T.accent}` : '2px solid transparent', minHeight:148, borderRadius:12, position:'relative', overflow:'hidden'}}>
            {d.isToday && <div style={{position:'absolute', bottom:-22, right:-22, width:72, height:72, borderRadius:'50%', background:T.accent, opacity:0.08}}/>}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:13}}>
              <div style={{fontFamily:T.mono, fontSize:8.5, color:d.isToday?T.accent:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{d.name}</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:d.isToday?T.accent:T.ink3}}>{d.date}</div>
            </div>
            {d.dayHW.length === 0
              ? <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, opacity:0.35, textTransform:'uppercase', letterSpacing:'0.08em'}}>Nothing scheduled</div>
              : d.dayHW.map(hw => {
                  const s = subjectBy(hw.subj);
                  return (
                    <div key={hw.title} style={{display:'flex', gap:6, alignItems:'flex-start', marginBottom:5}}>
                      <div style={{width:4, height:4, borderRadius:1, background:s.color, marginTop:4, flexShrink:0}}/>
                      <div style={{fontFamily:T.ui, fontSize:11, color:T.ink2, lineHeight:1.4}}>{hw.title.slice(0,32)}{hw.title.length>32?'…':''}</div>
                    </div>
                  );
                })
            }
          </div>
        ))}
      </div>

      {/* Sat / Sun compact */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
        {['Sat','Sun'].map((d,i) => {
          const date = new Date(weekStart); date.setDate(weekStart.getDate() + 5 + i);
          return (
            <div key={d} style={{background:T.surface, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', borderRadius:12}}>
              <div style={{display:'flex', gap:10, alignItems:'center'}}>
                <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{d} {date.getDate()}</div>
                <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3}}>Free</div>
              </div>
              <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, opacity:0.4}}>· · ·</div>
            </div>
          );
        })}
      </div>

      {/* Focus / Pomodoro */}
      <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:12}}>
        <div style={{background:T.surface, padding:'20px 24px', borderRadius:12}}>
          <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:14}}>
            Focus · {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]}
          </div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:22, color:T.ink, marginBottom:4}}>Focus session</div>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, marginBottom:20}}>25-minute Pomodoro · {sessions} session{sessions!==1?'s':''} completed</div>
          <div style={{display:'flex', gap:8}}>
            <button onClick={()=>setRunning(r=>!r)} style={{padding:'8px 20px', border:'none', background: running?T.accent:T.bl, color: running?'#fff':T.ink, fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.07em', cursor:'pointer'}}>
              {running ? '⏸ Pause' : '▶ Start'}
            </button>
            <button onClick={()=>{setRunning(false);setSecs(25*60);}} style={{padding:'8px 14px', border:`1px solid ${T.border}`, background:'none', color:T.ink3, fontFamily:T.mono, fontSize:8.5, cursor:'pointer'}}>↺ Reset</button>
          </div>
        </div>
        <div style={{background:T.surface, padding:'20px 28px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
          <div style={{position:'relative', width:90, height:90, marginBottom:10}}>
            <svg width={90} height={90} viewBox="-45 -45 90 90" style={{transform:'rotate(-90deg)'}}>
              <circle r={38} fill="none" stroke={T.bl} strokeWidth={4}/>
              <circle r={38} fill="none" stroke={running?T.accent:T.ink3} strokeWidth={4}
                strokeDasharray={`${(secs/(25*60))*2*Math.PI*38} ${2*Math.PI*38}`}
                strokeLinecap="round" style={{transition:'stroke-dasharray 1s linear'}}/>
            </svg>
            <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
              <div style={{fontFamily:T.mono, fontSize:16, color: running?T.accent:T.ink, letterSpacing:'-0.02em'}}>{mm}:{ss}</div>
            </div>
          </div>
          <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>{sessions} sessions</div>
        </div>
      </div>

      <div style={{height:28}}/>
    </div>
  );
}

/* ── 7. Grades ──────────────────────────────────────────── */
function GradesScreen({ profile, userData, onUpdate }) {
  const subjects   = profile?.subjects || [];
  const homework   = userData?.homework || [];
  const grades     = userData?.grades   || {};
  const gradeHistory = userData?.gradeHistory || [];
  const GRADE_OPTS = ['A+','A','A−','B+','B','B−','C+','C','C−','D','F'];

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

  const graded  = subjects.filter(s => grades[s.id] != null);
  const bestPerf  = graded.length ? graded.reduce((a,b) => (GPA_MAP[grades[b.id]]||0) > (GPA_MAP[grades[a.id]]||0) ? b : a) : null;
  const needsAttn = graded.length ? graded.reduce((a,b) => (GPA_MAP[grades[b.id]]||0) < (GPA_MAP[grades[a.id]]||0) ? b : a) : null;
  const totalHW   = homework.length;

  // GPA ring
  const R = 30, circ = 2 * Math.PI * R;

  // Recent grades per subject
  const recentScores = subjects.map(s => ({
    subj: s,
    grade: grades[s.id] || null,
  })).filter(x => x.grade).sort((a,b) => (GPA_MAP[b.grade]||0) - (GPA_MAP[a.grade]||0));

  return (
    <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'30px 52px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:22}}>
          <div>
            <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:7}}>Spring Term</div>
            <h1 style={{margin:'0 0 5px', lineHeight:1.1}}>
              <span style={{fontFamily:T.ui, fontWeight:700, fontSize:29, color:T.ink}}>Academic </span>
              <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:31, color:T.ink}}>performance.</span>
            </h1>
            <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3}}>Click any subject to view grade detail.</div>
          </div>
          <div style={{display:'flex', gap:8, flexShrink:0}}>
            <button style={{
              display:'flex', alignItems:'center', gap:6, padding:'7px 13px',
              border:'none', background:T.accent, color:'#fff',
              fontFamily:T.mono, fontSize:8, letterSpacing:'0.07em', cursor:'pointer',
            }}>+ Add Subject</button>
            {['Import Grades PDF','Export CSV'].map((label,i) => (
              <button key={label} style={{
                display:'flex', alignItems:'center', gap:6, padding:'7px 13px',
                border:`1px solid ${T.border}`, background:T.surface, color:T.ink3,
                fontFamily:T.mono, fontSize:8, letterSpacing:'0.07em', cursor:'pointer', transition:'border-color 0.12s',
              }}
                onMouseOver={e => e.currentTarget.style.borderColor = T.accent}
                onMouseOut={e => e.currentTarget.style.borderColor = T.border}
              >
                {i===0 && <svg width="10" height="11" viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="1.5" width="8" height="9" rx="0.8"/><path d="M3 4.5h4M3 6.5h4M3 8.5h2.5"/></svg>}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 4 stat cards */}
        <div style={{display:'grid', gridTemplateColumns:'240px 1fr 1fr 1fr', gap:12, marginBottom:12}}>

          {/* GPA ring */}
          <div style={{background:T.surface, padding:'16px 20px', display:'flex', alignItems:'center', gap:18, borderRadius:12}}>
            <div style={{position:'relative', flexShrink:0, width:72, height:72}}>
              <svg width={72} height={72} viewBox="-36 -36 72 72" style={{transform:'rotate(-90deg)'}}>
                <circle r={R} fill="none" stroke={T.border} strokeWidth={3.5}/>
                <circle r={R} fill="none" stroke={T.accent} strokeWidth={3.5}
                  strokeDasharray={`${(gpaNum/4)*circ} ${circ}`} strokeLinecap="round"/>
              </svg>
              <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16, color:T.ink, lineHeight:1}}>{gpaStr}</div>
                <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3}}>/ 4.0</div>
              </div>
            </div>
            <div>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:6}}>GPA This Term</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:19, color:T.ink, lineHeight:1.2, marginBottom:4}}>Ready to <em>track.</em></div>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3}}>Unweighted · Spring 2025</div>
            </div>
          </div>

          {/* Best performing */}
          <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>Best Performing</div>
            {bestPerf ? (<>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:5}}>
                <div style={{width:7, height:7, borderRadius:2, background:bestPerf.color}}/>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink, lineHeight:1}}>{bestPerf.short}</div>
              </div>
              <div style={{fontFamily:T.mono, fontSize:9.5, color:T.accent}}>{grades[bestPerf.id]}</div>
            </>) : <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3}}>Log a grade to see.</div>}
          </div>

          {/* Needs attention */}
          <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>Needs Attention</div>
            {needsAttn ? (<>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:5}}>
                <div style={{width:7, height:7, borderRadius:2, background:needsAttn.color}}/>
                <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink, lineHeight:1}}>{needsAttn.short}</div>
              </div>
              <div style={{fontFamily:T.mono, fontSize:9.5, color:'#bf4a30'}}>{grades[needsAttn.id]}</div>
            </>) : <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3}}>Log grades to compare.</div>}
          </div>

          {/* Total assignments */}
          <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
            <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10}}>Total Assignments</div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:38, color:T.ink, lineHeight:0.95, marginBottom:5}}>{totalHW}</div>
            <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3}}>Click a subject to start</div>
          </div>
        </div>

        {/* Table header */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 120px 72px 80px 100px', gap:8, padding:'7px 0 7px 16px', background:T.surface, borderBottom:`1px solid ${T.border}`}}>
          {['SUBJECT','TASKS','SCORE','GRADE','TARGET'].map((h,i) => (
            <div key={h} style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.11em', textAlign: i>0 ? 'center' : 'left'}}>{h}</div>
          ))}
        </div>

        {/* Subject rows */}
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {subjects.length === 0 && (
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16, color:T.ink3, padding:'20px 0'}}>No subjects yet — complete setup to add your classes.</div>
          )}
          {subjects.map(s => {
            const hw      = homework.filter(h => h.subj === s.id);
            const myGrade = grades[s.id] || '';
            const hasGrade = !!myGrade;
            return (
              <div key={s.id}
                style={{display:'grid', gridTemplateColumns:'1fr 120px 72px 80px 100px', gap:8, background:T.surface, alignItems:'center', cursor:'pointer', transition:'background 0.1s', borderRadius:8, borderLeft:`3px solid ${s.color}`}}
                onMouseOver={e => e.currentTarget.style.background = T.bl}
                onMouseOut={e => e.currentTarget.style.background = T.surface}
              >
                {/* Subject */}
                <div style={{padding:'13px 12px'}}>
                  <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16.5, color:T.ink, marginBottom:2}}>{s.name}</div>
                  <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{hw.length} assignments</div>
                </div>
                {/* Sparkline from grade history */}
                <div style={{display:'flex', justifyContent:'center', alignItems:'center', minHeight:18}}>
                  {(() => {
                    const pts = gradeSparklinePoints(gradeHistory, s.id);
                    if (!pts) return <span style={{fontFamily:T.mono, fontSize:8, color:T.ink3}}>—</span>;
                    return (
                      <svg width={108} height={18} viewBox="0 0 108 18" style={{overflow:'visible'}}>
                        <polyline points={pts} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    );
                  })()}
                </div>
                {/* GPA points */}
                <div style={{fontFamily:T.mono, fontSize:11, color:T.ink2, textAlign:'center'}}>{hasGrade ? (GPA_MAP[myGrade] ?? '—') : '—'}</div>
                {/* Grade badge */}
                <div style={{display:'flex', justifyContent:'center'}}>
                  <div style={{background: hasGrade ? `${s.color}18` : T.bl, border:`1px solid ${hasGrade ? s.color+'40' : T.border}`, padding:'3px 9px', fontFamily:T.mono, fontSize:10, color: hasGrade ? s.color : T.ink3, fontWeight:600}}>{myGrade || '—'}</div>
                </div>
                {/* Grade setter */}
                <div style={{display:'flex', justifyContent:'center'}} onClick={e => e.stopPropagation()}>
                  <select
                    value={myGrade}
                    onChange={e => setGrade(s.id, e.target.value)}
                    style={{background: hasGrade ? T.bl : T.accentSoft, border:`1px solid ${hasGrade ? T.border : T.accent}`, padding:'4px 8px', fontFamily:T.mono, fontSize:9, color: hasGrade ? T.ink3 : T.accent, cursor:'pointer', appearance:'none', textAlign:'center', width:66}}
                  >
                    <option value="">Set</option>
                    {GRADE_OPTS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{display:'flex', justifyContent:'space-between', padding:'7px 16px', background:T.surface, borderTop:`1px solid ${T.border}`}}>
          <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{subjects.length} subjects · select a grade in the SET column</div>
          <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.09em'}}>{graded.length} of {subjects.length} graded</div>
        </div>

        {/* Subject Balance Radar Chart */}
        {(() => {
          const radarSubjs = subjects.length > 0 ? subjects.slice(0, 8) : SUBJECTS.slice(0, 6);
          const n = radarSubjs.length;
          if (n < 3) return null;
          const CX = 120, CY2 = 120, RAD = 85;
          const levels = 4;
          const angleStep = (2 * Math.PI) / n;
          const pt = (i, r) => [CX + r * Math.sin(i * angleStep), CY2 - r * Math.cos(i * angleStep)];
          const gridLines = Array.from({length: levels}, (_, l) => {
            const r = RAD * (l + 1) / levels;
            return radarSubjs.map((_, i) => pt(i, r)).map(p => p.join(',')).join(' ');
          });
          const dataPoints = radarSubjs.map((s, i) => {
            const g = grades[s.id] ? (GPA_MAP[grades[s.id]] || 0) : 0;
            const r = (g / 4) * RAD;
            return pt(i, Math.max(r, 4));
          });
          const dataPath = dataPoints.map(p => p.join(',')).join(' ');
          return (
            <div style={{background:T.surface, borderRadius:12, padding:'20px 22px', marginTop:12}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4}}>
                <div style={{width:6, height:6, borderRadius:'50%', background:T.accent}}/>
                <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Subject Balance</div>
              </div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:18, color:T.ink, marginBottom:12}}>Subject balance</div>
              <div style={{display:'flex', justifyContent:'center'}}>
                <svg width={240} height={240} viewBox="0 0 240 240">
                  {gridLines.map((pts, l) => (
                    <polygon key={l} points={pts} fill="none" stroke={T.border} strokeWidth={0.8} opacity={0.6}/>
                  ))}
                  {radarSubjs.map((_, i) => {
                    const [x, y] = pt(i, RAD);
                    return <line key={i} x1={CX} y1={CY2} x2={x} y2={y} stroke={T.border} strokeWidth={0.5} opacity={0.4}/>;
                  })}
                  <polygon points={dataPath} fill={`${T.accent}25`} stroke={T.accent} strokeWidth={1.8} strokeLinejoin="round"/>
                  {dataPoints.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={T.accent}/>
                  ))}
                  {radarSubjs.map((s, i) => {
                    const [x, y] = pt(i, RAD + 16);
                    return (
                      <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central"
                        style={{fontFamily:T.mono, fontSize:8, fill:T.ink3, letterSpacing:'0.05em'}}>
                        {s.short || s.name.slice(0,8)}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>
          );
        })()}

        {/* Floating cards — Recent Scores · Grade Targets · Grade Insights */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginTop:12}}>
          <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:13}}>
              <div style={{width:6, height:6, borderRadius:'50%', background:T.accent}}/>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Recent Scores</div>
            </div>
            {recentScores.length === 0
              ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3}}>Set grades above to see top performers.</div>
              : recentScores.map((item,i) => (
                <div key={item.subj.id} style={{display:'flex', alignItems:'center', gap:9, padding:'6px 0', borderBottom: i < recentScores.length-1 ? `1px solid ${T.bl}` : 'none'}}>
                  <div style={{width:5, height:5, borderRadius:1, background:item.subj.color, flexShrink:0}}/>
                  <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.subj.short}</div>
                  <div style={{fontFamily:T.mono, fontSize:10, flexShrink:0, color: (GPA_MAP[item.grade]||0) >= 3.7 ? '#3a8a52' : (GPA_MAP[item.grade]||0) >= 3.0 ? T.ink3 : '#bf4a30'}}>{item.grade}</div>
                </div>
              ))}
          </div>
          <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:12}}>
              <div style={{width:6, height:6, borderRadius:'50%', background:'#3a8a52'}}/>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Grade Targets</div>
            </div>
            {subjects.length === 0 && <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:13, color:T.ink3}}>No subjects yet.</div>}
            {subjects.map(s => (
              <div key={s.id} style={{display:'flex', alignItems:'center', gap:8, padding:'4px 0'}}>
                <div style={{width:5, height:5, borderRadius:1, background:s.color, flexShrink:0}}/>
                <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink2, flex:1}}>{s.short}</div>
                <div style={{fontFamily:T.mono, fontSize:9, color: grades[s.id] ? T.ink3 : T.accent}}>{grades[s.id] || '—'}</div>
                <span style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, cursor:'pointer'}}>→</span>
              </div>
            ))}
          </div>
          <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <div style={{width:6, height:6, borderRadius:'50%', background:'#4285f4'}}/>
                <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Grade Insights</div>
              </div>
              <span style={{fontFamily:T.mono, fontSize:7.5, background:'rgba(66,133,244,0.1)', color:'#4285f4', padding:'2px 6px', letterSpacing:'0.07em'}}>AI</span>
            </div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3, lineHeight:1.7}}>Insights appear once you log your first grade.</div>
          </div>
        </div>
    </div>
  );
}

/* ── 8. Tools ───────────────────────────────────────────── */
function ToolsScreen({ userData, onUpdate }) {
  const [filter, setFilter] = useState('ALL');
  const cats = ['ALL','AI','DESIGN','PRODUCTIVITY'];
  const filtered = filter === 'ALL' ? TOOLS_DATA : TOOLS_DATA.filter(t => t.cat === filter);
  const toolOpens = userData?.toolOpens || [];
  const weekOpens = toolOpensThisWeek(toolOpens);
  const recentOpens = normalizeToolOpens(toolOpens);
  const lastOpen = recentOpens[0] || null;
  const lastTool = lastOpen ? toolById(lastOpen.toolId) : null;
  const counts = toolOpenCounts(toolOpens);
  const trackedTools = TOOLS_DATA
    .filter(t => counts[t.id] > 0)
    .map(t => ({ ...t, sessions: counts[t.id] }))
    .sort((a, b) => b.sessions - a.sessions);
  const maxSessions = trackedTools[0]?.sessions || 1;
  const usageInsight = buildToolUsageInsight(toolOpens);

  const openTool = (tool) => {
    if (tool?.id) onUpdate && onUpdate({ toolOpens: appendToolOpen(toolOpens, tool.id) });
    if (tool?.url) window.open(tool.url, '_blank', 'noopener,noreferrer');
  };

  const SUGGESTIONS = [
    { tool: TOOLS_DATA.find(t => t.id==='claude'),     priority:'TIP', msg:'Opens Claude in a new tab.', action:'Open' },
    { tool: TOOLS_DATA.find(t => t.id==='notebooklm'), priority:'TIP', msg:'Try NotebookLM for note-based study.', action:'Open' },
  ];

  const QUICK_LAUNCH = [
    { tool: TOOLS_DATA.find(t => t.id==='claude'),     label:'Ask Claude a question', sub:'Start new conversation', key:'⌘1' },
    { tool: TOOLS_DATA.find(t => t.id==='figma'),      label:'New Figma file',        sub:'Open design canvas',     key:'⌘2' },
    { tool: TOOLS_DATA.find(t => t.id==='notebooklm'), label:'Open NotebookLM',       sub:'Study from your notes',  key:'⌘3' },
    { tool: TOOLS_DATA.find(t => t.id==='notion'),     label:'New Notion page',       sub:'Capture & organise',     key:'⌘4' },
  ];

  const ToolIcon = ({ tool, size=28 }) => (
    <div style={{width:size, height:size, borderRadius:Math.round(size*0.2), background:`${tool.color}18`, border:`1px solid ${tool.color}38`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
      <span style={{fontFamily:T.mono, fontSize:size*0.38, color:tool.color, fontWeight:600}}>{tool.name[0]}</span>
    </div>
  );

  return (
    <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'36px 40px 36px 56px'}}>

        {/* Header */}
        <div style={{marginBottom:28}}>
          <h1 style={{margin:'0 0 5px', lineHeight:1.15, fontSize:26}}>
            <span style={{fontFamily:T.ui, fontWeight:600, color:T.ink}}>Your </span>
            <span style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:28, color:T.ink}}>command center.</span>
          </h1>
          <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, letterSpacing:'0.1em'}}>{TOOLS_DATA.length} tools · click to open in a new tab</div>
        </div>

        {/* Stat cards */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:12}}>
          {[
            { label:'THIS WEEK',   val:String(weekOpens),                    sub: weekOpens === 1 ? 'open this week' : 'opens this week' },
            { label:'TOOLS',       val:String(TOOLS_DATA.length),            sub:'available to open' },
            { label:'CATEGORIES',  val:'3',                                  sub:'AI · design · productivity' },
            { label:'LAST OPENED', val:lastTool?.name || '—',                sub: lastOpen ? formatToolWhen(lastOpen.at) : 'Open a tool to start' },
          ].map(c => (
            <div key={c.label} style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:8}}>{c.label}</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:24, color:T.ink, lineHeight:1.1, marginBottom:4}}>{c.val}</div>
              <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3}}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Middle row */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 0.58fr 0.42fr', gap:12, marginBottom:12, background:'transparent'}}>

          {/* Intelligent suggestions */}
          <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
            <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:14}}>
              <div style={{width:6, height:6, borderRadius:'50%', background:'#3a8a52', flexShrink:0}} />
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', flex:1}}>Intelligent Suggestions</div>
              <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3}}>{SUGGESTIONS.length} active</div>
            </div>
            {SUGGESTIONS.map((sg,i) => (
              <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'11px 0', borderBottom: i < SUGGESTIONS.length-1 ? `1px solid ${T.bl}` : 'none'}}>
                <ToolIcon tool={sg.tool} size={26} />
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                    <span style={{fontFamily:T.ui, fontSize:12, color:T.ink, fontWeight:500}}>{sg.tool.name}</span>
                    <span style={{fontFamily:T.mono, fontSize:7, padding:'1px 5px', background: sg.priority==='HIGH' ? 'rgba(191,74,48,0.1)' : T.bl, color: sg.priority==='HIGH' ? '#bf4a30' : T.ink3, letterSpacing:'0.07em'}}>{sg.priority}</span>
                  </div>
                  <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink3}}>{sg.msg}</div>
                </div>
                <button type="button" onClick={() => openTool(sg.tool)} style={{fontFamily:T.mono, fontSize:9, color:T.accent, background:'none', border:'none', padding:0, flexShrink:0, cursor:'pointer'}}>{sg.action} →</button>
              </div>
            ))}
          </div>

          {/* Usage breakdown */}
          <div style={{background:T.surface, padding:'16px 20px', borderRadius:12}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Usage Breakdown</div>
              <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3}}>All time</div>
            </div>
            {trackedTools.length === 0
              ? <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:14, color:T.ink3, lineHeight:1.6}}>Open a tool to start tracking.</div>
              : trackedTools.map(tool => (
              <div key={tool.id} style={{marginBottom:11}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5}}>
                  <div style={{display:'flex', alignItems:'center', gap:7}}>
                    <div style={{width:6, height:6, borderRadius:'50%', background:tool.color}} />
                    <span style={{fontFamily:T.ui, fontSize:12, color:T.ink}}>{tool.name}</span>
                  </div>
                  <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3}}>{tool.sessions}</div>
                </div>
                <div style={{height:2, background:T.bl, borderRadius:1, overflow:'hidden'}}>
                  <div style={{width:`${(tool.sessions / maxSessions) * 100}%`, height:'100%', background:tool.color, opacity:0.65}} />
                </div>
              </div>
            ))}
          </div>

          {/* Usage insight */}
          <div style={{background:T.surface, padding:'16px 20px', display:'flex', flexDirection:'column', borderRadius:12}}>
            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:12}}>
              <span style={{color:T.accent, fontSize:11, lineHeight:1}}>★</span>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Usage Insight</div>
            </div>
            <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:15, color:T.ink3, lineHeight:1.65}}>{usageInsight || 'Open tools from this page to generate insights.'}</div>
          </div>
        </div>

        {/* Bottom: filter + table + side cards */}
        <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>

          {/* Left: filter tabs + touching tool list */}
          <div style={{flex:1, minWidth:0}}>
            {/* Filter tabs */}
            <div style={{display:'flex', gap:6, marginBottom:12}}>
              {cats.map(c => {
                const count = c === 'ALL' ? TOOLS_DATA.length : TOOLS_DATA.filter(t => t.cat===c).length;
                const act = filter === c;
                return (
                  <button key={c} onClick={() => setFilter(c)} style={{
                    padding:'7px 18px', borderRadius:20,
                    border: act ? `1.5px solid ${T.accent}` : '1.5px solid transparent',
                    background: act ? T.accentSoft : T.bl,
                    color: act ? T.accent : T.ink3,
                    fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.09em',
                    cursor:'pointer', transition:'all 0.12s', whiteSpace:'nowrap',
                  }}>
                    {c} <span style={{opacity:0.55}}>{count}</span>
                  </button>
                );
              })}
              <div style={{flex:1, background:T.surface, display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'0 14px'}}>
                <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3}}>{filtered.length} tools</div>
              </div>
            </div>

            {/* Table header */}
            <div style={{display:'grid', gridTemplateColumns:'1fr', gap:10, padding:'7px 14px', background:T.surface, borderRadius:'12px 12px 0 0', borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em'}}>Tool</div>
            </div>

            {/* Tool rows — touching */}
            <div style={{display:'flex', flexDirection:'column', background:T.surface, borderRadius:'0 0 12px 12px', overflow:'hidden'}}>
              {filtered.map((tool, idx) => (
                <div key={tool.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTool(tool); } }}
                  onClick={() => openTool(tool)}
                  style={{display:'flex', alignItems:'center', gap:11, padding:'11px 14px', background:T.surface, cursor:'pointer', transition:'background 0.1s', borderBottom: idx < filtered.length-1 ? `1px solid ${T.bl}` : 'none'}}
                  onMouseOver={e => e.currentTarget.style.background = T.bl}
                  onMouseOut={e => e.currentTarget.style.background = T.surface}
                >
                  <ToolIcon tool={tool} size={26} />
                  <div style={{minWidth:0, flex:1}}>
                    <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                      <span style={{fontFamily:T.ui, fontSize:13, color:T.ink, fontWeight:500}}>{tool.name}</span>
                      <span style={{fontFamily:T.mono, fontSize:7, padding:'1.5px 5px', background:T.bl, color:T.ink3, letterSpacing:'0.07em'}}>{tool.cat}</span>
                    </div>
                    <div style={{fontFamily:T.ui, fontSize:11, color:T.ink3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{tool.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: floating side cards */}
          <div style={{width:216, display:'flex', flexDirection:'column', justifyContent:'space-between', flexShrink:0, alignSelf:'stretch'}}>

            {/* Quick Launch */}
            <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
                <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em'}}>Quick Launch</div>
                <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3}}>⌘1-4</div>
              </div>
              {QUICK_LAUNCH.map((ql,i) => (
                <button key={i} type="button" onClick={() => openTool(ql.tool)}
                  style={{display:'flex', alignItems:'center', gap:9, padding:'8px 0', borderBottom: i < QUICK_LAUNCH.length-1 ? `1px solid ${T.bl}` : 'none', cursor:'pointer', width:'100%', background:'none', borderLeft:'none', borderRight:'none', borderTop:'none', textAlign:'left'}}
                  onMouseOver={e => e.currentTarget.style.background = T.bl}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ToolIcon tool={ql.tool} size={22} />
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:1}}>{ql.label}</div>
                    <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3}}>{ql.sub}</div>
                  </div>
                  <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, flexShrink:0}}>{ql.key}</div>
                </button>
              ))}
              <div style={{marginTop:10, paddingTop:9, borderTop:`1px solid ${T.bl}`, display:'flex', justifyContent:'space-between'}}>
                <span style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, cursor:'pointer'}}>Browse all tools</span>
                <span style={{fontFamily:T.mono, fontSize:8, color:T.ink3, opacity:0.5}}>⌘5</span>
              </div>
            </div>

            {/* Activity */}
            <div style={{background:T.surface, borderRadius:12, padding:'18px 20px'}}>
              <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.13em', marginBottom:12}}>Activity</div>
              {recentOpens.length === 0
                ? <div style={{fontFamily:T.ui, fontSize:12, color:T.ink3, lineHeight:1.7}}>No activity yet. Open a tool to start tracking.</div>
                : recentOpens.slice(0, 5).map((entry, i, arr) => {
                  const tool = toolById(entry.toolId);
                  if (!tool) return null;
                  return (
                    <div key={entry.id} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.bl}` : 'none'}}>
                      <div style={{width:5, height:5, borderRadius:1, background:tool.color, flexShrink:0}} />
                      <div style={{fontFamily:T.ui, fontSize:11.5, color:T.ink2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{tool.name}</div>
                      <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, flexShrink:0}}>{formatToolWhen(entry.at)}</div>
                    </div>
                  );
                })}
            </div>

          </div>
        </div>
    </div>
  );
}

/* ── 9. Subjects ────────────────────────────────────────── */
function SubjectsScreen({ profile, userData }) {
  const subjects = profile?.subjects || [];
  const homework = userData?.homework || [];
  const quizzes  = userData?.quizzes  || [];
  const grades   = userData?.grades   || {};
  const gradeHistory = userData?.gradeHistory || [];
  return (
    <div className="screen-enter" style={{flex:1, overflowY:'auto', padding:'56px 72px'}}>
      <PageHeader eyebrow={`${subjects.length} subjects`} title="Subjects" />
      <Hr />
      {subjects.length === 0 ? (
        <div style={{background:T.surface, padding:'40px 32px', borderRadius:12, textAlign:'center'}}>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink, marginBottom:8}}>No subjects yet.</div>
          <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink3, lineHeight:1.6}}>Add classes from the sidebar + button or Settings → Manage Subjects.</div>
        </div>
      ) : (
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:12}}>
        {subjects.map(s => {
          const hw = homework.filter(h => h.subj === s.id && !h.done);
          const qz = quizzes.filter(q => q.subj === s.id);
          const myGrade = grades[s.id] || s.grade || '—';
          const sparkPts = gradeSparklinePoints(gradeHistory, s.id, 140, 28);
          return (
            <div key={s.id} style={{background:T.surface, padding:'26px 28px'}}>
              <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:18}}>
                <div>
                  <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:7}}>
                    <div style={{width:7, height:7, borderRadius:2, background:s.color}} />
                    <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, letterSpacing:'0.12em', textTransform:'uppercase'}}>{s.id}</div>
                  </div>
                  <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color:T.ink, lineHeight:1.2}}>{s.name}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:36, color:T.accent, lineHeight:0.92, letterSpacing:'-0.02em'}}>{myGrade}</div>
                  <div style={{fontFamily:T.mono, fontSize:8.5, color:T.ink3, marginTop:4}}>{GPA_MAP[myGrade] != null ? GPA_MAP[myGrade].toFixed(1) + ' GPA' : '—'}</div>
                </div>
              </div>
              <div style={{height:2, background:T.border, marginBottom: sparkPts ? 14 : 16, borderRadius:1, overflow:'hidden'}}>
                <div style={{width:`${Math.min(((GPA_MAP[myGrade]||0)/4)*100, 100)}%`, height:'100%', background:s.color, borderRadius:1}} />
              </div>
              {sparkPts && (
                <div style={{marginBottom:16}}>
                  <svg width="100%" height={28} viewBox="0 0 140 28" preserveAspectRatio="none" style={{display:'block'}}>
                    <polyline points={sparkPts} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              <div style={{display:'flex', gap:14, borderTop:`1px solid ${T.bl}`, paddingTop:14}}>
                {[['GPA', GPA_MAP[myGrade] != null ? GPA_MAP[myGrade].toFixed(1) : '—', false], ['HW open', hw.length, hw.length > 0], ['Quizzes', qz.length, false]].map(([label, val, warn]) => (
                  <div key={label}>
                    <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:3}}>{label}</div>
                    <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:20, color: warn ? T.accent : T.ink}}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}
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

  const handleGoogleSignIn = () => {
    if (!window.google?.accounts?.oauth2) { setGLoading(false); return; }
    setGLoading(true);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid profile email',
      callback: async (resp) => {
        if (resp.error) { setGLoading(false); return; }
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
        } catch(e) {}
        setGLoading(false);
      },
    });
    client.requestAccessToken({ prompt: '' });
  };

  const doSignIn = () => {
    if (!googleUser) return;
    onSignIn({ name: googleUser.name, email: googleUser.email, picture: googleUser.picture,
      grade: grade || 'junior', school:'', subjects:[], completedAt: Date.now() });
  };

  const FEATURES = [
    { ic:'◷', label:'Homework',   desc:'Every assignment tracked — urgency flags, due dates, and kanban board.' },
    { ic:'◈', label:'Notes',      desc:'A full knowledge base. Search by subject, tag, or keyword instantly.' },
    { ic:'⊟', label:'Flashcards', desc:'Study decks tied to your notes with spaced repetition built in.' },
    { ic:'◉', label:'Schedule',   desc:'Daily and weekly view. See what\'s in session and what\'s due next.' },
    { ic:'☆', label:'Grades',     desc:'Letter grades, GPA ring, and sparkline trends across the term.' },
    { ic:'✦', label:'AI Tools',   desc:'Study guides, flashcard generation, and knowledge gap analysis.' },
  ];

  const WORD = 'Scholar.';

  return (
    <div onMouseMove={e => setMouse({x:e.clientX, y:e.clientY})}
      style={{position:'fixed', inset:0, zIndex:900, background:T.bg, fontFamily:T.ui, overflowY:'auto', overflowX:'hidden'}}>
      <style>{`
        @keyframes shq-letter { from{opacity:0;transform:translateY(10px) skewX(-3deg)} to{opacity:1;transform:none} }
        @keyframes shq-up     { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes shq-drawh  { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes shq-drawv  { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        .shq-primary { transition:transform 0.18s ease,box-shadow 0.18s ease; }
        .shq-primary:hover { transform:translateY(-2px); box-shadow:0 8px 24px -6px rgba(184,148,58,0.38); }
        .shq-ghost { transition:transform 0.18s ease; }
        .shq-ghost:hover { transform:translateY(-2px); }
        .shq-feat { transition:transform 0.2s ease,box-shadow 0.2s ease,border-color 0.2s ease; cursor:default; }
        .shq-feat:hover { transform:translateY(-3px); box-shadow:0 10px 28px -10px rgba(24,21,14,0.12); border-color:${T.accent} !important; }
        .shq-input { transition:border-color 0.12s; }
        .shq-input:focus { outline:none; border-color:${T.accent} !important; }
      `}</style>

      {/* Cursor spotlight */}
      <div style={{position:'fixed', inset:0, pointerEvents:'none', zIndex:1,
        background:`radial-gradient(380px circle at ${mouse.x}px ${mouse.y}px,rgba(184,148,58,0.07) 0%,transparent 70%)`,
        transition:'background 0.12s ease'}} />

      {/* ── Hero ── */}
      <div style={{position:'relative', height:'100vh', minHeight:580}}>
        {/* Double hairline frame */}
        {[44,52].map((ins,fi) => (
          <div key={fi} style={{position:'absolute', inset:ins, pointerEvents:'none', overflow:'hidden'}}>
            <div style={{position:'absolute', top:0, left:0, right:0, height:1, background:T.border, transformOrigin:'left',   animation:`shq-drawh ${0.55+fi*0.08}s ${0.18+fi*0.08}s ease both`}} />
            <div style={{position:'absolute', bottom:0, left:0, right:0, height:1, background:T.border, transformOrigin:'right',  animation:`shq-drawh ${0.55+fi*0.08}s ${0.34+fi*0.08}s ease both`}} />
            <div style={{position:'absolute', top:0, bottom:0, left:0, width:1,   background:T.border, transformOrigin:'top',    animation:`shq-drawv ${0.55+fi*0.08}s ${0.26+fi*0.08}s ease both`}} />
            <div style={{position:'absolute', top:0, bottom:0, right:0, width:1,  background:T.border, transformOrigin:'bottom', animation:`shq-drawv ${0.55+fi*0.08}s ${0.42+fi*0.08}s ease both`}} />
          </div>
        ))}

        {/* Vol. corner */}
        <div style={{position:'absolute', top:72, right:80, fontFamily:T.mono, fontSize:9.5, letterSpacing:'0.22em', textTransform:'uppercase', color:T.ink3, animation:'shq-up 0.5s 0.9s both'}}>
          Vol. I · MMXXVI
        </div>

        {/* Eyebrow */}
        <div style={{position:'absolute', top:96, left:0, right:0, textAlign:'center', fontFamily:T.mono, fontSize:10, letterSpacing:'0.3em', textTransform:'uppercase', color:T.ink3, animation:'shq-up 0.5s 0.28s both'}}>
          — A Student Dashboard —
        </div>

        {/* Center */}
        <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 32px'}}>
          {/* Letter-reveal wordmark */}
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontWeight:400, fontSize:'clamp(82px,14vw,200px)', lineHeight:0.9, color:T.ink, letterSpacing:'-0.02em', display:'flex'}}>
            {WORD.split('').map((ch,i) => (
              <span key={i} style={{display:'inline-block', animation:`shq-letter 0.5s ${0.48+i*0.055}s cubic-bezier(0.2,0.8,0.2,1) both`}}>{ch}</span>
            ))}
          </div>

          {/* Tagline */}
          <div style={{marginTop:22, fontFamily:T.serif, fontStyle:'italic', fontSize:17, color:T.ink2, textAlign:'center', animation:'shq-up 0.6s 1.1s both'}}>
            A second brain for serious students.
          </div>

          {/* Rules */}
          <div style={{marginTop:26, display:'flex', alignItems:'center', gap:20, fontFamily:T.mono, fontSize:10, letterSpacing:'0.2em', textTransform:'uppercase', color:T.ink3, animation:'shq-up 0.6s 1.22s both'}}>
            <span style={{width:52, height:1, background:T.border, display:'block'}} />
            Anno MMXXVI
            <span style={{width:52, height:1, background:T.border, display:'block'}} />
          </div>

          {/* CTAs */}
          <div style={{marginTop:42, display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center', animation:'shq-up 0.6s 1.38s both'}}>
            <button className="shq-primary" onClick={() => setOverlay(true)} style={{
              display:'flex', alignItems:'center', gap:10, padding:'14px 26px',
              border:`1px solid ${T.accent}`, background:T.accent,
              fontFamily:T.ui, fontSize:14, color:T.surface, fontWeight:500, cursor:'pointer', borderRadius:2,
            }}>
              <GoogleG size={16} /> Sign in with Google
            </button>
            <button className="shq-ghost" onClick={onSetup} style={{
              padding:'14px 26px', border:`1px solid ${T.ink}`, background:'transparent',
              fontFamily:T.ui, fontSize:14, color:T.ink, cursor:'pointer', borderRadius:2,
            }}>
              Open fresh notebook →
            </button>
          </div>

          {/* Scroll hint */}
          <div style={{marginTop:42, fontFamily:T.mono, fontSize:9.5, letterSpacing:'0.18em', textTransform:'uppercase', color:T.ink3, display:'flex', flexDirection:'column', alignItems:'center', gap:5, animation:'shq-up 0.6s 1.65s both'}}>
            <span>What's inside</span>
            <span style={{fontSize:14}}>↓</span>
          </div>
        </div>

        {/* Colophon */}
        <div style={{position:'absolute', bottom:70, left:0, right:0, textAlign:'center', fontFamily:T.mono, fontSize:9.5, letterSpacing:'0.18em', textTransform:'uppercase', color:T.ink3, animation:'shq-up 0.5s 1.5s both'}}>
          2026 School Year · built for one reader
        </div>
      </div>

      {/* ── Feature showcase ── */}
      <div style={{borderTop:`1px solid ${T.border}`, padding:'68px min(68px,8vw) 84px', background:T.bg}}>
        <div style={{textAlign:'center', marginBottom:50}}>
          <div style={{fontFamily:T.mono, fontSize:9.5, letterSpacing:'0.28em', textTransform:'uppercase', color:T.ink3, marginBottom:14}}>Everything you need</div>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:'clamp(32px,4.8vw,50px)', lineHeight:1.05, color:T.ink, letterSpacing:'-0.02em'}}>
            One dashboard for every class.
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:14, maxWidth:1060, margin:'0 auto'}}>
          {FEATURES.map(f => (
            <div key={f.label} className="shq-feat" style={{padding:'22px 24px 20px', border:`1px solid ${T.border}`, borderRadius:12, background:T.surface}}>
              <div style={{fontFamily:T.serif, fontSize:20, color:T.accent, marginBottom:9, lineHeight:1}}>{f.ic}</div>
              <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:17, color:T.ink, marginBottom:6}}>{f.label}</div>
              <div style={{fontFamily:T.ui, fontSize:12.5, color:T.ink3, lineHeight:1.65}}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div style={{textAlign:'center', marginTop:60}}>
          <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:16, color:T.ink2, marginBottom:18}}>Ready to begin?</div>
          <div style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap'}}>
            <button className="shq-primary" onClick={() => setOverlay(true)} style={{
              display:'flex', alignItems:'center', gap:10, padding:'13px 24px',
              border:`1px solid ${T.accent}`, background:T.accent,
              fontFamily:T.ui, fontSize:14, color:T.surface, fontWeight:500, cursor:'pointer', borderRadius:2,
            }}>
              <GoogleG size={15} /> Sign in with Google
            </button>
            <button className="shq-ghost" onClick={onSetup} style={{
              padding:'13px 24px', border:`1px solid ${T.ink}`, background:'transparent',
              fontFamily:T.ui, fontSize:14, color:T.ink, cursor:'pointer', borderRadius:2,
            }}>
              Open fresh notebook →
            </button>
          </div>
        </div>

        <div style={{marginTop:60, textAlign:'center', fontFamily:T.mono, fontSize:9.5, letterSpacing:'0.18em', textTransform:'uppercase', color:T.ink3}}>
          — Scholar · Vol. I · Anno MMXXVI —
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
                <div style={{fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.16em', textTransform:'uppercase', color:T.ink3, marginBottom:3}}>Scholar</div>
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

                <div style={{textAlign:'center', marginTop:20}}>
                  <button onClick={() => { setOverlay(false); onSetup(); }} style={{background:'none', border:'none', fontFamily:T.mono, fontSize:9, color:T.ink3, cursor:'pointer', letterSpacing:'0.08em'}}>
                    New user? Set up a full profile →
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Confirmed Google account */}
                <div style={{display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:T.bg, borderRadius:8, marginBottom:22}}>
                  {googleUser.picture
                    ? <img src={googleUser.picture} alt="" style={{width:36, height:36, borderRadius:'50%', flexShrink:0}} />
                    : <div style={{width:36, height:36, borderRadius:'50%', background:T.accentSoft, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                        <span style={{fontFamily:T.serif, fontStyle:'italic', fontSize:17, color:T.accent}}>{googleUser.name[0]}</span>
                      </div>
                  }
                  <div>
                    <div style={{fontFamily:T.ui, fontSize:13, fontWeight:500, color:T.ink}}>{googleUser.name}</div>
                    <div style={{fontFamily:T.mono, fontSize:9, color:T.ink3, marginTop:2}}>{googleUser.email}</div>
                  </div>
                </div>

                {/* Grade (optional) */}
                <div style={{marginBottom:26}}>
                  <div style={{fontFamily:T.mono, fontSize:8, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:8}}>
                    Year <span style={{opacity:0.45}}>— optional</span>
                  </div>
                  <div style={{display:'flex', gap:7}}>
                    {[['freshman','Fr.'],['sophomore','So.'],['junior','Jr.'],['senior','Sr.']].map(([k,l]) => (
                      <button key={k} onClick={() => setGrade(g => g===k ? '' : k)} style={{
                        flex:1, padding:'9px 0', borderRadius:6, cursor:'pointer',
                        border: grade===k ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                        background: grade===k ? T.accentSoft : T.bg,
                        color: grade===k ? T.accent : T.ink3,
                        fontFamily:T.mono, fontSize:8.5, transition:'all 0.12s',
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

  const FEATURES = [
    { ic:'✦', label:'Track homework', desc:'Kanban board with due dates and priorities' },
    { ic:'◈', label:'Monitor grades', desc:'Live GPA calculator across all subjects' },
    { ic:'⊞', label:'Study smarter', desc:'Flashcards, quizzes, and spaced repetition' },
  ];

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
                  <span style={{fontFamily:T.ui, fontSize:9, color:T.ink2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.name}</span>
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
      <div style={{fontFamily:T.mono, fontSize:7, color:T.ink3, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:8}}>What you'll unlock</div>
      <div style={{display:'flex', flexDirection:'column', gap:1}}>
        {UNLOCK_ITEMS.map((item, i) => {
          const done = item.check();
          const current = step === item.step && !done;
          return (
            <div key={i} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0', transition:'opacity 0.3s', opacity: done ? 1 : current ? 0.7 : 0.35}}>
              <div style={{width:16, height:16, borderRadius:4, border: done ? 'none' : `1.5px solid ${current ? T.accent+'60' : T.border}`, background: done ? T.accent : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.3s'}}>
                {done && <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6l2.5 2.5 5-5"/></svg>}
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:T.ui, fontSize:10.5, color: done ? T.ink : T.ink2, fontWeight: done ? 500 : 400}}>{item.label}</div>
                <div style={{fontFamily:T.mono, fontSize:7, color:T.ink3}}>{item.desc}</div>
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
                    : <span style={{fontFamily:T.mono, fontSize:8, color: active ? T.accent : T.ink3}}>{s}</span>
                  }
                </div>
                <span style={{fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.12em', textTransform:'uppercase', color: active ? T.accent : done ? T.ink2 : T.ink3, fontWeight: active ? 500 : 400}}>{label}</span>
              </div>
              {s < 3 && <div style={{flex:1, height:1, background: done ? T.accent : T.border, margin:'0 16px', transition:'background 0.3s'}} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Two-column body */}
      <div style={{flex:1, minHeight:0, display:'flex', overflow:'hidden'}}>

        {/* Left — form */}
        <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflowY:'auto', padding:'80px 48px 40px', position:'relative', backgroundImage:`radial-gradient(${T.border} 1px, transparent 1px)`, backgroundSize:'20px 20px', backgroundPosition:'10px 10px'}}>



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
                  <div style={{fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:10}}>What's your name?</div>
                  <input autoFocus className="shq-ob-input" value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && canNext1) goNext(); }}
                    placeholder="e.g. Julian" style={inputStyle}
                    onFocus={e => e.target.style.borderColor=T.accent}
                    onBlur={e => e.target.style.borderColor=T.border} />
                </div>
                <div style={{marginBottom:36}}>
                  <div style={{fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:10}}>What year are you in?</div>
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

                {/* Ornamental rule */}
                <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:28}}>
                  <div style={{flex:1, height:1, background:T.border}} />
                  <div style={{width:4, height:4, borderRadius:'50%', background:T.accent, opacity:0.5}} />
                  <div style={{flex:1, height:1, background:T.border}} />
                </div>

                {/* Feature preview cards */}
                <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12}}>
                  {FEATURES.map(f => (
                    <div key={f.label} style={{padding:'18px 16px', border:`1px solid ${T.border}`, background:T.bg, borderRadius:8}}>
                      <div style={{fontSize:18, marginBottom:10, lineHeight:1}}>{f.ic}</div>
                      <div style={{fontFamily:T.ui, fontSize:12, fontWeight:500, color:T.ink, marginBottom:5}}>{f.label}</div>
                      <div style={{fontFamily:T.mono, fontSize:8, color:T.ink3, lineHeight:1.5, letterSpacing:'0.02em'}}>{f.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Pull quote */}
                <div style={{marginTop:28, padding:'20px 0', borderTop:`1px solid ${T.border}`}}>
                  <div style={{fontFamily:T.serif, fontStyle:'italic', fontSize:18, color:T.ink3, lineHeight:1.6, textAlign:'center', letterSpacing:'-0.01em'}}>
                    "A place for every assignment, every grade, every goal."
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
                  <div style={{fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:10}}>School name</div>
                  <input autoFocus className="shq-ob-input" value={school} onChange={e => setSchool(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && canNext2) goNext(); }}
                    placeholder="e.g. Lincoln High School" style={inputStyle}
                    onFocus={e => e.target.style.borderColor=T.accent}
                    onBlur={e => e.target.style.borderColor=T.border} />
                </div>
                <div style={{marginBottom:36}}>
                  <div style={{fontFamily:T.mono, fontSize:8.5, letterSpacing:'0.14em', textTransform:'uppercase', color:T.ink3, marginBottom:10}}>When does your school year start?</div>
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
                  <div style={{fontFamily:T.mono, fontSize:7.5, letterSpacing:'0.16em', textTransform:'uppercase', color:T.ink3, marginBottom:14}}>Your semester at a glance</div>
                  <div style={{display:'flex', gap:3, marginBottom:10}}>
                    {Array.from({length:5}, (_,i) => {
                      const m = (startM + i) % 12;
                      return (
                        <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                          <div style={{width:'100%', height:28, borderRadius:5, background: i===0 ? `linear-gradient(135deg, ${T.accent}18, ${T.accent}30)` : T.bg, border:`1px solid ${i===0 ? T.accent+'40' : T.border}`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                            {i===0 && <div style={{width:6, height:6, borderRadius:'50%', background:T.accent}} />}
                          </div>
                          <span style={{fontFamily:T.mono, fontSize:7, color: i===0 ? T.accent : T.ink3, letterSpacing:'0.08em', textTransform:'uppercase'}}>{MONTHS[m].slice(0,3)}</span>
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
                        <div style={{fontFamily:T.mono, fontSize:7.5, color:T.ink3, lineHeight:1.5, letterSpacing:'0.02em'}}>{item.desc}</div>
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
        <div style={{width:420, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderLeft:`1px solid ${T.border}`, padding:'32px 36px', gap:20, position:'relative', background:`linear-gradient(180deg, ${T.surface} 0%, ${T.bg} 100%)`}}>
          <DashboardPreview />
          <UnlockChecklist />
        </div>
      </div>

      {/* Footer */}
      <div style={{display:'flex', alignItems:'center', padding:'18px 48px', flexShrink:0, borderTop:`1px solid ${T.border}`, position:'relative'}}>
        <button onClick={goBack} style={{background:'none', border:'none', padding:0, cursor:'pointer', fontSize:13.5, color:T.ink3, fontFamily:T.ui}}>← Back</button>
        <span style={{position:'absolute', left:'50%', transform:'translateX(-50%)', fontFamily:T.mono, fontSize:9.5, letterSpacing:'0.22em', color:T.ink3, textTransform:'uppercase'}}>ANNO MMXXVI</span>
        <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:28}}>
          <span style={{fontFamily:T.mono, fontSize:9, letterSpacing:'0.16em', color:T.ink3, textTransform:'uppercase'}}>Printed for one reader</span>
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
};

function App() {
  const [profile, setProfile]   = useState(() => loadProfile());
  const [inSetup, setInSetup]   = useState(false);
  const [screen, setScreen]     = useState('today');
  const [key, setKey]           = useState(0);
  const [userData, setUserData] = useState(() => {
    const p = loadProfile();
    return p ? (loadUserData(p.email) || defaultUserData()) : defaultUserData();
  });

  const nav = (s) => { setScreen(s); setKey(k => k+1); };
  const Screen = SCREENS[screen] || TodayScreen;

  const updateUserData = (update) => {
    setUserData(prev => {
      const next = normalizeUserData({ ...prev, ...update, updatedAt: Date.now() });
      if (profile?.email) {
        saveUserData(profile.email, next);
        saveServerUserData(next); // best-effort cloud save so work follows the user
      }
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
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(p),
    }).catch(() => {});

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
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setUserData(defaultUserData());
    setInSetup(false);
    setScreen('today');
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
      <Sidebar screen={screen} onNav={nav} profile={profile} userData={userData} onSignOut={handleSignOut} onAddSubject={subj => {
        const updated = { ...profile, subjects: [...(profile.subjects||[]), subj] };
        saveProfile(updated);
        setProfile(updated);
        setKey(k => k+1);
      }} onUpdateProfile={p => {
        saveProfile(p);
        setProfile(p);
        setKey(k => k+1);
      }} />
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        <Screen key={key} profile={profile} userData={userData} onUpdate={updateUserData} />
      </div>
      <SyncBadge onReconnect={reconnectCloud} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
