import { getDB } from "./storage";

/** Retourne le dernier timestamp (s) connu pour une paire, ou null. */
export const getPairs = (): number | null => {
	const row = getDB().prepare(`SELECT * FROM pairs`).all() as
		| { time: number }
		| undefined;
	return row?.time ?? null;
};

export const getPairList = (): string[] => {
	const rows = getDB().prepare(`SELECT pair FROM pairs`).all() as {
		pair: string;
	}[];
	return rows.map((r) => r.pair);
};
