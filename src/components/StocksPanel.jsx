import { useCallback, useEffect, useState } from 'react'
import { aspectName } from '../lib/aspects.js'
import { imageFromPaste, runImport } from '../lib/importer-browser.js'
import AspectImg from './AspectImg.jsx'

export default function StocksPanel({ catalog, stocks, onChange, onHover, onLeave }) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [pending, setPending] = useState(null);
	const [edits, setEdits] = useState({});

	const setStock = (aspect, raw) => {
		const value = Number.parseInt(raw, 10);
		const next = value > 0 ? Math.min(9999, value) : 0;
		onChange(aspect, next);
	};

	const importFile = useCallback(async (file) => {
		setBusy(true);
		setError('');
		try {
			const result = await runImport(file, catalog.allAspects);
			if (result.error === 'no-grid' || !result.cells?.length) {
				setError("Couldn't find the two aspect columns in that screenshot. Make sure the research desk UI is visible.");
				return;
			}
			const edits = {};
			for (const cell of result.cells) {
				if (!cell.aspect) continue;
				edits[`${cell.col},${cell.row}`] = {
					aspect: cell.aspect,
					count: cell.count,
					confidence: cell.runeScore,
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
	}, [catalog.allAspects]);

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
			const next = count > 0 ? Math.min(9999, count) : 0;
			if ((stocks[aspect] ?? 0) !== next) onChange(aspect, next);
		}
		cancelImport();
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
								Detected from "{pending.sourceName}". Correct anything that looks wrong below, press
								Ctrl+V from the in-game desk to re-import, or click a name to fix it.
							</p>
							<div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
								{reviewRows.map(([key, row]) => (
									<div
										key={key}
										className="flex items-center gap-2 border-b border-white/5 px-2 py-1 last:border-b-0"
									>
										<AspectImg aspect={row.aspect} size={18} />
										<div className="min-w-0 flex-1">
											<span
												className="cursor-pointer text-xs text-parchment/80 hover:text-gold"
												title="Click to change aspect"
												role="button"
												tabIndex={0}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														const next = prompt('Aspect id:', row.aspect);
														if (next && catalog.allAspects.includes(next)) {
															setEdits((p) => ({ ...p, [key]: { ...p[key], aspect: next } }));
														}
													}
												}}
												onClick={() => {
													const next = prompt('Aspect id:', row.aspect);
													if (next && catalog.allAspects.includes(next)) {
														setEdits((p) => ({ ...p, [key]: { ...p[key], aspect: next } }));
													}
												}}
											>
												{aspectName(row.aspect)}
											</span>
											<span className="ml-1.5 text-[10px] text-parchment/30">
												conf {(row.confidence * 100) | 0}%
											</span>
										</div>
										<input
											type="number"
											min={0}
											max={9999}
											inputMode="numeric"
											value={row.count}
											onChange={(e) => setEdits((p) => ({ ...p, [key]: { ...p[key], count: e.target.value } }))}
											aria-label={`${row.aspect} detected count`}
											className="h-7 w-14 rounded-md border border-gold/25 bg-white/5 text-center text-xs font-semibold text-parchment focus:border-gold/50 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
										/>
									</div>
								))}
							</div>
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