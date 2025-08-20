import { describe, expect, it } from 'vitest';
import { getPairList } from '../../src/db/pairs';
import { useTestDb } from '../helpers/test-db';

useTestDb();

describe('Pairs DB', () => {
  it('récupère les noms des pairs', () => {
    const pairs = getPairList();
    expect(pairs).toEqual(['ETH/EUR', 'XBT/EUR']);
  });
});