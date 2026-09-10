import { translate } from '../data/translation.js'

export const BASE_URL = import.meta.env.BASE_URL;

// Resolves the PNG path for an aspect, colored (available) or greyed mono
// (unavailable). Images live in public/aspects/.
export function aspectSrc(aspect, mono = false) {
	return `${BASE_URL}aspects/${mono ? 'mono' : 'color'}/${translate[aspect]}.png`;
}

export function aspectName(aspect) {
	const latin = translate[aspect] ?? aspect;
	return latin.charAt(0).toUpperCase() + latin.slice(1);
}