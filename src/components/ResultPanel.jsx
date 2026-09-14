import { aspectName } from '../lib/aspects.js'
import AspectImg from './AspectImg.jsx'

export default function ResultPanel({ result, onHover, onLeave, onClose, onConfirm }) {
	const { from, to, path, counts, steps } = result;
	const confirmed = !!result.confirmed;
	const used = Object.entries(counts).filter(([, n]) => n > 0);

	return (
		<div className="rounded-xl border border-gold/20 bg-card/70 shadow-xl shadow-black/40 backdrop-blur-sm">
			<div className="flex items-center justify-between rounded-t-xl border-b border-white/10 bg-white/5 px-4 py-2.5">
				<h3 className="font-display text-sm font-semibold tracking-[0.2em] uppercase text-gold">
					{aspectName(from)} <span className="text-rune">→</span> {aspectName(to)}
				</h3>
				<button
					type="button"
					onClick={onClose}
					className="rounded-md px-2 py-0.5 text-parchment/40 transition-colors hover:bg-white/10 hover:text-parchment"
					title="Close result"
				>
					✕
				</button>
			</div>

			<div className="p-4 sm:p-5">
				<ol className="flex flex-wrap items-center justify-center gap-y-3">
					{path.map((aspect, i) => (
						<li key={`${result.key}-${i}`} className="flex items-center">
							<div
								onMouseEnter={(e) => onHover(aspect, e)}
								onMouseMove={(e) => onHover(aspect, e)}
								onMouseLeave={onLeave}
								title={`${aspectName(aspect)} (${aspect})`}
								className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
									i === 0 || i === path.length - 1
										? 'border-rune/60 bg-rune/15'
										: 'border-gold/25 bg-gold/5'
								}`}
							>
								<AspectImg aspect={aspect} size={26} />
								<span className="text-sm text-parchment">{aspectName(aspect)}</span>
							</div>
							{i < path.length - 1 && (
								<span className="mx-2 text-lg text-rune/60 select-none" aria-hidden>
									→
								</span>
							)}
						</li>
					))}
				</ol>

				<div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-xs text-parchment/50">
					<span className="text-parchment/70">
						Total steps: <span className="font-semibold text-gold">{steps}</span>
					</span>
					{used.length > 0 && (
						<span className="flex items-center gap-1.5">
							<span className="text-parchment/70 mr-0.5">Aspects used:</span>
							{used.map(([aspect, count]) => (
								<span
									key={aspect}
									className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-parchment/80"
									title={`${aspectName(aspect)}: ${count}×`}
								>
									<AspectImg aspect={aspect} size={14} />
									{count}
								</span>
							))}
						</span>
)}

					<div className="mt-3 flex items-center justify-center gap-2 border-t border-white/10 pt-3">
						<button
							type="button"
							onClick={onConfirm}
							disabled={confirmed}
							title={
								confirmed
									? 'These aspects have been marked as used'
									: 'Consume the aspects shown above from your stocks and available list'
							}
							className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold transition-colors hover:bg-gold/20 disabled:cursor-default disabled:opacity-60"
						>
							{confirmed ? '✓ Aspects used' : 'Confirm used aspects'}
						</button>
						{confirmed && (
							<span className="text-[11px] text-parchment/40">
								removed {used.reduce((acc, [, n]) => acc + n, 0)} total
							</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}