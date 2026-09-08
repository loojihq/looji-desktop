import { getVersion } from '@tauri-apps/api/app';
import { fetch } from '@tauri-apps/plugin-http';

/** The GitHub repository that hosts releases. */
const REPO = 'loojihq/looji-desktop';

const API = `https://api.github.com/repos/${REPO}/releases`;

/** Compares two semver strings (with or without a leading "v"). Returns <0, 0 or >0. */
export function compareSemver(a: string, b: string): number {
	const pa = a.replace(/^v/, '').split('.').map(Number);
	const pb = b.replace(/^v/, '').split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x !== y) return x - y;
	}
	return 0;
}

export type UpdateCheck = {
	current: string;
	latest: string | null;
	available: boolean;
	/** Set when the feed could not be checked at all (network, auth, 404). */
	error?: string;
	/** True when the repo is reachable but has no published releases yet. */
	noReleases?: boolean;
};

/**
 * Compares the running app version against the latest GitHub release.
 * Never throws: failures are reported on the result so the UI can degrade.
 */
export async function checkForUpdates(): Promise<UpdateCheck> {
	const current = await getVersion();
	try {
		// `releases/latest` returns 404 both when the repo is unreachable AND when
		// there are simply no published releases yet, so on a 404 we fall back to
		// the full releases list (which returns an empty array with HTTP 200 when
		// the repo is fine) to tell the two apart.
		let response = await fetch(`${API}/latest`, {
			headers: {
				Accept: 'application/vnd.github+json',
				'User-Agent': 'looji'
			}
		});
		let data: { tag_name?: string } | null = null;
		if (response.ok) {
			data = (await response.json()) as { tag_name?: string };
		} else if (response.status === 404) {
			response = await fetch(API, {
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'looji'
				}
			});
			if (response.ok) {
				const list = (await response.json()) as { tag_name?: string }[];
				if (list.length === 0) {
					return { current, latest: null, available: false, noReleases: true };
				}
				data = list[0];
			}
		}
		if (!response.ok) {
			const message =
				response.status === 404
					? 'Release feed not reachable (HTTP 404) - the repository may be private or renamed.'
					: `Update check failed (HTTP ${response.status}).`;
			return { current, latest: null, available: false, error: message };
		}
		const latest = (data?.tag_name ?? '').replace(/^v/, '');
		if (!latest) {
			return { current, latest: null, available: false, noReleases: true };
		}
		return { current, latest, available: compareSemver(latest, current) > 0 };
	} catch (err) {
		return {
			current,
			latest: null,
			available: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
