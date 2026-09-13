import { useCallback, useEffect, useState } from 'react'
import { aspectName } from '../lib/aspects.js'
import { imageFromPaste, runImport } from '../lib/importer-browser.js'
import AspectImg from './AspectImg.jsx'

const LAYOUT_KEY = 'tcresearch.deskLayout.v1';

function loadLayout() {
	try {
		return JSON.parse(localStorage.getItem(LAYOUT_KEY)) ?? null;
	} catch {
		return null;
	}
}

export default function StocksPanel({ catalog, stocks, onChange, onHover, onLeave }) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [pending, setPending] = useState(null);
	const [edits, setEdits] = useState({});
	const [layout, setLayout] = useState(loadLayout);

	const setStock = (aspect, raw) => {
		const value = Number.parseInt(raw, 10);
		const next = value > 0 ? Math.min(9999, value) : 0;
		onChange(aspect, next);
	};

	const cellKey = (cell) => `${cell.panel}${cell.slot}:${cell.tile}`;

	const importFile = useCallback(async (file) => {
		setBusy(true);
		setError('');
		try {
			const result = await runImport(file, catalog.allAspects);
			if (result.error === 'no-grid' || !result.cells?.length) {
				setError("Couldn't find the two aspect columns in that screenshot. Make sure the full research desk UI is visible (no other windows over it).");
				return;
			}
			const edits = {};
			const cache = layout && layout.grid ? layout.grid : null;
			for (const cell of result.cells) {
				if (!cell.aspect && cell.count === 0) continue; // empty tile
				const key = cellKey(cell);
				let aspect = cell.aspect;
				// fixed pallet order: reuse the cached position→aspect when known
				const cached = cache?.[key];
				if (cached && catalog.allAspects.includes(cached)) {
					if (!aspect || cell.confidence < 0.6) aspect = cached;
				}
				edits[key] = {
					aspect,
					count: cell.count,
					confidence: aspect === cell.aspect ? cell.confidence : (aspect ? 0.99 : 0),
					auto: aspect === cell.aspect,
					digits: cell.digits,
				};
			}
			setEdits(edits);
			setPending(result);
		} catch (e) {
			console.error(e);
			setError('Import failed: ' + (e.message || e));
		} finally {
			setBusy(false);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [catalog.allAspects, layout]);

	useEffect(() => {
		const onPaste = (e) => {
			const file = imageFromPaste(e);
			if (file) {
				e.preventDefault();
				importFile(file);
			}
		};
		window.addEventListener('paste', onPaste);
		return () => window.removeEventListener('paste', onPaste);
	}, [importFile]);

	const cancelImport = () => {
		setPending(null);
		setEdits({});
		setError('');
	};

	const applyImport = () => {
		for (const { aspect, count } of Object.values(edits)) {
			if (!aspect) continue;
			const next = count > 0 ? Math.min(9999, count) : 0;
			if ((stocks[aspect] ?? 0) !== next) onChange(aspect, next);
		}
		// remember the (fixed-order) pallet layout for the next import
		const grid = {};
		for (const [key, row] of Object.entries(edits)) {
			if (row.aspect) grid[key] = row.aspect;
		}
		try {
			localStorage.setItem(LAYOUT_KEY, JSON.stringify({ grid }));
		} catch { /* storage unavailable */ }
		setLayout({ grid });
		cancelImport();
	};

	const clearLayout = () => {
		try { localStorage.removeItem(LAYOUT_KEY); } catch { /* ignore */ }
		setLayout(null);
	};

	const reviewRows = Object.entries(edits);

	return (
		<div className="border-t border-white/10 pt-4">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center justify-between text-left"
			>
				<span className="font-display text-sm font-semibold tracking-[0.25em] uppercase text-gold/80">
					Aspect Stocks
				</span>
				<span className={`text-gold/60 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
			</button>

			{open && (
				<div className="mt-3">
					<div className="mb-2.5 flex items-center justify-between gap-2">
						<p className="text-xs leading-relaxed text-parchment/50">
							Type in how many of each aspect you're holding. Paths are priced by scarcity — the
							more you hold, the more the search prefers to use it. Take a screenshot of the
							research desk to fill them automatically.
						</p>
						<div className="flex shrink-0 items-center gap-1.5">
							<button
								type="button"
								onClick={() => document.getElementById('stocks-file')?.click()}
								disabled={busy}
								className="rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-xs text-gold/90 transition-colors hover:bg-gold/20 disabled:opacity-50"
							>
								{busy ? 'Reading…' : 'Import'}
							</button>
							<input
								id="stocks-file"
								type="file"
								accept="image/png,image/jpeg,image/webp"
								className="hidden"
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) importFile(f);
									e.target.value = '';
								}}
							/>
							<button
								type="button"
								onClick={() => catalog.allAspects.forEach((a) => onChange(a, 0))}
								className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-parchment/50 transition-colors hover:bg-white/10 hover:text-parchment"
							>
								Clear
							</button>
						</div>
					</div>

					{error && (
						<p className="mb-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
							{error}
						</p>
					)}

					{pending && (
						<div className="mb-3 rounded-lg border border-gold/20 bg-white/[0.03] p-3">
							<div className="mb-2 flex items-center justify-between gap-2">
								<p className="text-xs font-semibold tracking-wider text-gold/80 uppercase">
									Review import — {reviewRows.length} aspects
								</p>
								<div className="flex items-center gap-1.5">
									<button
										type="button"
										onClick={applyImport}
										className="rounded-md bg-gold px-2.5 py-1 text-xs font-semibold text-black transition-colors hover:bg-gold/80"
									>
										Apply
									</button>
									<button
										type="button"
										onClick={cancelImport}
										className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-parchment/60 hover:text-parchment"
									>
										Cancel
									</button>
								</div>
							</div>
							<p className="mb-2 text-[11px] text-parchment/40">
								Detected from "{pending.sourceName}". Fix anything wrong below, then press Apply. The
								pallet order is fixed, so your corrections are remembered for the next screenshot.
							</p>
							<div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2 sm:grid-cols-2">
								{['L', 'R'].map((panel) => (
									<div key={panel}>
										<div className="mb-1 text-[10px] font-semibold tracking-wider text-parchment/30 uppercase">
											{panel} panel
										</div>
										{reviewRows
											.filter(([key]) => key[0] === panel)
											.sort((a, b) => a[1].tile - b[1].tile || a[1].slot - b[1].slot)
											.map(([key, row]) => (
												<div
													key={key}
													className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1"
												>
													<span className="w-6 shrink-0 text-center text-[9px] text-parchment/30">
														{row.tile * 4 + row.slot + 1}
													</span>
													{row.aspect ? <AspectImg aspect={row.aspect} size={18} /> : <span className="h-[18px] w-[18px] shrink-0 rounded border border-white/10 bg-white/5" />}
													<select
														value={row.aspect ?? ''}
														title="Aspect at this tile"
														onChange={(e) =>
															setEdits((p) => ({ ...p, [key]: { ...p[key], aspect: e.target.value || null } }))
														}
														className="min-w-0 flex-1 truncate rounded-md border border-gold/25 bg-white/5 px-1 py-0.5 text-xs text-parchment focus:border-gold/50 focus:outline-none"
													>
														<option value="">—</option>
														{catalog.allAspects.map((a) => (
															<option key={a} value={a}>{aspectName(a)}</option>
														))}
													</select>
													<input
														type="number"
														min={0}
														max={9999}
														inputMode="numeric"
														value={row.count}
														onChange={(e) => setEdits((p) => ({ ...p, [key]: { ...p[key], count: e.target.value } }))}
														aria-label={`tile ${row.row},${row.col} count`}
														className="h-7 w-12 shrink-0 rounded-md border border-gold/25 bg-white/5 text-center text-xs font-semibold text-parchment focus:border-gold/50 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
													/>
													<span className="w-8 shrink-0 text-right text-[9px] text-parchment/30">
														{row.confidence > 0 ? `${(row.confidence * 100) | 0}%` : ''}
													</span>
												</div>
											))}
									</div>
								))}
							</div>
							{layout && (
								<p className="mt-2 flex items-center justify-between text-[10px] text-parchment/40">
									<span>Remembering the detected layout.</span>
									<button
										type="button"
										onClick={clearLayout}
										className="text-gold/70 underline underline-offset-2 hover:text-gold"
									>
										Forget layout
									</button>
								</p>
							)}
						</div>
					)}

					<div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
						{catalog.allAspects.map((aspect) => (
							<label
								key={aspect}
								title={`${aspectName(aspect)} (${aspect})`}
								onMouseEnter={(e) => onHover(aspect, e)}
								onMouseMove={(e) => onHover(aspect, e)}
								onMouseLeave={onLeave}
								className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5"
							>
								<AspectImg aspect={aspect} size={20} />
								<span className="min-w-0 flex-1 truncate text-xs text-parchment/70">
									{aspectName(aspect)}
								</span>
								<input
									type="number"
									min={0}
									max={9999}
									inputMode="numeric"
									value={stocks[aspect] ?? 0}
									onChange={(e) => setStock(aspect, e.target.value)}
									aria-label={`${aspectName(aspect)} stock count`}
									className="h-7 w-12 rounded-md border border-gold/25 bg-white/5 text-center text-xs font-semibold text-parchment focus:border-gold/50 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
								/>
							</label>
						))}
					</div>
				</div>
			)}
		</div>
	);
}