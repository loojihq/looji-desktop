import { getVersion } from '@tauri-apps/api/app';
import { fetch } from '@tauri-apps/plugin-http';

/** The GitHub repository that hosts releases. */
const REPO = 'danielkosgei/workmaster';

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
	error?: string;
};

/**
 * Compares the running app version against the latest GitHub release.
 * Never throws: failures are reported on the result so the UI can degrade.
 */
export async function checkForUpdates(): Promise<UpdateCheck> {
	const current = await getVersion();
	try {
		const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
			headers: {
				Accept: 'application/vnd.github+json',
				'User-Agent': 'workmaster'
			}
		});
		if (!response.ok) {
			return {
				current,
				latest: null,
				available: false,
				error: `Update check failed (HTTP ${response.status}).`
			};
		}
		const data = (await response.json()) as { tag_name?: string };
		const latest = (data.tag_name ?? '').replace(/^v/, '');
		if (!latest) {
			return { current, latest: null, available: false, error: 'No releases found.' };
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
