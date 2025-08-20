import { describe, it, expect } from 'vitest';
import { useTestDb } from '../helpers/test-db';
import { countCandles, getCandles, getLastCandleTime, hasMinWeeklyHistory, upsertCandle, upsertCandles } from '../../src/db/candles';
import { FOUR_HOURS_SECS } from '../../src/config';

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

  it('recupère les bougies de la fixture depuis', () => {
    const candles = getCandles('XBT/EUR', Math.floor(Date.now() / 1000) - 28800, 10);
    expect(candles.length).toEqual(2);
  });

  it('upsert des bougies', () => {
    const lastTime = getLastCandleTime('XBT/EUR');
    let candles = getCandles('XBT/EUR', lastTime ?? Math.floor(Date.now() / 1000) - 28800, 10);
    expect(candles.length).toEqual(1); // 2 bougies existantes
    upsertCandles('XBT/EUR', [
      { time: lastTime ?? Math.floor(Date.now() / 1000), open: 100, high: 110, low: 90, close: 105, volume: 1 },
      { time: (lastTime ?? Math.floor(Date.now() / 1000)) + FOUR_HOURS_SECS, open: 105, high: 115, low: 95, close: 110, volume: 2 },
      { time: (lastTime ?? Math.floor(Date.now() / 1000)) + (FOUR_HOURS_SECS * 2), open: 105, high: 115, low: 95, close: 110, volume: 2 },
    ]);
    candles = getCandles('XBT/EUR', lastTime ?? Math.floor(Date.now() / 1000) - 28800, 10);
    expect(candles.length).toEqual(3); // 2 bougies ajoutées + 1 remplacée
  });

  it('remplacement d\'une bougie', () => {
    const lastTime = getLastCandleTime('XBT/EUR');
    let candles = getCandles('XBT/EUR', lastTime ?? Math.floor(Date.now() / 1000) - 28800, 10);
    expect(candles.length).toEqual(1); // 1 bougies existantes
    upsertCandle('XBT/EUR', { time: lastTime ?? Math.floor(Date.now() / 1000), open: 100, high: 110, low: 90, close: 105, volume: 1 });
    candles = getCandles('XBT/EUR', lastTime ?? Math.floor(Date.now() / 1000) - 28800, 10);
    expect(candles.length).toEqual(1); // la bougie a été remplacée
  });

  it('ajout d\'une bougie', () => {
    const lastTime = getLastCandleTime('XBT/EUR');
    let candles = getCandles('XBT/EUR', lastTime ?? Math.floor(Date.now() / 1000) - 28800, 10);
    expect(candles.length).toEqual(1); // 1 bougies existantes
    upsertCandle('XBT/EUR', { time: (lastTime ?? Math.floor(Date.now() / 1000)) + FOUR_HOURS_SECS, open: 100, high: 110, low: 90, close: 105, volume: 1 });
    candles = getCandles('XBT/EUR', lastTime ?? Math.floor(Date.now() / 1000) - 28800, 10);
    expect(candles.length).toEqual(2); // la bougie a été ajoutée
  });
});
