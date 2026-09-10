import { useEffect, useMemo, useRef, useState } from 'react'
import { aspectName } from '../lib/aspects.js'
import AspectImg from './AspectImg.jsx'

export default function AspectSelect({ label, value, onChange, options }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const rootRef = useRef(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (e) => {
			if (rootRef.current && !rootRef.current.contains(e.target)) {
				setOpen(false);
				setQuery('');
			}
		};
		document.addEventListener('mousedown', onClick);
		return () => document.removeEventListener('mousedown', onClick);
	}, [open]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(a) => a.includes(q) || aspectName(a).toLowerCase().includes(q),
		);
	}, [options, query]);

	return (
		<div ref={rootRef} className="relative">
			<label className="block text-xs font-semibold tracking-widest uppercase text-rune/70 mb-1.5">
				{label}
			</label>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="w-full flex items-center gap-3 rounded-lg border border-gold/25 bg-white/5 px-3 py-2 text-left transition-colors hover:border-gold/50 hover:bg-white/10"
			>
				<AspectImg aspect={value} size={28} />
				<span className="flex-1">
					<span className="block text-sm font-semibold text-parchment">{aspectName(value)}</span>
					<span className="block text-[11px] tracking-wide text-parchment/40">{value}</span>
				</span>
				<span className={`text-gold transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
			</button>

			{open && (
				<div className="absolute z-30 mt-2 w-full rounded-lg border border-gold/25 bg-card shadow-2xl shadow-black/60 overflow-hidden">
					<div className="p-2 border-b border-white/10">
						<input
							autoFocus
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search aspects…"
							className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-parchment placeholder:text-parchment/30 focus:border-gold/50 focus:outline-none"
						/>
					</div>
					<ul className="max-h-72 overflow-y-auto py-1">
						{filtered.length === 0 && (
							<li className="px-3 py-2 text-sm text-parchment/40">No aspects match</li>
						)}
						{filtered.map((aspect) => (
							<li key={aspect}>
								<button
									type="button"
									onClick={() => {
										onChange(aspect);
										setOpen(false);
										setQuery('');
									}}
									className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-rune/15 ${
										aspect === value ? 'bg-rune/20' : ''
									}`}
								>
									<AspectImg aspect={aspect} size={26} />
									<span className="flex-1">
										<span className="block text-sm text-parchment">{aspectName(aspect)}</span>
										<span className="block text-[11px] tracking-wide text-parchment/40">{aspect}</span>
									</span>
									{aspect === value && <span className="text-gold text-xs">✓</span>}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}