const KEY_PREFIX = 'tcr-search:state:';
export const VERSION_KEY = 'tcr-search:version';

// Prefer localStorage; fall back to cookies when it's unavailable (private
// mode, disabled storage, file://) so state still survives a page reload.
function backend() {
	try {
		const probe = '__tcr_storage_probe__';
		window.localStorage.setItem(probe, '1');
		window.localStorage.removeItem(probe);
		return 'local';
	} catch {
		return 'cookie';
	}
}

let cachedBackend = null;
function pick() {
	if (!cachedBackend) cachedBackend = backend();
	return cachedBackend;
}

function escapeKey(key) {
	return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cookieGet(key) {
	const match = document.cookie.match(
		new RegExp('(?:^|; )' + escapeKey(key) + '=([^;]*)'),
	);
	if (!match) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return null;
	}
}

function cookieSet(key, value) {
	try {
		const encoded = encodeURIComponent(value);
		document.cookie = `${key}=${encoded}; path=/; max-age=31536000; SameSite=Lax`;
	} catch {
		// Storage may be unavailable entirely — fail silently.
	}
}

export function persistGet(key) {
	if (pick() === 'local') return window.localStorage.getItem(key);
	return cookieGet(key);
}

export function persistSet(key, value) {
	if (pick() === 'local') {
		try {
			window.localStorage.setItem(key, value);
		} catch {
			// Quota exceeded — fall back to cookies for small payloads only.
			cookieSet(key, value);
		}
		return;
	}
	cookieSet(key, value);
}

function makeKey(version) {
	return `${KEY_PREFIX}${version}`;
}

// Persists the research selections per Thaumcraft version so a reload (or a
// switch back to a version) restores what you had last time.
export function loadState(version) {
	try {
		const raw = persistGet(makeKey(version));
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

export function saveState(version, state) {
	try {
		persistSet(makeKey(version), JSON.stringify(state));
	} catch {
		// Ignore: nothing sensible to do if storage is unavailable.
	}
}