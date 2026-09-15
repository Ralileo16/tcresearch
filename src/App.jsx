import { useCallback, useEffect, useMemo, useState } from 'react'
import { addons } from './data/addons.js'
import { versions } from './data/versions.js'
import { aspectName } from './lib/aspects.js'
import { buildCatalog, findPath, summarizePath } from './lib/search.js'
import { loadState, saveState, persistGet, persistSet, VERSION_KEY } from './lib/storage.js'
import AspectSelect from './components/AspectSelect.jsx'
import AvailableAspects from './components/AvailableAspects.jsx'
import ComboTooltip from './components/ComboTooltip.jsx'
import ResultPanel from './components/ResultPanel.jsx'
import StocksPanel from './components/StocksPanel.jsx'

export default function App() {
	// Restore the last-used Thaumcraft version (falls back to the newest).
	const [version, setVersion] = useState(() => {
		const saved = persistGet(VERSION_KEY);
		return saved && versions[saved] ? saved : '5.2';
	});
	// Remember the active version so a reload lands back where you were.
	useEffect(() => {
		persistSet(VERSION_KEY, version);
	}, [version]);
	// Keying by version remounts the panel, which resets all research state
	// (From/To, steps, unlocked aspects, results) whenever it changes.
	return <Research key={version} version={version} onVersionChange={setVersion} />;
}

function initialAvailable(catalog) {
	return new Set(catalog.allAspects.filter((a) => !catalog.addonAspects.has(a)));
}

function Research({ version, onVersionChange }) {
	const catalog = useMemo(() => buildCatalog(version), [version]);

	// Restore the last session's selection for this version (per-version keys
	// mean switching versions restores each version's own state).
	const [saved] = useState(() => loadState(version) ?? {});

	const [from, setFrom] = useState(
		() => (saved.from && catalog.allAspects.includes(saved.from) ? saved.from : 'air'),
	);
	const [to, setTo] = useState(
		() => (saved.to && catalog.allAspects.includes(saved.to) ? saved.to : 'air'),
	);
	const [minSteps, setMinSteps] = useState(() =>
		Math.min(10, Math.max(1, Number(saved.minSteps) || 1)),
	);
	const [available, setAvailable] = useState(() => {
		const defaults = initialAvailable(catalog);
		const valid = Array.isArray(saved.available)
			? saved.available.filter((a) => catalog.allAspects.includes(a))
			: null;
		return new Set(valid ?? defaults);
	});
	const [addonToggles, setAddonToggles] = useState(() => {
		const toggles = {};
		for (const id of Object.keys(addons)) toggles[id] = !!saved.addonToggles?.[id];
		return toggles;
	});
	const [stocks, setStocks] = useState(() => {
		if (!saved.stocks) return {};
		return Object.fromEntries(
			Object.entries(saved.stocks).filter(([a]) => catalog.allAspects.includes(a)),
		);
	});
	const [results, setResults] = useState([]);
	const [message, setMessage] = useState('');
	const [tooltip, setTooltip] = useState(null);

	// Path cost: unavailable aspects are near-impossible, everything else is
	// priced by scarcity first, then by complexity. Holding more of an aspect
	// makes it cheaper to route through; among equal holdings, the deeper an
	// aspect is (how many combination steps stand behind it) the more it
	// costs — so abundant primals are preferred over rare compound chains.
	const cost = useCallback(
		(aspect) => {
			if (!available.has(aspect)) return 1000;
			const held = stocks[aspect] ?? 0;
			const level = catalog.levels.get(aspect) ?? 0;
			return (1 + level) / (1 + held);
		},
		[available, stocks, catalog],
	);

	const selectOptions = useMemo(
		() => [...catalog.allAspects].sort((a, b) => aspectName(a).localeCompare(aspectName(b))),
		[catalog],
	);

	const toggleAspect = (aspect) => {
		setAvailable((prev) => {
			const next = new Set(prev);
			if (next.has(aspect)) next.delete(aspect);
			else next.add(aspect);
			return next;
		});
	};

	const toggleAddon = (id) => {
		const enable = !addonToggles[id];
		setAddonToggles((prev) => ({ ...prev, [id]: enable }));
		setAvailable((prev) => {
			const next = new Set(prev);
			for (const aspect of addons[id].aspects) {
				if (enable) next.add(aspect);
				else next.delete(aspect);
			}
			return next;
		});
	};

	const handleHover = (aspect, e) => {
		if (!catalog.compounds.has(aspect)) return;
		setTooltip({ aspect, x: e.clientX, y: e.clientY });
	};

	const runSearch = useCallback(() => {
		if (from === to) {
			setMessage('From and To are the same. Pick two different aspects.');
			return;
		}
		if (!catalog.graph[from] || !catalog.graph[to]) {
			setMessage('Invalid combination selected.');
			return;
		}
		const path = findPath({
			from,
			to,
			minSteps,
			graph: catalog.graph,
			cost,
		});
		if (!path) {
			setMessage('No connection found with the current aspect set. Unlock more aspects and try again.');
			return;
		}
		const summary = summarizePath(path);
		setResults((rs) => [
			...rs,
			{
				id: `${from}>${to}#${Date.now()}`,
				from,
				to,
				path,
				...summary,
			},
		]);
		setMessage('');
	}, [from, to, minSteps, catalog, cost]);

	const findConnection = (e) => {
		e.preventDefault();
		runSearch();
	};

	// Global shortcuts: Ctrl/Cmd+Enter finds the connection from anywhere,
	// '/' focuses the From picker.
	useEffect(() => {
		const onKeyDown = (e) => {
			const typing =
				e.target instanceof HTMLElement &&
				['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

			if (e.key === '/' && !typing) {
				e.preventDefault();
				const trigger = document.getElementById('from-aspect-trigger');
				trigger?.focus();
				trigger?.click();
			} else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
				e.preventDefault();
				runSearch();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [runSearch]);

	// Persist the selection for this version so a reload restores it.
	useEffect(() => {
		saveState(version, { from, to, minSteps, available: [...available], addonToggles, stocks });
	}, [version, from, to, minSteps, available, addonToggles, stocks]);

	const closeResult = (id) => setResults((rs) => rs.filter((r) => r.id !== id));

	// Mark a solved note as done: the aspects used in the path are spent, so
	// they're removed from the available set and deducted from stocks. Both are
	// persisted by the saveState effect below, so this survives a reload.
	const confirmResult = (id) => {
		const result = results.find((r) => r.id === id);
		if (!result || result.confirmed) return;
		const usedEntries = Object.entries(result.counts).filter(([, n]) => n > 0);
		if (!usedEntries.length) {
			setResults((rs) => rs.map((r) => (r.id === id ? { ...r, confirmed: true } : r)));
			return;
		}
		const used = new Map(usedEntries);
		setStocks((prev) => {
			const next = { ...prev };
			for (const [aspect, n] of used) next[aspect] = Math.max(0, (next[aspect] ?? 0) - n);
			return next;
		});
		setAvailable((prev) => {
			const next = new Set(prev);
			for (const aspect of used.keys()) next.delete(aspect);
			return next;
		});
		setResults((rs) => rs.map((r) => (r.id === id ? { ...r, confirmed: true } : r)));
	};

	return (
		<div className="min-h-screen">
			<div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
				<header className="mb-8 text-center">
					<div className="mb-3 flex items-center justify-center gap-3 text-gold/70">
						<span className="h-px w-16 bg-gradient-to-r from-transparent to-gold/50" />
						<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
							<path d="M12 1l2.6 8.4H23l-6.9 5 2.6 8.6-6.7-4.9-6.7 4.9 2.6-8.6L1 9.4h8.4z" />
						</svg>
						<span className="h-px w-16 bg-gradient-to-l from-transparent to-gold/50" />
					</div>
					<h1 className="font-display text-3xl sm:text-4xl font-bold tracking-[0.15em] text-parchment uppercase">
						<span className="text-gold">Thaumcraft</span> Research Helper
					</h1>
					<p className="mt-2 text-sm tracking-[0.3em] uppercase text-rune-100/60">
						Aspects pathfinding for research notes
					</p>
				</header>

				<main className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
					<section className="rounded-xl border border-gold/20 bg-card/60 p-5 shadow-xl shadow-black/40 backdrop-blur-sm">
						<h2 className="mb-4 font-display text-sm font-semibold tracking-[0.25em] uppercase text-gold/80">
							Research Note
						</h2>

						<form onSubmit={findConnection} className="space-y-4">
							<div>
								<label
									htmlFor="version"
									className="block text-xs font-semibold tracking-widest uppercase text-rune/70 mb-1.5"
								>
									Version
								</label>
								<select
									id="version"
									value={version}
									onChange={(e) => onVersionChange(e.target.value)}
									className="w-full rounded-lg border border-gold/25 bg-white/5 px-3 py-2 text-sm text-parchment focus:border-gold/50 focus:outline-none"
								>
									{Object.keys(versions).map((v) => (
										<option key={v} value={v}>
											{v}
										</option>
									))}
								</select>
							</div>

							<AspectSelect
								label="From"
								value={from}
								onChange={setFrom}
								options={selectOptions}
								triggerId="from-aspect-trigger"
							/>

							<div className="flex justify-center">
								<button
									type="button"
									onClick={() => {
										setFrom(to);
										setTo(from);
									}}
									className="rounded-lg border border-rune/30 bg-rune/10 px-3 py-1 text-xs text-rune-100 transition-colors hover:bg-rune/20"
									title="Swap From and To"
								>
									⇄ Swap
								</button>
							</div>

							<AspectSelect label="To" value={to} onChange={setTo} options={selectOptions} />

							<div>
								<label
									htmlFor="minSteps"
									className="block text-xs font-semibold tracking-widest uppercase text-rune/70 mb-1.5"
								>
									Min. Steps
								</label>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setMinSteps((s) => Math.max(1, s - 1))}
										className="h-9 w-9 rounded-lg border border-gold/25 bg-white/5 text-gold transition-colors hover:bg-gold/10 disabled:opacity-30"
										disabled={minSteps <= 1}
										aria-label="Decrease minimum steps"
									>
										−
									</button>
									<input
										id="minSteps"
										type="number"
										min={1}
										max={10}
										value={minSteps}
										onChange={(e) => {
											const v = Number(e.target.value);
											if (!Number.isNaN(v)) setMinSteps(Math.min(10, Math.max(1, Math.trunc(v))));
										}}
										className="h-9 w-14 rounded-lg border border-gold/25 bg-white/5 text-center text-sm font-semibold text-parchment focus:border-gold/50 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
									/>
									<button
										type="button"
										onClick={() => setMinSteps((s) => Math.min(10, s + 1))}
										className="h-9 w-9 rounded-lg border border-gold/25 bg-white/5 text-gold transition-colors hover:bg-gold/10 disabled:opacity-30"
										disabled={minSteps >= 10}
										aria-label="Increase minimum steps"
									>
										+
									</button>
								</div>
								<p className="mt-1 text-[11px] text-parchment/40">
									Blank spaces between the two aspects on your research note.
								</p>
							</div>

							<div className="flex items-center gap-2 pt-1">
								<button
									type="submit"
									className="flex-1 rounded-lg bg-gradient-to-b from-gold/90 to-gold/60 px-4 py-2.5 font-display text-sm font-bold tracking-[0.2em] uppercase text-void shadow-lg shadow-gold/20 transition-all hover:from-gold hover:to-gold/70 active:scale-[0.98]"
								>
									Find Connection
								</button>
								{results.length > 0 && (
									<button
										type="button"
										onClick={() => setResults([])}
										className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-parchment/50 transition-colors hover:bg-white/10 hover:text-parchment"
										title="Clear all results"
									>
										Clear
									</button>
								)}
							</div>
						</form>

						{message && (
							<p className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
								{message}
							</p>
						)}
					</section>

					<section className="rounded-xl border border-gold/20 bg-card/60 p-5 shadow-xl shadow-black/40 backdrop-blur-sm">
						<AvailableAspects
							catalog={catalog}
							available={available}
							onToggleAspect={toggleAspect}
							onUnlockAll={() => setAvailable(new Set(catalog.allAspects))}
							onLockAll={() => setAvailable(new Set())}
							addonToggles={addonToggles}
							onToggleAddon={toggleAddon}
							onHover={handleHover}
							onLeave={() => setTooltip(null)}
						/>

						<StocksPanel
							catalog={catalog}
							stocks={stocks}
							onChange={(aspect, value) => setStocks((prev) => ({ ...prev, [aspect]: value }))}
							onHover={handleHover}
							onLeave={() => setTooltip(null)}
						/>

						<div className="mt-5 border-t border-white/10 pt-4">
							<h2 className="mb-2.5 font-display text-sm font-semibold tracking-[0.25em] uppercase text-gold/80">
								How it works
							</h2>
							<p className="text-sm leading-relaxed text-parchment/60">
								Pick the two aspects at the edges of your research note and the number of blank
								cells between them, then search. Lock aspects you can't craft yet to route the
								path around them. Hover any compound aspect to see how it's made — the search
								only ever uses recipes available in the selected version.{' '}
								<span className="text-parchment/40">
									Ctrl/Cmd+Enter runs the search from anywhere; pressing{' '}
									<kbd className="rounded border border-white/15 bg-white/5 px-1 text-[10px]">/</kbd>{' '}
									focuses the From picker.
								</span>
							</p>
						</div>
					</section>
				</main>

				{results.length > 0 && (
					<section className="mt-6 space-y-3" aria-label="Search results">
						<div className="flex items-center gap-3 text-gold/60">
							<span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/30" />
							<span className="font-display text-xs tracking-[0.3em] uppercase">Results</span>
							<span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/30" />
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							{results.map((result) => (
								<ResultPanel
									key={result.id}
									result={result}
									onHover={handleHover}
									onLeave={() => setTooltip(null)}
									onClose={() => closeResult(result.id)}
									onConfirm={() => confirmResult(result.id)}
								/>
							))}
						</div>
					</section>
				)}

				<footer className="mt-10 text-center text-xs text-parchment/35">
					<p className="mb-1">
						Built from the legacy{' '}
						<a
							href="https://github.com/Ralileo16/tcresearch"
							target="_blank"
							rel="noreferrer"
							className="text-rune-100/70 underline decoration-rune/40 underline-offset-2 hover:text-rune-100"
						>
							tcresearch
						</a>{' '}
						project, re-skinned for the arcane arts.
					</p>
					<p>
						This work is licensed under a{' '}
						<a
							href="https://creativecommons.org/licenses/by/4.0/"
							target="_blank"
							rel="noreferrer"
							className="text-rune-100/70 underline decoration-rune/40 underline-offset-2 hover:text-rune-100"
						>
							Creative Commons Attribution 4.0 License
						</a>
						.
					</p>
				</footer>
			</div>

			<ComboTooltip tooltip={tooltip} catalog={catalog} />
		</div>
	);
}