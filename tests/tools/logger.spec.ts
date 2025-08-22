// tests/tools/logger.spec.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// helper: charge le module logger avec une config mockée, en ESM (réinitialisation entre tests)
async function loadLoggerWithConfig(cfg: any) {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-02T03:04:05.000Z')); // timestamp stable pour snapshots

  vi.doMock('../../src/config', () => {
    return { config: cfg };
  });

  // IMPORTANT: importer après le mock
  const logger = await import('../../src/tools/logger.ts');
  return logger as unknown as {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    err: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    closeLogger: () => void;
  };
}

const waitFs = (ms = 15) => new Promise((r) => setTimeout(r, ms));

// regex simple pour valider le format (ISO + [LEVEL] + message)
const lineRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[(INFO|WARN|ERR|DEBUG)\] .+$/;

describe('logger (mode console)', () => {
  let restoreConsole: Array<() => void> = [];

  beforeEach(() => {
    restoreConsole = [];
  });

  afterEach(() => {
    for (const restore of restoreConsole) restore();
    vi.useRealTimers();
  });

  it('écrit sur console.log / warn / error ; ignore debug si debug=false', async () => {
    const cfg = {
      logs: {
        mode: 'console',
        debug: false,
        dir: 'ignored',
        infoName: 'app.log',
        errorName: 'error.log',
      },
    };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    restoreConsole.push(() => logSpy.mockRestore());
    restoreConsole.push(() => warnSpy.mockRestore());
    restoreConsole.push(() => errSpy.mockRestore());
    restoreConsole.push(() => debugSpy.mockRestore());

    const logger = await loadLoggerWithConfig(cfg);
    vi.useRealTimers();

    logger.log('hello', { a: 1 });
    logger.warn('attention');
    logger.err('oups');
    logger.debug('hidden');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();

    const lineInfo = (logSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(lineInfo).toMatch(lineRegex);
    expect(lineInfo).toContain('[INFO]');
    expect(lineInfo).toContain('hello');
    expect(lineInfo).toContain('"a":1');

    const lineWarn = (warnSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(lineWarn).toMatch(lineRegex);
    expect(lineWarn).toContain('[WARN]');

    const lineErr = (errSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(lineErr).toMatch(lineRegex);
    expect(lineErr).toContain('[ERR]');
  });

  it('écrit aussi sur console.debug si debug=true', async () => {
    const cfg = {
      logs: {
        mode: 'console',
        debug: true,
        dir: 'ignored',
        infoName: 'app.log',
        errorName: 'error.log',
      },
    };

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = await loadLoggerWithConfig(cfg);
    vi.useRealTimers();

    logger.debug('visible');
    expect(debugSpy).toHaveBeenCalledTimes(1);

    const line = (debugSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(line).toMatch(lineRegex);
    expect(line).toContain('[DEBUG]');
    debugSpy.mockRestore();
  });
});

describe('logger (mode files)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), "var", "logger-test-"));
  });

  afterEach(async () => {
    // nettoyage
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    vi.useRealTimers();
  });

  it('crée le dossier si absent, écrit dans info.log & error.log, gère DEBUG selon debug=true', async () => {
    const cfg = {
      logs: {
        mode: 'files',
        debug: true, // pour que DEBUG aille aussi dans info.log
        dir: path.join(tmpDir, 'logs'),
        infoName: 'app.log',
        errorName: 'error.log',
      },
    };

    const logger = await loadLoggerWithConfig(cfg);
    vi.useRealTimers();

    logger.log('info-line');
    logger.warn('warn-line');
    logger.debug('debug-line');
    logger.err('err-line');

    // Le dossier n’existe PAS encore -> ensureFileStreams doit le créer
    expect(fs.existsSync(cfg.logs.dir)).toBe(true);

    // flush en fermant les streams
    logger.closeLogger();
    await waitFs();

    expect(fs.existsSync(cfg.logs.dir)).toBe(true);

    const infoPath = path.join(cfg.logs.dir, cfg.logs.infoName);
    const errPath = path.join(cfg.logs.dir, cfg.logs.errorName);

    expect(fs.existsSync(infoPath)).toBe(true);
    expect(fs.existsSync(errPath)).toBe(true);

    const infoContent = fs.readFileSync(infoPath, 'utf8').trim().split('\n');
    const errContent = fs.readFileSync(errPath, 'utf8').trim().split('\n');

    // INFO/WARN/DEBUG -> info.log
    expect(infoContent.length).toBe(3);
    expect(infoContent[0]).toMatch(lineRegex);
    expect(infoContent[0]).toContain('[INFO]');
    expect(infoContent[0]).toContain('info-line');

    expect(infoContent[1]).toMatch(lineRegex);
    expect(infoContent[1]).toContain('[WARN]');
    expect(infoContent[1]).toContain('warn-line');

    expect(infoContent[2]).toMatch(lineRegex);
    expect(infoContent[2]).toContain('[DEBUG]');
    expect(infoContent[2]).toContain('debug-line');

    // ERR -> error.log
    expect(errContent.length).toBe(1);
    expect(errContent[0]).toMatch(lineRegex);
    expect(errContent[0]).toContain('[ERR]');
    expect(errContent[0]).toContain('err-line');
  });

  it('ne log pas DEBUG en files si debug=false', async () => {
    const cfg = {
      logs: {
        mode: 'files',
        debug: false,
        dir: path.join(tmpDir, 'logs2'),
        infoName: 'app.log',
        errorName: 'error.log',
      },
    };

    const logger = await loadLoggerWithConfig(cfg);
    vi.useRealTimers();
    logger.debug('should-not-appear');
    logger.log('ok');
    logger.closeLogger();
    await waitFs();

    const infoPath = path.join(cfg.logs.dir, cfg.logs.infoName);
    expect(fs.existsSync(infoPath)).toBe(true);
    const infoContent = fs.readFileSync(infoPath, 'utf8').trim().split('\n');

    expect(infoContent.some((l) => l.includes('[DEBUG]'))).toBe(false);
    expect(infoContent.some((l) => l.includes('[INFO]'))).toBe(true);
  });

  it('ré-ouvre les streams après closeLogger() si on relog derrière', async () => {
    const cfg = {
      logs: {
        mode: 'files',
        debug: false,
        dir: path.join(tmpDir, 'logs3'),
        infoName: 'app.log',
        errorName: 'error.log',
      },
    };

    const logger = await loadLoggerWithConfig(cfg);
    vi.useRealTimers();

    logger.log('first');
    logger.closeLogger();
    await waitFs();

    // re-log => ensureFileStreams doit recréer les streams
    logger.log('second');
    logger.closeLogger();
    await waitFs();

    const infoPath = path.join(cfg.logs.dir, cfg.logs.infoName);
    expect(fs.existsSync(infoPath)).toBe(true);
    const infoContent = fs.readFileSync(infoPath, 'utf8').trim().split('\n');

    expect(infoContent.length).toBe(2);
    expect(infoContent[0]).toContain('first');
    expect(infoContent[1]).toContain('second');
  });
});
