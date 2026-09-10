import { addons } from '../data/addons.js'
import { aspectName } from '../lib/aspects.js'
import AspectImg from './AspectImg.jsx'

export default function AvailableAspects({
	catalog,
	available,
	onToggleAspect,
	onUnlockAll,
	onLockAll,
	addonToggles,
	onToggleAddon,
	onHover,
	onLeave,
}) {
	return (
		<div className="space-y-5">
			<div>
				<div className="flex items-center justify-between mb-2.5">
					<h2 className="font-display text-sm font-semibold tracking-[0.25em] uppercase text-gold/80">
						Available Aspects
					</h2>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onUnlockAll}
							className="rounded-md border border-rune/30 bg-rune/10 px-2 py-1 text-xs text-rune-100 transition-colors hover:bg-rune/20"
						>
							Unlock all
						</button>
						<button
							type="button"
							onClick={onLockAll}
							className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-parchment/60 transition-colors hover:bg-white/10"
						>
							Lock all
						</button>
					</div>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
					{catalog.allAspects.map((aspect) => {
						const isAvailable = available.has(aspect);
						return (
							<button
								key={aspect}
								type="button"
								title={`${aspectName(aspect)} (${aspect})`}
								onClick={() => onToggleAspect(aspect)}
								onMouseEnter={(e) => onHover(aspect, e)}
								onMouseMove={(e) => onHover(aspect, e)}
								onMouseLeave={onLeave}
								className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all ${
									isAvailable
										? 'border-gold/20 bg-white/5 hover:border-gold/50 hover:bg-gold/10'
										: 'border-transparent bg-white/[0.02] hover:bg-white/5'
								}`}
							>
								<AspectImg aspect={aspect} mono={!isAvailable} size={24} className={isAvailable ? '' : 'opacity-40 grayscale'} />
								<span className="min-w-0">
									<span
										className={`block text-[13px] leading-tight truncate ${
											isAvailable ? 'text-parchment' : 'text-parchment/30 line-through'
										}`}
									>
										{aspectName(aspect)}
									</span>
									<span className="block text-[10px] tracking-wide text-parchment/35">{aspect}</span>
								</span>
							</button>
						);
					})}
				</div>
			</div>

			<div>
				<h2 className="font-display text-sm font-semibold tracking-[0.25em] uppercase text-gold/80 mb-2.5">
					Addons
				</h2>
				<div className="flex flex-wrap gap-2">
					{Object.entries(addons).map(([id, addon]) => {
						const enabled = !!addonToggles[id];
						return (
							<label
								key={id}
								className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
									enabled
										? 'border-rune/50 bg-rune/15 text-parchment'
										: 'border-white/10 bg-white/5 text-parchment/50 hover:border-white/25'
								}`}
							>
								<input
									type="checkbox"
									checked={enabled}
									onChange={() => onToggleAddon(id)}
									className="accent-fuchsia-500"
								/>
								{addon.name}
							</label>
						);
					})}
				</div>
			</div>
		</div>
	);
}