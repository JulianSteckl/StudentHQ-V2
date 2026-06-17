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
const defaultUserData = () => ({ homework: [], grades: {}, streak: 0, quizzes: [], notes: [], schedule: [] });
const setGoogleAccessToken = (t) => { googleAccessToken = t; };
export { GOOGLE_CLIENT_ID, authHeaders, setGoogleAccessToken, PROFILE_KEY, loadProfile, loadProfileByEmail, saveProfile, loadUserData, saveUserData, defaultUserData };
