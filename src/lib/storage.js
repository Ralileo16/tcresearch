const KEY_PREFIX = 'tcr-search:state:';

function makeKey(version) {
	return `${KEY_PREFIX}${version}`;
}

// Persists the research selections per Thaumcraft version so a reload (or a
// switch back to a version) restores what you had last time.
export function loadState(version) {
	try {
		const raw = localStorage.getItem(makeKey(version));
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

export function saveState(version, state) {
	try {
		localStorage.setItem(makeKey(version), JSON.stringify(state));
	} catch {
		// Storage may be unavailable (private mode, quota) — fail silently.
	}
}