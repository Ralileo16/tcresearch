import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { aspectName } from '../lib/aspects.js'
import AspectImg from './AspectImg.jsx'

export default function AspectSelect({ label, value, onChange, options, triggerId }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [activeIndex, setActiveIndex] = useState(0);
	const rootRef = useRef(null);
	const listRef = useRef(null);
	const listId = useId();

	const select = useCallback(
		(aspect) => {
			onChange(aspect);
			setOpen(false);
			setQuery('');
		},
		[onChange],
	);

	const close = useCallback(() => {
		setOpen(false);
		setQuery('');
	}, []);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(a) => a.includes(q) || aspectName(a).toLowerCase().includes(q),
		);
	}, [options, query]);

	useEffect(() => {
		if (!open) return;
		const onClick = (e) => {
			if (rootRef.current && !rootRef.current.contains(e.target)) close();
		};
		document.addEventListener('mousedown', onClick);
		return () => document.removeEventListener('mousedown', onClick);
	}, [open, close]);

	// Keep the highlighted option in view while arrowing through the list.
	useEffect(() => {
		if (!open || filtered.length === 0) return;
		listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
	}, [activeIndex, open, filtered]);

	const toggleOpen = () => {
		setOpen((o) => !o);
		setActiveIndex(0);
	};

	const onInputKeyDown = (e) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveIndex((i) => (filtered.length ? Math.min(i + 1, filtered.length - 1) : 0));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === 'Enter') {
			// Ctrl/Cmd+Enter is used by the global "find connection" shortcut.
			if (e.ctrlKey || e.metaKey) return;
			e.preventDefault();
			if (filtered[activeIndex]) select(filtered[activeIndex]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	};

	return (
		<div ref={rootRef} className="relative">
			<label className="block text-xs font-semibold tracking-widest uppercase text-rune/70 mb-1.5">
				{label}
			</label>
			<button
				type="button"
				id={triggerId}
				onClick={toggleOpen}
				onKeyDown={(e) => {
					if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
						e.preventDefault();
						if (!open) {
							setOpen(true);
							setActiveIndex(0);
						}
					}
				}}
				aria-haspopup="listbox"
				aria-expanded={open}
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
							onChange={(e) => {
								setQuery(e.target.value);
								setActiveIndex(0);
							}}
							onKeyDown={onInputKeyDown}
							placeholder="Search aspects…"
							role="combobox"
							aria-expanded={open}
							aria-controls={listId}
							aria-activedescendant={filtered[activeIndex] ? `option-${listId}-${filtered[activeIndex]}` : undefined}
							className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-parchment placeholder:text-parchment/30 focus:border-gold/50 focus:outline-none"
						/>
					</div>
					<ul ref={listRef} id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
						{filtered.length === 0 && (
							<li className="px-3 py-2 text-sm text-parchment/40">No aspects match</li>
						)}
						{filtered.map((aspect, i) => (
							<li key={aspect} role="presentation">
								<button
									type="button"
									id={`option-${listId}-${aspect}`}
									role="option"
									aria-selected={aspect === value}
									onClick={() => select(aspect)}
									className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-rune/15 ${
										i === activeIndex ? 'bg-rune/25' : ''
									} ${aspect === value ? 'bg-rune/20' : ''}`}
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