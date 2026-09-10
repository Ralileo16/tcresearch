import { aspectName, aspectSrc } from '../lib/aspects.js'

export default function AspectImg({ aspect, mono = false, size = 32, className = '' }) {
	return (
		<img
			src={aspectSrc(aspect, mono)}
			alt={aspectName(aspect)}
			width={size}
			height={size}
			className={className}
			draggable={false}
		/>
	);
}