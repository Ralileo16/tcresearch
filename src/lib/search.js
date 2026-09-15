import { versions } from '../data/versions.js'
import { addons } from '../data/addons.js'
import { MinHeap } from './heap.js'

// Build an undirected adjacency list from a recipe map
// { compound: [partA, partB] }.
export function buildGraph(combinations) {
	const graph = {};
	const connect = (from, to) => {
		(graph[from] ??= []).push(to);
	};
	for (const [compound, [partA, partB]] of Object.entries(combinations)) {
		connect(compound, partA);
		connect(compound, partB);
		connect(partA, compound);
		connect(partB, compound);
	}
	return graph;
}

// All compound aspects reachable in a combo map (used to tell base aspects
// apart for recipe tooltips).
export function compoundAspects(combinations) {
	return new Set(Object.keys(combinations));
}

// Explosion depth of every aspect from the base (primal) ones: base aspects
// are 0, each compound is 1 + the deepest of its parents. The deeper an
// aspect is, the more expensive it is to re-combine, which lets the search
// prefer simple aspects over sprawling compound chains.
export function aspectDepths(baseAspects, combinations) {
	const levels = new Map();
	for (const a of baseAspects) levels.set(a, 0);
	let changed = true;
	while (changed) {
		changed = false;
		for (const [compound, [partA, partB]] of Object.entries(combinations)) {
			if (levels.has(compound)) continue;
			const la = levels.get(partA);
			const lb = levels.get(partB);
			if (la === undefined || lb === undefined) continue;
			levels.set(compound, 1 + Math.max(la, lb));
			changed = true;
		}
	}
	return levels;
}

// Everything the UI needs for a given Thaumcraft version.
export function buildCatalog(version) {
	const { base_aspects, combinations: versionCombos } = versions[version] ?? {};

	const combinations = { ...versionCombos };
	const addonAspects = new Set();
	for (const addon of Object.values(addons)) {
		const addonCombos = addon.combinations ?? {};
		for (const [compound, parts] of Object.entries(addonCombos)) {
			combinations[compound] = parts;
		}
		for (const aspect of addon.aspects) addonAspects.add(aspect);
	}

	const allAspects = [
		...new Set([...base_aspects, ...Object.keys(combinations)]),
	];
	const graph = buildGraph(combinations);
	const compounds = compoundAspects(combinations);
	const levels = aspectDepths(base_aspects, combinations);

	return { version, base_aspects, combinations, addonAspects, allAspects, graph, compounds, levels };
}

// Finds the lowest-cost path from `from` to `to` with at least `minSteps`
// internal steps. `cost(aspect)` supplies the per-aspect weight, so passing
// stock-aware costs lets the search prefer aspects you possess most. The
// search space is state = (aspect, steps so far); capping the steps keeps the
// Dijkstra-style expansion fast while still allowing detours that are cheaper
// overall.
export function findPath({ from, to, minSteps, graph, cost }) {
	if (from === to || !graph[from] || !graph[to]) return null;

	const maxSteps = minSteps + 14;
	const heap = new MinHeap((a, b) => a.cost - b.cost || a.steps - b.steps);
	const best = new Map();
	const key = (node, steps) => `${node}:${steps}`;

	best.set(key(from, 0), cost(from));
	heap.push({ node: from, steps: 0, cost: cost(from), path: [from] });

	while (heap.size > 0) {
		const current = heap.pop();
		if (current.cost > (best.get(key(current.node, current.steps)) ?? Infinity)) continue;

		if (current.node === to && current.steps > minSteps) return current.path;
		if (current.steps >= maxSteps) continue;

		for (const neighbor of graph[current.node] ?? []) {
			const steps = current.steps + 1;
			const nextCost = current.cost + cost(neighbor);
			const stateKey = key(neighbor, steps);
			if (nextCost >= (best.get(stateKey) ?? Infinity)) continue;
			best.set(stateKey, nextCost);
			heap.push({ node: neighbor, steps, cost: nextCost, path: [...current.path, neighbor] });
		}
	}
	return null;
}

// Collects how often each internal aspect is used plus the total step count,
// for the "Aspects used" summary of a result.
export function summarizePath(path) {
	const counts = {};
	let steps = 0;
	for (let i = 1; i < path.length - 1; i++) {
		counts[path[i]] = (counts[path[i]] ?? 0) + 1;
		steps++;
	}
	return { counts, steps };
}