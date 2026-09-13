import { useState } from 'react'
import { aspectName } from '../lib/aspects.js'
import AspectImg from './AspectImg.jsx'

export default function StocksPanel({ catalog, stocks, onChange, onHover, onLeave }) {
	const [open, setOpen] = useState(false);

	const setStock = (aspect, raw) => {
		const value = Number.parseInt(raw, 10);
		const next = value > 0 ? Math.min(9999, value) : 0;
		onChange(aspect, next);
	};

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
							more you hold, the more the search prefers to use it.
						</p>
						<button
							type="button"
							onClick={() => catalog.allAspects.forEach((a) => onChange(a, 0))}
							className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-parchment/50 transition-colors hover:bg-white/10 hover:text-parchment"
						>
							Clear
						</button>
					</div>

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