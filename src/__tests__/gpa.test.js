import { describe, it, expect } from 'vitest';
import { calcGPA, GPA_MAP } from '../data.js';

describe('calcGPA', () => {
  it('returns — when no subjects', () => {
    expect(calcGPA([], {})).toBe('—');
  });

  it('returns — when no graded subjects', () => {
    const subjects = [{ id: 's1' }, { id: 's2' }];
    expect(calcGPA(subjects, { s1: '—', s2: '' })).toBe('—');
  });

  it('averages only valid letter grades', () => {
    const subjects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const out = calcGPA(subjects, { a: 'A', b: 'B+', c: '—' });
    const expected = ((GPA_MAP.A + GPA_MAP['B+']) / 2).toFixed(2);
    expect(out).toBe(expected);
  });
});

