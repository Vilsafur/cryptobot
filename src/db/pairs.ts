import { getDB } from "./storage";

export const getPairList = (): string[] => {
  const rows = getDB().prepare(`SELECT pair FROM pairs`).all() as {
    pair: string;
  }[];
  return rows.map((r) => r.pair);
};
