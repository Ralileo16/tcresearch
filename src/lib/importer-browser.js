import { analyzeScreenshot, makeTemplates } from './importer.js'

let templatesPromise = null;

// Load and cache the 32×32 colour aspect icons as classification templates.
export function loadTemplates(aspects) {
	if (templatesPromise) return templatesPromise;
	templatesPromise = (async () => {
		const base = import.meta.env.BASE_URL ?? '/';
		const out = [];
		for (const name of aspects) {
			const resp = await fetch(`${base}aspects/color/${name}.png`);
			if (!resp.ok) continue;
			const blob = await resp.blob();
			const bitmap = await createImageBitmap(blob);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(bitmap, 0, 0);
			const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
			out.push({ name, width: bitmap.width, height: bitmap.height, data: imageData.data });
			bitmap.close();
		}
		return makeTemplates(out);
	})();
	return templatesPromise;
}

function fileToBitmap(file) {
	return createImageBitmap(file);
}

function bitmapToImage(bitmap) {
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d');
	ctx.drawImage(bitmap, 0, 0);
	const { width, height, data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
	bitmap.close();
	return { w: width, h: height, data };
}

// Run the full pipeline over a pasted/selected image file.
export async function runImport(file, aspects) {
	const bitmap = await fileToBitmap(file);
	const img = bitmapToImage(bitmap);
	const templates = await loadTemplates(aspects);
	const result = analyzeScreenshot(img, templates);
	result.sourceName = file.name;
	return result;
}

// Grab the first still image from a paste event.
export function imageFromPaste(event) {
	for (const item of event.clipboardData?.items ?? []) {
		if (item.type.startsWith('image/')) {
			const file = item.getAsFile();
			if (file) return file;
		}
	}
	return null;
}