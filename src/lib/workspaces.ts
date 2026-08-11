import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

/** The default indigo gradient used for tiles without an image. */
export const WORKSPACE_TILE_STYLE = 'background: linear-gradient(135deg, #6366f1, #4338ca)';

/** Fallback content for a tile without an image: the name's initial. */
export function workspaceTileContent(name: string): string {
	return (name.trim().charAt(0) || 'W').toUpperCase();
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

const MAX_ICON_BYTES = 2_000_000;

/**
 * Lets the user pick an image from their machine and returns it as a data URL
 * (embedded, so it survives the DB and works offline). Returns null if cancelled.
 */
export async function pickWorkspaceImage(): Promise<string | null> {
	const selected = await open({
		multiple: false,
		title: 'Choose a workspace icon',
		filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
	});
	if (typeof selected !== 'string' || !selected) return null;
	const bytes = await readFile(selected);
	if (bytes.length > MAX_ICON_BYTES) {
		throw new Error('Image is too large — keep it under 2 MB.');
	}
	const ext = selected.slice(selected.lastIndexOf('.') + 1).toLowerCase();
	const mime =
		ext === 'svg'
			? 'image/svg+xml'
			: ext === 'jpg'
				? 'image/jpeg'
				: `image/${ext}`;
	return `data:${mime};base64,${bytesToBase64(bytes)}`;
}
