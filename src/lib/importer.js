/*
 * Screenshot → aspect-stock importer for the Thaumcraft research desk.
 *
 * Pure pixel math on {width, height, data} RGBA buffers so it runs identically
 * in node (tests) and the browser (paste / file import). Two steps:
 *   detectGrid(img)          locate the two 4-column aspect panels + row grid
 *   analyzeScreenshot(img, templates)
 *                            classify each tile's rune and read its count
 */

const SAT_MIN = 95; // rune pixels have strong chroma

// Dominant icon colours per aspect (from the thaumcraft4-research-bot palette;
// these are the primary tones that dominate each in-game aspect icon).
const ASPECT_COLORS = {
	ordo: [0xd5, 0xd4, 0xec], terra: [0x56, 0xc0, 0x00], aqua: [0x3c, 0xd4, 0xfc],
	permutatio: [0x57, 0x83, 0x57], vitreus: [0x80, 0xff, 0xff], victus: [0xde, 0x00, 0x05],
	metallum: [0xb5, 0xb5, 0xcd], sano: [0xff, 0x2f, 0x34], tempus: [0xb6, 0x8c, 0xff],
	iter: [0xe0, 0x58, 0x5b], mortuus: [0x88, 0x77, 0x88], herba: [0x01, 0xac, 0x00],
	limus: [0x01, 0xf8, 0x00], bestia: [0x9f, 0x64, 0x09], caelum: [0x5e, 0x74, 0xcf],
	spiritus: [0xeb, 0xeb, 0xfb], magneto: [0xc0, 0xc0, 0xc0], aequalitas: [0xee, 0xf0, 0xea],
	corpus: [0xee, 0x47, 0x8d], humanus: [0xff, 0xd7, 0xc0], instrumentum: [0x40, 0x40, 0xee],
	perfodio: [0xdc, 0xd2, 0xd8], luxuria: [0xff, 0xc1, 0xce], tutamen: [0x00, 0xc0, 0xc0],
	machina: [0x80, 0x80, 0xa0], gloria: [0xff, 0xe9, 0x80], messis: [0xe1, 0xb3, 0x71],
	lucrum: [0xe6, 0xbe, 0x44], electrum: [0xc0, 0xee, 0xee], tabernus: [0x4c, 0x85, 0x69],
	pannus: [0xea, 0xea, 0xc2], fabrico: [0x80, 0x9d, 0x80], meto: [0xee, 0xad, 0x82],
	nebrisum: [0xee, 0xee, 0x7e], perditio: [0x40, 0x40, 0x40], ignis: [0xff, 0x5a, 0x01],
	aer: [0xff, 0xff, 0x7e], potentia: [0xc0, 0xff, 0xff], gelum: [0xe1, 0xff, 0xff],
	motus: [0xcd, 0xcc, 0xf4], venenum: [0x89, 0xf0, 0x00], vacuos: [0x88, 0x88, 0x88],
	lux: [0xff, 0xf6, 0x63], tempestas: [0xff, 0xff, 0xff], vinculum: [0x9a, 0x80, 0x80],
	volatus: [0xe7, 0xe7, 0xd7], praecantatio: [0x97, 0x00, 0xc0], primordium: [0xf7, 0xf7, 0xdb],
	radio: [0xc0, 0xff, 0xc0], fames: [0x9a, 0x03, 0x05], arbor: [0x87, 0x65, 0x31],
	tenebrae: [0x22, 0x22, 0x22], vitium: [0x80, 0x00, 0x80], infernus: [0xff, 0x00, 0x00],
	exanimis: [0x3a, 0x40, 0x00], auram: [0xff, 0xc0, 0xff], superbia: [0x96, 0x39, 0xff],
	cognitio: [0xff, 0xc2, 0xb3], gula: [0xd5, 0x9c, 0x46], sensus: [0x0f, 0xd9, 0xff],
	astrum: [0x2d, 0x2c, 0x2b], alienis: [0x80, 0x50, 0x80], strontio: [0xee, 0xc2, 0xb3],
	desidia: [0x6e, 0x6e, 0x6e], invidia: [0x00, 0xba, 0x00], vesania: [0x1b, 0x12, 0x2c],
	telum: [0xc0, 0x50, 0x50], ira: [0x87, 0x04, 0x04], terminus: [0xb9, 0x00, 0x00],
};
const COLOR_NAMES = Object.keys(ASPECT_COLORS);

// Known full-screen desk geometry for the user's setup (aspects are shown in a
// fixed order so the grid is deterministic; pitch = 16px cell × gui scale 3).
const LOCKED_GRID = {
	pitch: 48,
	left: [512, 560, 608, 656],
	right: [1268, 1316, 1364, 1412],
	rowTop: 181,
};

function lockedGrid(img) {
	const { w, h } = img;
	// desktop full-screen capture of the desk: ~1920×1080 (or 1919×1079 borderless)
	if (w < 1900 || w > 1940 || h < 1060 || h > 1100) return null;
	const rows = [];
	for (let k = 0; k < 12; k++) rows.push(LOCKED_GRID.rowTop + k * LOCKED_GRID.pitch);
	return {
		w,
		h,
		pitch: LOCKED_GRID.pitch,
		left: [...LOCKED_GRID.left],
		right: [...LOCKED_GRID.right],
		rows,
	};
}

// Color-vote classification: count pixels of the cell's icon (its salient
// connected blob, which floats within the tile) whose colour is within a tight
// tolerance of an aspect's dominant tone, then take the argmax.
export function classifyByColor(img, cell, grid) {
	const hits = new Int32Array(COLOR_NAMES.length);
	const p = grid.pitch;
	const x0 = Math.round(cell.x - p / 2);
	const x1 = Math.min(img.w, Math.round(cell.x + p / 2));
	const crowd = (cx0, cx1, cy0, cy1) => {
		for (let y = cy0; y < cy1; y++) {
			for (let x = cx0; x < cx1; x++) {
				const j = (y * img.w + x) * 4;
				const r = img.data[j], g = img.data[j + 1], b = img.data[j + 2];
				const mx = Math.max(r, g, b);
				if (mx < 45) continue; // deep wood / void
				if (r > 230 && g > 230 && b > 230) continue; // white digits / sparkle
				let bestK = -1, d = 1e9;
				for (let k = 0; k < COLOR_NAMES.length; k++) {
					const c = ASPECT_COLORS[COLOR_NAMES[k]];
					const dd = Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b);
					if (dd < d) { d = dd; bestK = k; }
				}
				if (d <= 10) hits[bestK]++;
			}
		}
	};
	// find the icon blob: salient pixels in the band just below the pale frame
	// (rel rows ~4..26 of the cell); digits at rel 27..36 are excluded
	const yScan0 = Math.max(0, Math.round(cell.y - p / 2) + 4);
	const yScan1 = Math.min(img.h, Math.round(cell.y));
	let bx0 = x1, bx1 = x0, by0 = yScan1, by1 = -1;
	for (let y = yScan0; y < yScan1; y++) {
		for (let x = x0; x < x1; x++) {
			const j = (y * img.w + x) * 4;
			const r = img.data[j], g = img.data[j + 1], b = img.data[j + 2];
			const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
			const s = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
			const ink = (s > 0.18 && l > 0.22) || (l > 0.72 && s < 0.2) || l > 0.94;
			if (!ink) continue;
			if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
			if (y < by0) by0 = y; if (y > by1) by1 = y;
		}
	}
	if (bx0 <= bx1 && by0 <= by1 && by1 - by0 >= 6 && bx1 - bx0 >= 8) {
		// sample the blob (knowing dark/wood frame pixels still get skipped)
		const cx0 = Math.max(x0, bx0 - 3), cx1 = Math.min(x1, bx1 + 4);
		crowd(cx0, cx1, by0, by1 + 1);
	} else {
		// no strong icon blob: fall back to a broad band, digits excluded above
		crowd(x0, x1, Math.max(0, Math.round(cell.y - p / 2) + 1), yScan1);
	}
	let first = 0, second = -1;
	for (let k = 1; k < COLOR_NAMES.length; k++) {
		if (hits[k] > hits[first]) { second = first; first = k; }
		else if (second < 0 || hits[k] > hits[second]) second = k;
	}
	const votes = hits[first];
	return {
		name: votes > 0 ? COLOR_NAMES[first] : null,
		votes,
		second: second >= 0 ? COLOR_NAMES[second] : null,
		secondVotes: second >= 0 ? hits[second] : 0,
		confidence: Math.min(1, votes / 180),
	};
}

function lumaOf(r, g, b) {
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function makeMaps(img) {
	const { w, h, data } = img;
	const lum = new Float32Array(w * h);
	const sat = new Float32Array(w * h);
	const sal = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) {
		const j = i * 4;
		const r = data[j], g = data[j + 1], b = data[j + 2];
		lum[i] = lumaOf(r, g, b);
		sat[i] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
	}
	// salience: colourful, almost-white, or noticeably brighter than the local
	// background (picks up dim/locked aspects that sat alone would miss)
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (sat[i] > SAT_MIN / 255) { sal[i] = 1; continue; }
			if (lum[i] > 0.8) { sal[i] = 1; continue; }
			let acc = 0;
			const taps = [[x, y], [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
			for (const [tx, ty] of taps) {
				if (tx >= 0 && tx < w && ty >= 0 && ty < h) acc += lum[ty * w + tx];
			}
			if (lum[i] > acc / 5 + 0.05) sal[i] = 1;
		}
	}
	return { w, h, lum, sat, sal };
}

function colProfile({ w, sat }, ys, ye, white) {
	const prof = new Float32Array(w);
	for (let x = 0; x < w; x++) {
		let n = 0;
		for (let y = ys; y < ye; y++) {
			const i = y * w + x;
			if (sat[i] > SAT_MIN / 255) n++;
			if (white && white(i)) n++;
		}
		prof[x] = n / (ye - ys);
	}
	return prof;
}

function bestPitch(prof) {
	const w = prof.length;
	const lo = Math.max(20, Math.round(w * 0.025));
	const hi = Math.min(140, Math.floor(w / 6));
	const a = new Float32Array(hi + 1);
	for (let lag = lo; lag <= hi; lag++) {
		let acc = 0, n = 0;
		for (let i = 0; i + lag < w; i++) {
			acc += prof[i] * prof[i + lag];
			n++;
		}
		a[lag] = n ? acc / n : -Infinity;
	}
	let globalMax = -Infinity;
	for (let lag = lo; lag <= hi; lag++) if (a[lag] > globalMax) globalMax = a[lag];
	// first local maximum reaching ~80% of the global autocorr value is the
	// true tile pitch (multiples of it correlate equally well)
	for (let lag = lo + 1; lag < hi; lag++) {
		if (a[lag] >= a[lag - 1] && a[lag] >= a[lag + 1] && a[lag] >= 0.8 * globalMax) {
			return lag;
		}
	}
	return lo;
}

function clustersOf(peaks, pitch) {
	const clusters = [];
	for (const p of peaks) {
		const last = clusters.at(-1);
		if (last && p.x - last.peakX <= Math.round(pitch * 1.6)) {
			last.peakX = p.x;
			last.n++;
		} else {
			clusters.push({ peakX: p.x, n: 1 });
		}
	}
	return clusters.filter((c) => c.n >= 3);
}

function peakColumns(prof, x0, x1, pitch) {
	// local maxima with at least pitch/2 separation
	const peaks = [];
	const sep = Math.max(2, Math.round(pitch / 2));
	for (let x = x0; x <= x1; x++) {
		let isMax = true;
		for (let d = 1; d <= sep && isMax; d++) {
			if (prof[x] < (prof[x - d] ?? -1) || prof[x] < (prof[x + d] ?? -1)) isMax = false;
		}
		if (isMax && prof[x] > 0) peaks.push({ x, v: prof[x] });
	}
	return peaks;
}

// Snap a set of peak positions onto an arithmetic grid with the given pitch:
// find the seed that covers the most peaks within tolerance.
function snapGrid(points, pitch, tol = 0.45) {
	const ps = [...points].sort((a, b) => a.x - b.x);
	if (!ps.length) return [];
	// try every point as a candidate anchor, keep the one covering the most
	let best = null;
	for (const anchor of ps) {
		const positions = new Map();
		for (const p of ps) {
			const k = Math.round((p.x - anchor.x) / pitch);
			const err = Math.abs((p.x - anchor.x) - k * pitch);
			if (err <= pitch * tol) {
				const prev = positions.get(k);
				if (!prev || Math.abs(p.x - anchor.x) < Math.abs(prev - anchor.x)) {
					positions.set(k, p.x);
				}
			}
		}
		const keys = [...positions.keys()];
		if (!best || keys.length > best.keys.length) best = { anchor, positions, keys, pitch };
	}
	// snap to clean grid lines
	const lines = [...best.keys].sort((a, b) => a - b);
	return lines.map((k) => best.anchor.x + k * best.pitch);
}

export function detectGrid(img) {
	const { w, h, sat } = makeMaps(img);
	const ys = Math.floor(h * 0.12), ye = Math.min(h, Math.floor(h * 0.62));
	const prof = colProfile({ w, h, sat }, ys, ye, null);
	const maxProf = Math.max(...prof);
	const pitch = bestPitch(prof);

	const thr = Math.max(0.004, maxProf * 0.12);
	const allPeaks = peakColumns(prof, 0, w - 1, pitch).filter((p) => p.v > thr);
	const clusters = clustersOf(allPeaks, pitch);
	if (!clusters.length) return null;
	// pick the two largest clusters, one per side when possible
	clusters.sort((c1, c2) => c2.n - c1.n || c2.peakX - c1.peakX);
	const leftCluster = clusters[0];
	const rightCluster = clusters.find((c) => {
		const a = c.peakX < w / 2, b = leftCluster.peakX < w / 2;
		return a !== b;
	}) || clusters[1];
	const gridLine = (cluster) => {
		const cols = snapGrid(
			allPeaks.filter((p) => Math.abs(p.x - cluster.peakX) < pitch * 6 && p.v > thr),
			pitch,
		);
		// keep the longest consecutive run near the actual pitch (drops
		// decoration columns that snuck onto the line)
		let bestRun = [cols[0]], run = [cols[0]];
		for (let i = 1; i < cols.length; i++) {
			if (Math.abs(cols[i] - cols[i - 1] - pitch) <= pitch * 0.4) run.push(cols[i]);
			else run = [cols[i]];
			if (run.length > bestRun.length) bestRun = run;
		}
		if (bestRun.length >= 3) {
			const weighted = bestRun
				.map((c) => ({ c, v: prof[c] }))
				.sort((a, b) => b.v - a.v)
				.slice(0, 4)
				.sort((a, b) => a.c - b.c)
				.map((o) => o.c);
			return weighted;
		}
		if (cols.length >= 3) {
			const mid = cols[Math.floor(cols.length / 2)];
			const idx = cols.indexOf(mid);
			return cols.slice(Math.max(0, idx - 1), Math.min(cols.length, idx + 3));
		}
		return cols;
	};
	let left = gridLine(leftCluster);
	let right = gridLine(rightCluster);
	if (leftCluster.peakX > w / 2) [left, right] = [right, left];
	if (!left.length) left = [];
	const allCols = [...new Set([...left, ...right])];

	// rows via saturation at the found columns
	const rowProf = new Float32Array(h);
	for (let y = 0; y < h; y++) {
		let n = 0;
		for (const c of allCols) {
			for (let d = -2; d <= 2; d++) {
				const x = c + d;
				if (x >= 0 && x < w && sat[y * w + x] > SAT_MIN / 255) n++;
			}
		}
		rowProf[y] = n;
	}
	const rowPeaks = [];
	for (let y = 2; y < h - 2; y++) {
		const sep = Math.max(2, Math.round(pitch / 2));
		let isMax = true;
		for (let d = 1; d <= sep; d++) {
			if (rowProf[y] < (rowProf[y - d] ?? -1) || rowProf[y] < (rowProf[y + d] ?? -1)) isMax = false;
		}
		if (isMax && rowProf[y] > 0) rowPeaks.push({ x: y, v: rowProf[y] });
	}
	const rmax = Math.max(...rowProf);
	const rows = snapGrid(rowPeaks.filter((p) => p.v > rmax * 0.1), pitch);

	return { w, h, pitch, left, right, rows, colProfile: prof, rowProfile: rowProf };
}

// ---- per-tile analysis -----------------------------------------------------

function tileBounds(cell, grid) {
	const p = grid.pitch;
	const x0 = Math.max(0, Math.floor(cell.x - p / 2));
	const x1 = Math.min(grid.w, Math.ceil(cell.x + p / 2));
	const y0 = Math.max(0, Math.floor(cell.y - p / 2));
	const y1 = Math.min(grid.h, Math.ceil(cell.y + p / 2));
	return { x0, x1, y0, y1 };
}

// Bilinear resample of a square window into an n×n box, returns RGBA luma-ish
// [r,g,b] triplets in a Float32Array(n*n*3) + binary ink mask.
// `sal` marks glyph pixels (handles dim/white glyphs); `excl` optionally
// masks out the count-number strip so digits never leak into the rune.
function sampleGlyph(img, cx, cy, size, n, sal, excl) {
	const out = new Float32Array(n * n * 3);
	const ink = new Uint8Array(n * n);
	const half = size / 2;
	for (let gy = 0; gy < n; gy++) {
		for (let gx = 0; gx < n; gx++) {
			const fx = cx + (gx + 0.5) * (size / n) - half;
			const fy = cy + (gy + 0.5) * (size / n) - half;
			const x0 = Math.floor(fx), y0 = Math.floor(fy);
			let r = 0, g = 0, b = 0, valid = 0;
			for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
				const px = x0 + sx, py = y0 + sy;
				if (px >= 0 && px < img.w && py >= 0 && py < img.h) {
					const j = (py * img.w + px) * 4;
					const wx = sx ? fx - x0 : 1 - (fx - x0);
					const wy = sy ? fy - y0 : 1 - (fy - y0);
					const wg = wx * wy;
					r += img.data[j] * wg; g += img.data[j + 1] * wg; b += img.data[j + 2] * wg;
					valid += wg;
				}
			}
			if (valid > 0) {
				const o = (gy * n + gx) * 3;
				out[o] = r; out[o + 1] = g; out[o + 2] = b;
				if (sal) {
					const ix = Math.round(fx), iy = Math.round(fy);
					const inExcl = excl && ix >= excl.nx0 && ix < excl.nx1 && iy >= excl.ny0 && iy < excl.ny1;
					if (!inExcl && ix >= 0 && ix < img.w && iy >= 0 && iy < img.h && sal[iy * img.w + ix]) {
						ink[gy * n + gx] = 1;
					}
				} else {
					const s = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
					const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
					if (s > 0.18 || l > 0.55) ink[gy * n + gx] = 1;
				}
			}
		}
	}
	return { rgb: out, ink };
}

function diceMask(a, b) {
	let both = 0, any = 0;
	for (let i = 0; i < a.length; i++) {
		any += a[i] + b[i];
		both += a[i] && b[i] ? 2 : 0;
	}
	return any ? both / any : 0;
}

// Per-channel normalised cross-correlation over the union mask.
function nccChannels(winRgba, tRgb, mask) {
	let score = 0, used = 0;
	for (let c = 0; c < 3; c++) {
		let ma = 0, mb = 0, mn = 0;
		for (let i = 0; i < mask.length; i++) {
			if (!mask[i]) continue;
			ma += winRgba[i * 3 + c]; mb += tRgb[i * 3 + c]; mn++;
		}
		if (!mn) return 0;
		ma /= mn; mb /= mn;
		let aa = 0, bb = 0, ab = 0;
		for (let i = 0; i < mask.length; i++) {
			if (!mask[i]) continue;
			const da = winRgba[i * 3 + c] - ma, db = tRgb[i * 3 + c] - mb;
			aa += da * da; bb += db * db; ab += da * db;
		}
		if (aa && bb) { score += ab / Math.sqrt(aa * bb); used++; }
	}
	return used ? score / used : 0;
}

function runeOfTile({ w, sal }, cell, grid) {
	const { x0, x1, y0, y1 } = tileBounds(cell, grid);
	// centre of mass of salient pixels in the tile's upper portion (the rune;
	// the count digits live lower-right and would drag the centre down)
	const cyMax = Math.round(cell.y + grid.pitch * 0.42);
	let sx = 0, sy = 0, n = 0;
	for (let y = y0; y < Math.min(y1, cyMax); y++) {
		for (let x = x0; x < x1; x++) {
			if (sal[y * w + x]) { sx += x; sy += y; n++; }
		}
	}
	if (n < Math.max(2, Math.round((grid.pitch / 48) ** 2 * 8))) return null;
	return { cx: sx / n, cy: sy / n, size: Math.round(grid.pitch * 0.68) };
}

// Translate an icon template so its glyph ink is centred in the 32×32 box and
// precompute a 1px-dilated mask (tolerates the in-game glow/antialias).
function alignTemplate(t) {
	const rgb = new Float32Array(32 * 32 * 3);
	const mask = new Uint8Array(32 * 32);
	const dilMask = new Uint8Array(32 * 32);
	let sx = 0, sy = 0, n = 0;
	for (let i = 0; i < 32 * 32; i++) {
		const on = t.mask[i];
		if (on) { sx += i % 32; sy += (i / 32) | 0; n++; }
	}
	const dx = Math.round(15.5 - sx / n);
	const dy = Math.round(15.5 - sy / n);
	for (let y = 0; y < 32; y++) {
		for (let x = 0; x < 32; x++) {
			const sx0 = x - dx, sy0 = y - dy;
			if (sx0 >= 0 && sx0 < 32 && sy0 >= 0 && sy0 < 32) {
				const i = sy0 * 32 + sx0;
				if (t.mask[i]) {
					mask[y * 32 + x] = 1;
					for (const [ddx, ddy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
						const nx = x + ddx, ny = y + ddy;
						if (nx >= 0 && nx < 32 && ny >= 0 && ny < 32) dilMask[ny * 32 + nx] = 1;
					}
					const o = (y * 32 + x) * 3;
					const so = i * 3;
					rgb[o] = t.rgb[so]; rgb[o + 1] = t.rgb[so + 1]; rgb[o + 2] = t.rgb[so + 2];
				}
			}
		}
	}
	return { rgb, mask: dilMask, glyph: mask };
}

function classifyRune(img, maps, cell, grid, templates) {
	const { sal } = maps;
	const { nx0, nx1, ny0, ny1 } = digitRect(img, maps, cell, grid);
	const rune = runeOfTile(maps, cell, grid);
	if (!rune) return null;
	let best = { name: null, score: -Infinity };
	const sizes = [grid.pitch * 0.6, grid.pitch * 0.68, grid.pitch * 0.76];
	for (const size of sizes) {
		const glyph = sampleGlyph(img, rune.cx, rune.cy, size, 32, sal, { nx0, nx1, ny0, ny1 });
		// centre the window ink too
		let sx = 0, sy = 0, n = 0;
		for (let i = 0; i < 32 * 32; i++) if (glyph.ink[i]) { sx += i % 32; sy += (i / 32) | 0; n++; }
		if (!n) continue;
		const dx = Math.round(15.5 - sx / n), dy = Math.round(15.5 - sy / n);
		const win = new Float32Array(32 * 32 * 3);
		const winInk = new Uint8Array(32 * 32);
		for (let y = 0; y < 32; y++) {
			for (let x = 0; x < 32; x++) {
				const sx0 = x - dx, sy0 = y - dy;
				if (sx0 >= 0 && sx0 < 32 && sy0 >= 0 && sy0 < 32) {
					const i = sy0 * 32 + sx0;
					const o = (y * 32 + x) * 3, so = i * 3;
					win[o] = glyph.rgb[so]; win[o + 1] = glyph.rgb[so + 1]; win[o + 2] = glyph.rgb[so + 2];
					if (glyph.ink[i]) winInk[y * 32 + x] = 1;
				}
			}
		}
		for (const t of templates.list) {
			const shape = diceMask(winInk, t.glyph);
			const color = nccChannels(win, t.rgb, t.mask);
			const score = 0.55 * shape + 0.45 * color;
			if (score > best.score) best = { name: t.name, score };
		}
	}
return { ...best, size: rune.size };
}

// ---- digit OCR -------------------------------------------------------------

// compact 6×9 bitmap glyphs for 0-9 (MC-style serif-less digits)
const DIGIT_GLYPHS = {
	0: [' #### ', '#    #', '#    #', '#    #', '#    #', '#    #', '#    #', '#    #', ' #### '],
	1: ['  ##  ', ' ##   ', '  #   ', '  #   ', '  #   ', '  #   ', '  #   ', '  #   ', '  ### '],
	2: [' #### ', '#    #', '     #', '    # ', '   #  ', '  #   ', ' #    ', '#     ', '######'],
	3: [' #### ', '#    #', '     #', '  ### ', '     #', '     #', '     #', '#    #', ' #### '],
	4: ['    # ', '   ## ', '  # # ', ' #  # ', '#   # ', '######', '    # ', '    # ', '    # '],
	5: ['######', '#     ', '#     ', '##### ', '     #', '     #', '     #', '#    #', ' #### '],
	6: ['  ### ', ' #    ', '#     ', '##### ', '#    #', '#    #', '#    #', '#    #', ' #### '],
	7: ['######', '     #', '    # ', '   #  ', '  #   ', '  #   ', ' #    ', ' #    ', ' #    '],
	8: [' #### ', '#    #', '#    #', ' #### ', '#    #', '#    #', '#    #', '#    #', ' #### '],
	9: [' #### ', '#    #', '#    #', '#    #', ' #### ', '     #', '     #', '    # ', ' ###  '],
};
const GLYPH_H = 9, GLYPH_W = 6;
const GLYPH_LUM = {};
const GLYPH_MASK = {};
for (const [d, rows] of Object.entries(DIGIT_GLYPHS)) {
	const lum = new Float32Array(GLYPH_H * GLYPH_W * 4);
	const mask = new Uint8Array(GLYPH_H * GLYPH_W);
	for (let y = 0; y < GLYPH_H; y++) {
		for (let x = 0; x < GLYPH_W; x++) {
			const on = rows[y][x] === '#';
			mask[y * GLYPH_W + x] = on ? 1 : 0;
			const o = (y * GLYPH_W + x) * 4;
			lum[o] = on ? 255 : 0;
		}
	}
	GLYPH_LUM[d] = lum;
	GLYPH_MASK[d] = mask;
}

// scale a bbox into the glyph grid, preserving aspect, nearest neighbour
function toGlyph(lumIdx, w, x0, x1, y0, y1) {
	const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
	const outL = new Float32Array(GLYPH_H * GLYPH_W * 4);
	const outM = new Uint8Array(GLYPH_H * GLYPH_W);
	for (let gy = 0; gy < GLYPH_H; gy++) {
		for (let gx = 0; gx < GLYPH_W; gx++) {
			const sx = Math.round(x0 + ((gx + 0.5) / GLYPH_W) * bw - 0.5);
			const sy = Math.round(y0 + ((gy + 0.5) / GLYPH_H) * bh - 0.5);
			const on = sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && lumIdx[sy * w + sx] > 0.5;
			const o = (gy * GLYPH_W + gx) * 4;
			outL[o] = on ? 255 : 0;
			outM[gy * GLYPH_W + gx] = on ? 1 : 0;
		}
	}
	return { lum: outL, mask: outM };
}

function dice(a, b) {
	let both = 0, any = 0;
	for (let i = 0; i < a.length; i++) {
		const x = a[i] ? 1 : 0, y = b[i] ? 1 : 0;
		any += x + y;
		both += x && y ? 2 : 0;
	}
	return any ? both / any : 0;
}

// number window: measured digit band sits at rel row 27..36 of the 48px cell,
// spanning the full cell width (digits may start left of centre, e.g. ordo)
function digitRect(img, maps, cell, grid) {
	const { x0, x1, y0, y1 } = tileBounds(cell, grid);
	const p = grid.pitch;
	return {
		x0, x1, y0, y1,
		nx0: x0,
		nx1: x1,
		ny0: Math.max(y0, Math.round(cell.y - p / 2 + p * 0.56)),
		ny1: Math.min(y1, Math.round(cell.y - p / 2 + p * 0.76)),
	};
}

function readDigits(img, maps, cell, grid) {
	const p = grid.pitch;
	const { nx0, nx1, ny0, ny1 } = digitRect(img, maps, cell, grid);
	const bin = new Uint8Array(img.w * img.h);
	for (let y = ny0; y < ny1; y++) {
		for (let x = nx0; x < nx1; x++) {
			const j = (y * img.w + x) * 4;
			const l = lumaOf(img.data[j], img.data[j + 1], img.data[j + 2]);
			const s = (Math.max(img.data[j], img.data[j + 1], img.data[j + 2]) - Math.min(img.data[j], img.data[j + 1], img.data[j + 2])) / 255;
			if (l > 0.85 && s < 0.15) bin[y * img.w + x] = 1;
		}
	}
	// connected components (4-connect)
	const label = new Uint16Array(img.w * img.h).fill(0xffff);
	const comps = [];
	for (let y = ny0; y < ny1; y++) {
		for (let x = nx0; x < nx1; x++) {
			if (!bin[y * img.w + x]) continue;
			const id = comps.length;
			const q = [[x, y]];
			label[y * img.w + x] = id;
			const box = { x0: x, x1: x, y0: y, y1: y, n: 0 };
			let head = 0;
			while (head < q.length) {
				const [cx, cy] = q[head++];
				box.n++;
				if (cx < box.x0) box.x0 = cx; if (cx > box.x1) box.x1 = cx;
				if (cy < box.y0) box.y0 = cy; if (cy > box.y1) box.y1 = cy;
				const nei = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
				for (const [nx2, ny2] of nei) {
					if (nx2 >= nx0 && nx2 < nx1 && ny2 >= ny0 && ny2 < ny1 && bin[ny2 * img.w + nx2] && label[ny2 * img.w + nx2] === 0xffff) {
						label[ny2 * img.w + nx2] = id;
						q.push([nx2, ny2]);
					}
				}
			}
			if (box.n >= 3) comps.push(box);
		}
	}
	// keep glyph-like components
	const glyphs = comps.filter((b) => {
		const bw2 = b.x1 - b.x0 + 1, bh2 = b.y1 - b.y0 + 1;
		return bw2 >= 1 && bh2 >= 4 && bw2 <= p * 0.5 && bh2 <= p * 0.6 && bh2 / bw2 <= 4 && bh2 / bw2 >= 0.6;
	}).sort((a, b) => a.x0 - b.x0);
	if (!glyphs.length) return null;

	const parts = [];
	for (const g of glyphs) {
		let bw2 = g.x1 - g.x0 + 1, bh2 = g.y1 - g.y0 + 1;
		// thin upright bars are '1' (the font strokes slant and can be 1-2px)
		if (bw2 <= 2 && bh2 / bw2 >= 2.5) {
			parts.push({ digit: 1, score: 0.6 });
			continue;
		}
		// split a possibly-merged pair by the thinnest vertical ink column
		let boxes = [{ ...g }];
		if (bw2 > Math.round(bh2 * 1.5)) {
			let bestCol = -1, bestInk = Infinity;
			for (let x = g.x0 + 1; x < g.x1; x++) {
				let ink = 0;
				for (let y = g.y0; y <= g.y1; y++) ink += bin[y * img.w + x] ? 1 : 0;
				if (ink < bestInk) { bestInk = ink; bestCol = x; }
			}
			if (bestCol > g.x0 && bestCol < g.x1 && bestInk <= bh2 * 0.35) {
				boxes = [
					{ x0: g.x0, x1: bestCol - 1, y0: g.y0, y1: g.y1 },
					{ x0: bestCol + 1, x1: g.x1, y0: g.y0, y1: g.y1 },
				];
			}
		}
		for (const bx of boxes) {
			const glyph = toGlyph(bin, img.w, bx.x0, bx.x1, bx.y0, bx.y1);
			let best = { d: null, s: -Infinity };
			for (const [d, _] of Object.entries(DIGIT_GLYPHS)) {
				const s = dice(glyph.mask, GLYPH_MASK[d]);
				if (s > best.s) best = { d, s };
			}
			if (best.s >= 0.45) parts.push({ digit: +best.d, score: best.s });
		}
	}
	if (!parts.length) return null;
	return { value: parts.reduce((v, p) => v * 10 + p.digit, 0), digits: parts };
}

// ---- top-level -------------------------------------------------------------

// Auto-accept a colour vote only when it's both sizeable and clearly ahead of
// the runner-up (weak/spurious votes go to the manual review list instead).
const AUTO_MIN_VOTES = 30;
const AUTO_RATIO = 2.5;
function acceptAspect(cc) {
	return cc.votes >= AUTO_MIN_VOTES && cc.votes >= AUTO_RATIO * (cc.secondVotes || 1);
}

export function analyzeScreenshot(img, templates, gridOverride) {
	const grid = gridOverride || lockedGrid(img) || detectGrid(img);
	if (!grid) return { error: 'no-grid', grid: null, stocks: null, cells: [] };
	if (!grid.h) grid.h = img.h;
	if (!grid.w) grid.w = img.w;
	const maps = makeMaps(img);
	const stocks = {};
	const cells = [];
	// drop rows in the bottom ~10% (hotbar / NEI strip that can echo the grid)
	const rowCut = grid.h * 0.9;
	const colSets = [grid.left, grid.right];
	// panel order: whichever column cluster is left of centre is the left panel
	let leftPanel = colSets[0];
	let rightPanel = colSets[1];
	if (grid.left.length && leftPanel[0] > grid.w / 2) [leftPanel, rightPanel] = [rightPanel, leftPanel];
	for (const [pi, cols] of [[0, leftPanel], [1, rightPanel]]) {
		const panel = pi === 0 ? 'L' : 'R';
		for (const [colIdx, col] of cols.entries()) {
			for (const [rowIdx, row] of grid.rows.entries()) {
				if (row >= rowCut) continue;
				const cell = { x: col, y: row };
				const cc = classifyByColor(img, cell, grid);
				const count = readDigits(img, maps, cell, grid);
				const ok = acceptAspect(cc);
				const aspect = ok ? cc.name : null;
				const value = count ? count.value : 0;
				cells.push({
					panel,
					col,
					row,
					slot: colIdx,
					tile: rowIdx,
					aspect,
					auto: aspect !== null,
					confidence: ok ? cc.confidence : 0,
					count: value,
					digits: count ? count.digits.map((d) => d.digit).join('') : null,
					// colour-vote detail (debug/review)
					score: cc.votes,
					second: cc.secondVotes >= 6 ? cc.second : null,
				});
				if (aspect) stocks[aspect] = value;
			}
		}
	}
	return { grid, stocks, cells };
}

export function makeTemplates(list) {
	const out = [];
	for (const t of list) {
		const w = t.width, h = t.height;
		const { data } = t;
		if (w !== 32 || h !== 32) continue; // skip odd-size icons (astrum/tabernus)
		t.rgb = new Float32Array(32 * 32 * 3);
		t.mask = new Uint8Array(32 * 32);
		for (let i = 0; i < 32 * 32; i++) {
			const j = i * 4;
			const on = data[j + 3] > 40;
			t.mask[i] = on ? 1 : 0;
			const o = i * 3;
			t.rgb[o] = data[j]; t.rgb[o + 1] = data[j + 1]; t.rgb[o + 2] = data[j + 2];
		}
		out.push({ name: t.name, ...alignTemplate(t) });
	}
	return { list: out };
}

// debug/calibration helper: pixel-derived maps for the current screenshot
export function gridMaps(img) {
	return makeMaps(img);
}

// debug/calibration helpers: per-cell classification and count reading
export { classifyRune, readDigits, lockedGrid };

// score one specific target aspect at a cell (same pipeline as classifyRune)
export function scoreAspect(img, maps, cell, grid, templates, target) {
	const { sal } = maps;
	const { nx0, nx1, ny0, ny1 } = digitRect(img, maps, cell, grid);
	const rune = runeOfTile(maps, cell, grid);
	if (!rune) return null;
	const t = templates.list.find((x) => x.name === target);
	if (!t) return null;
	let best = -Infinity;
	const sizes = [grid.pitch * 0.6, grid.pitch * 0.68, grid.pitch * 0.76];
	for (const size of sizes) {
		const glyph = sampleGlyph(img, rune.cx, rune.cy, size, 32, sal, { nx0, nx1, ny0, ny1 });
		let sx = 0, sy = 0, n = 0;
		for (let i = 0; i < 32 * 32; i++) if (glyph.ink[i]) { sx += i % 32; sy += (i / 32) | 0; n++; }
		if (!n) continue;
		const dx = Math.round(15.5 - sx / n), dy = Math.round(15.5 - sy / n);
		const win = new Float32Array(32 * 32 * 3);
		const winInk = new Uint8Array(32 * 32);
		for (let y = 0; y < 32; y++) {
			for (let x = 0; x < 32; x++) {
				const sx0 = x - dx, sy0 = y - dy;
				if (sx0 >= 0 && sx0 < 32 && sy0 >= 0 && sy0 < 32) {
					const i = sy0 * 32 + sx0;
					const o = (y * 32 + x) * 3, so = i * 3;
					win[o] = glyph.rgb[so]; win[o + 1] = glyph.rgb[so + 1]; win[o + 2] = glyph.rgb[so + 2];
					if (glyph.ink[i]) winInk[y * 32 + x] = 1;
				}
			}
		}
		const shape = diceMask(winInk, t.glyph);
		const color = nccChannels(win, t.rgb, t.mask);
		best = Math.max(best, 0.55 * shape + 0.45 * color);
	}
	return best;
}