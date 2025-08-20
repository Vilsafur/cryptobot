// src/tools/logger.ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

type Level = "INFO" | "WARN" | "ERR" | "DEBUG";

let infoStream: fs.WriteStream | null = null;
let errorStream: fs.WriteStream | null = null;

const ensureFileStreams = () => {
  if (config.logs.mode !== "files") return;

  if (!fs.existsSync(config.logs.dir)) {
    fs.mkdirSync(config.logs.dir, { recursive: true });
  }

  if (!infoStream) {
    infoStream = fs.createWriteStream(
      path.join(config.logs.dir, config.logs.infoName),
      { flags: "a" },
    );
  }

  if (!errorStream) {
    errorStream = fs.createWriteStream(
      path.join(config.logs.dir, config.logs.errorName),
      { flags: "a" },
    );
  }
};

const ts = () => {
  return new Date().toISOString();
};

const safeStringify = (v: unknown): string => {
  try {
    if (v instanceof Error) {
      return JSON.stringify({
        name: v.name,
        message: v.message,
        stack: v.stack,
      });
    }
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const formatLine = (level: Level, args: unknown[]): string => {
  if (config.logs.json) {
    return JSON.stringify({
      time: ts(),
      level,
      message: args
        .map((a) => (typeof a === "string" ? a : safeStringify(a)))
        .join(" "),
    });
  }
  const msg = args
    .map((a) => (typeof a === "string" ? a : safeStringify(a)))
    .join(" ");
  return `${ts()} [${level}] ${msg}`;
};

const write = (level: Level, ...args: unknown[]) => {
  const line = `${formatLine(level, args)}\n`;

  if (config.logs.mode === "console") {
    switch (level) {
      case "INFO":
        console.log(line.trimEnd());
        break;
      case "WARN":
        console.warn(line.trimEnd());
        break;
      case "ERR":
        console.error(line.trimEnd());
        break;
      case "DEBUG":
        if (config.logs.debug) console.debug(line.trimEnd());
        break;
    }
    return;
  }

  // Mode "files"
  ensureFileStreams();
  if (level === "ERR") {
    errorStream?.write(line);
  } else if (level === "DEBUG") {
    if (config.logs.debug) infoStream?.write(line);
  } else {
    infoStream?.write(line);
  }
};

export const log = (...args: unknown[]) => write("INFO", ...args);
export const warn = (...args: unknown[]) => write("WARN", ...args);
export const err = (...args: unknown[]) => write("ERR", ...args);
export const debug = (...args: unknown[]) => write("DEBUG", ...args);

export const closeLogger = () => {
  infoStream?.end();
  errorStream?.end();
  infoStream = null;
  errorStream = null;
};
