import { aspectName } from '../lib/aspects.js'
import AspectImg from './AspectImg.jsx'

export default function ComboTooltip({ tooltip, catalog }) {
	if (!tooltip || !catalog.compounds.has(tooltip.aspect)) return null;

	const [partA, partB] = catalog.combinations[tooltip.aspect];
	const LEFT = Math.min(tooltip.x + 14, window.innerWidth - 280);

	return (
		<div
			className="pointer-events-none fixed z-50 rounded-lg border border-gold/40 bg-abyss/95 px-3 py-2 shadow-2xl shadow-black/60"
			style={{ left: LEFT, top: tooltip.y - 96 }}
		>
			<div className="flex items-center gap-2">
				<RecipePart aspect={partA} />
				<span className="text-sm text-gold/70">+</span>
				<RecipePart aspect={partB} />
				<span className="text-sm text-gold/70 pr-1">=</span>
				<RecipePart aspect={tooltip.aspect} highlight />
			</div>
		</div>
	);
}

function RecipePart({ aspect, highlight }) {
	return (
		<div
			className={`flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 ${
				highlight ? 'bg-rune/20' : ''
			}`}
		>
			<AspectImg aspect={aspect} size={30} />
			<span className="text-[10px] leading-none tracking-wide text-parchment/80">
				{aspectName(aspect)}
			</span>
		</div>
	);
}