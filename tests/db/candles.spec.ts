import { describe, it, expect } from 'vitest';
import { useTestDb } from '../helpers/test-db';
import { countCandles, getLastCandleTime, hasMinWeeklyHistory } from '../../src/db/candles';

useTestDb();

describe('Candles DB', () => {
  it('compte les bougies de la fixture', () => {
    const nbCandles = countCandles('XBT/EUR')
    expect(nbCandles).toEqual(721);
  });
  
  it('compte les bougies de la fixture depuis', () => {
    const nbCandles = countCandles('XBT/EUR', Math.floor(Date.now() / 1000) - 28800)
    expect(nbCandles).toEqual(2);
  });

  it('compte les bougies de la fixture jusqu\'a', () => {
    const nbCandles = countCandles('XBT/EUR', undefined, Math.floor(Date.now() / 1000) - 28800)
    expect(nbCandles).toEqual(719);
  });

  it('vérifie s\'il y a au moins 7 jours de bougies', () => {
    const hasHistory = hasMinWeeklyHistory('XBT/EUR');
    expect(hasHistory).toBeTruthy();
  });

  it('recupère le dernier timestamp', () => {
    const lastCandle = getLastCandleTime('XBT/EUR');
    expect(lastCandle).toBeGreaterThan(Math.floor(Date.now() / 1000) - 14400); // 4h avant l'heure actuelle
  });

  it('retourne null à la récupération du dernier timestamp s\'il n\'y a pas de bougie pour la pair souhaité', () => {
    const lastCandle = getLastCandleTime('SOL/EUR');
    expect(lastCandle).toEqual(null);
  });
});
