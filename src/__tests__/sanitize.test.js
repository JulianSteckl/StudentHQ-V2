import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { sanitizeUserData, sanitizeProfile, bodyTooLarge, MAX_BODY_JSON_BYTES } = require('../../api/sanitize.js');

describe('sanitizeUserData', () => {
  it('caps array lengths and string fields inside homework', () => {
    const huge = 'x'.repeat(10_000);
    const data = sanitizeUserData({
      homework: [{ id: '1', subj: 's1', title: huge, due: 'Tonight', urgent: true, done: false, est: '30 min' }],
      grades: {},
    }, 'user@example.com');

    expect(data.email).toBe('user@example.com');
    expect(data.homework).toHaveLength(1);
    expect(data.homework[0].title.length).toBe(500);
  });

  it('caps grades object keys', () => {
    const grades = {};
    for (let i = 0; i < 100; i++) grades['subject-' + i] = 'A';
    const data = sanitizeUserData({ grades }, 'user@example.com');
    expect(Object.keys(data.grades).length).toBe(50);
  });

  it('strips invalid schedule rows', () => {
    const data = sanitizeUserData({
      schedule: [{}, { period: '1', subj: 'math', room: '101' }],
    }, 'user@example.com');
    expect(data.schedule).toHaveLength(1);
    expect(data.schedule[0].subj).toBe('math');
  });
});

describe('sanitizeProfile', () => {
  it('allows https picture URLs only', () => {
    const ok = sanitizeProfile({
      name: 'Test',
      picture: 'https://lh3.googleusercontent.com/a/photo',
    }, 'user@example.com');
    expect(ok.picture).toContain('https://');

    const bad = sanitizeProfile({
      name: 'Test',
      picture: 'javascript:alert(1)',
    }, 'user@example.com');
    expect(bad.picture).toBe('');

    const http = sanitizeProfile({
      name: 'Test',
      picture: 'http://example.com/x.jpg',
    }, 'user@example.com');
    expect(http.picture).toBe('');
  });

  it('forces email from token, not client body', () => {
    const profile = sanitizeProfile({ email: 'attacker@evil.com', name: 'A' }, 'real@example.com');
    expect(profile.email).toBe('real@example.com');
  });
});

describe('bodyTooLarge', () => {
  it('rejects payloads over 1MB', () => {
    const big = { notes: [{ title: 't', body: 'x'.repeat(MAX_BODY_JSON_BYTES) }] };
    expect(bodyTooLarge(big)).toBe(true);
    expect(bodyTooLarge({ homework: [] })).toBe(false);
  });
});
