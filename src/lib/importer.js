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
const WHITE_MIN = 0.72; // digits are pure white

function lumaOf(r, g, b) {
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function makeMaps(img) {
	const { w, h, data } = img;
	const lum = new Float32Array(w * h);
	const sat = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) {
		const j = i * 4;
		const r = data[j], g = data[j + 1], b = data[j + 2];
		lum[i] = lumaOf(r, g, b);
		sat[i] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
	}
	return { w, h, lum, sat };
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
function sampleGlyph(img, cx, cy, size, n) {
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
				const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
				const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
				if (sat > 0.18 || lum > 0.55) ink[gy * n + gx] = 1;
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

function runeOfTile({ w, sat }, cell, grid) {
	const { x0, x1, y0, y1 } = tileBounds(cell, grid);
	// center of mass of saturated pixels
	let sx = 0, sy = 0, n = 0;
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			if (sat[y * w + x] > SAT_MIN / 255) { sx += x; sy += y; n++; }
		}
	}
	if (n < Math.max(6, (grid.pitch / 48) ** 2 * 8)) return null;
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

function classifyRune(img, cell, grid, templates) {
	const { w, h, sat } = makeMaps(img);
	const rune = runeOfTile({ w, h, data: img.data, sat }, cell, grid);
	if (!rune) return null;
	let best = { name: null, score: -Infinity };
	const sizes = [grid.pitch * 0.6, grid.pitch * 0.68, grid.pitch * 0.76];
	for (const size of sizes) {
		const glyph = sampleGlyph(img, rune.cx, rune.cy, size, 32);
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

function readDigits(img, cell, grid) {
	const { x0, x1, y1 } = tileBounds(cell, grid);
	const p = grid.pitch;
	// number window: right-of-center strip, lower half of the tile
	const nx0 = Math.max(x0, Math.round(cell.x - p * 0.22));
	const nx1 = Math.min(x1, Math.round(cell.x + p * 0.56));
	const ny0 = Math.round(cell.y + p * 0.14);
	const ny1 = Math.min(y1, Math.round(cell.y + p * 0.72));
	const bin = new Uint8Array(img.w * img.h);
	for (let y = ny0; y < ny1; y++) {
		for (let x = nx0; x < nx1; x++) {
			const j = (y * img.w + x) * 4;
			const l = lumaOf(img.data[j], img.data[j + 1], img.data[j + 2]);
			const s = (Math.max(img.data[j], img.data[j + 1], img.data[j + 2]) - Math.min(img.data[j], img.data[j + 1], img.data[j + 2])) / 255;
			if (l > WHITE_MIN && s < 0.2) bin[y * img.w + x] = 1;
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
		return bw2 >= 2 && bh2 >= 4 && bw2 <= p * 0.5 && bh2 <= p * 0.6 && bh2 / bw2 <= 4 && bh2 / bw2 >= 0.6;
	}).sort((a, b) => a.x0 - b.x0);
	if (!glyphs.length) return null;

	const parts = [];
	for (const g of glyphs) {
		// split a possibly-merged pair by the thinnest vertical ink column
		let bw2 = g.x1 - g.x0 + 1, bh2 = g.y1 - g.y0 + 1;
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

export function analyzeScreenshot(img, templates) {
	const grid = detectGrid(img);
	if (!grid) return { error: 'no-grid', grid: null, stocks: null, cells: [] };
	const stocks = {};
	const cells = [];
	for (const col of [...grid.left, ...grid.right]) {
		for (const row of grid.rows) {
			const cell = { x: col, y: row };
			const rune = classifyRune(img, cell, grid, templates);
			const count = rune ? readDigits(img, cell, grid) : null;
			let aspect = rune && rune.score >= 0.3 ? rune.name : null;
			const value = count ? count.value : 0;
			cells.push({
				col,
				row,
				aspect,
				runeScore: rune ? rune.score : null,
				count: value,
				digits: count ? count.digits.map((d) => d.digit).join('') : null,
			});
			if (aspect) stocks[aspect] = value;
		}
	}
	return { grid, stocks, cells };
}

export function makeTemplates(list) {
	const out = [];
	for (const t of list) {
		const w = t.width, h = t.height;
		const { data } = t;
		if (w !== 32 || h !== 32) throw new Error('aspect templates must be 32×32');
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