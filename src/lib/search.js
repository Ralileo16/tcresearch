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

	return { version, base_aspects, combinations, addonAspects, allAspects, graph, compounds };
}

// Weighted A*-style search that finds the lowest-cost path from `from` to `to`
// with at least `minSteps` internal steps. Available aspects cost 1, disabled
// (unavailable) aspects cost 100, so the search leans on aspects the player
// actually has access to. Mirrors the original script's behaviour.
export function findPath({ from, to, minSteps, graph, isAvailable }) {
	if (from === to || !graph[from] || !graph[to]) return null;
	const getWeight = (aspect) => (isAvailable(aspect) ? 1 : 100);
	const visited = new Map();
	const queue = new MinHeap((a, b) => a.length - b.length);
	queue.push({ path: [from], length: 0 });

	while (queue.size > 0) {
		const element = queue.pop();
		const node = element.path.pop();
		const edgesBefore = element.path.length;
		const seen = visited.get(node);
		if (seen && seen.includes(edgesBefore)) continue;

		element.path.push(node);
		if (node === to && element.path.length > minSteps + 1) {
			return element.path;
		}

		for (const neighbor of graph[node] ?? []) {
			queue.push({
				path: [...element.path, neighbor],
				length: element.length + getWeight(neighbor),
			});
		}

		if (!seen) visited.set(node, []);
		visited.get(node).push(element.path.length - 1);
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