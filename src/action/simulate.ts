import { getCandles } from "../db/candles";
import { getPairList } from "../db/pairs";
import { runSwingForPairOnce, type SwingAction } from "../strategy/swing";
import { log, warn } from "../tools/logger";

const simulate = async (pair: string) => {
	log(`[simulate] Démarrage de la simulation pour "${pair}"`);
	const candles = await getCandles(pair, undefined, 1000);
	if (candles.length === 0) {
		warn(`[simulate] Aucune bougie pour "${pair}".`);
		return;
	}
	const ma_short = 10;
	const ma_long = 24;

	let pnlTotal = 0;
	const need = Math.max(ma_short, ma_long) + 1;

	for (let index = need - 1; index < candles.length; index++) {
		const previousCandles = candles.slice(
			Math.max(0, index - ma_long),
			index + 1,
		);
		const action: SwingAction = runSwingForPairOnce(pair, previousCandles, {
			mode: "simulation",
			maShort: ma_short,
			maLong: ma_long,
			lookback: 300,
		}) as SwingAction;

		if (action?.kind === "SELL" && typeof action.pnl === "number") {
			pnlTotal += action.pnl;
		}
	}

	log(
		`[simulate] Résultat "${pair}" → PnL total (simu): ${pnlTotal.toFixed(2)}`,
	);
};

export const cmdSimulate = async (pair?: string) => {
	if (pair) {
		await simulate(pair);
		return;
	}

	const pairs = getPairList();

	if (pairs.length === 0) {
		warn("[simulate] Aucune paire trouvée dans la table 'pairs'.");
		return;
	}

	for (const p of pairs) {
		await simulate(p);
	}
};
