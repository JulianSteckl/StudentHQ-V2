import { describe, it, expect, beforeEach } from 'vitest';
import { loadUserData, saveUserData } from '../storage.js';

describe('storage userData helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips and normalizes user data', () => {
    saveUserData('a@example.com', { homework: [], grades: { x: 'A' }, toolOpens: [] });
    const loaded = loadUserData('a@example.com');
    expect(loaded).toBeTruthy();
    expect(loaded.grades.x).toBe('A');
    expect(Array.isArray(loaded.homework)).toBe(true);
    expect(Array.isArray(loaded.toolOpens)).toBe(true);
  });
});

