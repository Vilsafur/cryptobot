import { describe, it, expect } from 'vitest';
import { useTestDb } from '../helpers/test-db.js';
import { getDB } from '../../src/db/storage.js';

useTestDb();

describe('Candles DB', () => {
  it('compte les bougies de la fixture', () => {
    const rows = getDB().prepare('SELECT pair, time, open FROM candles ORDER BY pair').all();
    expect(rows.length).toEqual(1442);
  });
});
