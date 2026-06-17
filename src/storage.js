const GOOGLE_CLIENT_ID = '262784487938-jek8tem7bheq8ms983j338p2s34ip3rc.apps.googleusercontent.com';
// Holds the current Google access token so the server can verify who we are
// on every profile read/write. Set right after Google sign-in.
let googleAccessToken = null;
const authHeaders = () => googleAccessToken ? { Authorization: 'Bearer ' + googleAccessToken } : {};
const PROFILE_KEY = 'shq-v2-profile';
const PROFILE_BY_EMAIL = (email) => 'shq-v2-profile-' + (email || 'anon');
const loadProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; } };
const loadProfileByEmail = (email) => { try { return JSON.parse(localStorage.getItem(PROFILE_BY_EMAIL(email)) || 'null'); } catch { return null; } };
const saveProfile = (p) => { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); if (p?.email) localStorage.setItem(PROFILE_BY_EMAIL(p.email), JSON.stringify(p)); };

const USER_DATA_KEY = (email) => 'shq-v2-data-' + (email || 'anon');
const loadUserData  = (email) => { try { return JSON.parse(localStorage.getItem(USER_DATA_KEY(email)) || 'null'); } catch { return null; } };
const saveUserData  = (email, data) => localStorage.setItem(USER_DATA_KEY(email), JSON.stringify(data));
const defaultUserData = () => ({ homework: [], grades: {}, streak: 0, quizzes: [], notes: [], schedule: [], flashcards: [], updatedAt: 0 });
const setGoogleAccessToken = (t) => { googleAccessToken = t; };

// Visible cloud-sync status so the user can see whether their work is saving.
// States: 'idle' | 'saving' | 'synced' | 'error' | 'offline'
let syncStatus = 'idle';
let syncHideTimer = null;
const syncListeners = new Set();
const getSyncStatus = () => syncStatus;
const onSyncStatus = (fn) => { syncListeners.add(fn); return () => syncListeners.delete(fn); };
const setSyncStatus = (s) => {
  syncStatus = s;
  syncListeners.forEach(fn => { try { fn(s); } catch (e) {} });
  if (syncHideTimer) { clearTimeout(syncHideTimer); syncHideTimer = null; }
  if (s === 'synced') {
    syncHideTimer = setTimeout(() => {
      syncStatus = 'idle';
      syncListeners.forEach(fn => { try { fn('idle'); } catch (e) {} });
    }, 2500);
  }
};

// Cloud sync for the user's work (homework, notes, etc.). The server verifies
// the Google token and scopes every read/write to the signed-in user.
const fetchServerUserData = () =>
  fetch('/api/data', { headers: authHeaders() })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);
const saveServerUserData = (data) => {
  if (!googleAccessToken) { setSyncStatus('offline'); return Promise.resolve(); }
  setSyncStatus('saving');
  return fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  })
    .then(r => { setSyncStatus(r.ok ? 'synced' : 'error'); return r; })
    .catch(() => { setSyncStatus('error'); });
};

export { GOOGLE_CLIENT_ID, authHeaders, setGoogleAccessToken, PROFILE_KEY, loadProfile, loadProfileByEmail, saveProfile, loadUserData, saveUserData, defaultUserData, fetchServerUserData, saveServerUserData, getSyncStatus, onSyncStatus, setSyncStatus };
