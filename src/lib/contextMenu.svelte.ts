import { goto } from '$app/navigation';
import {
	ClipboardPaste,
	Copy,
	ExternalLink,
	FolderPlus,
	Link2,
	ListPlus,
	Maximize2,
	Minimize2,
	RefreshCw,
	Scissors,
	Settings,
	TextSelect,
	X
} from '@lucide/svelte';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Component } from 'svelte';

export type ContextMenuItem =
	| {
			type: 'item';
			id: string;
			label: string;
			icon?: Component;
			shortcut?: string;
			danger?: boolean;
			disabled?: boolean;
			action: () => void;
	  }
	| { type: 'divider' };

export type ContextMenuState = {
	open: boolean;
	x: number;
	y: number;
	items: ContextMenuItem[];
};

/** The single, app-wide context menu. `open: false` means closed. */
export const menu = $state<ContextMenuState>({
	open: false,
	x: 0,
	y: 0,
	items: []
});

export function closeMenu() {
	menu.open = false;
}

export function openAt(x: number, y: number, target: EventTarget | null) {
	const el = target instanceof Element ? target : null;
	const items = buildItems(el);
	if (items.length > 0) {
		menu.x = x;
		menu.y = y;
		menu.items = items;
		menu.open = true;
	}
}

const isTauri = () => '__TAURI_INTERNALS__' in window;

function exec(command: string) {
	document.execCommand(command);
}

function copy() {
	const selection = window.getSelection();
	if (selection && !selection.isCollapsed) {
		const text = selection.toString();
		if (text) {
			navigator.clipboard.writeText(text).catch(() => {});
			return;
		}
	}
	exec('copy');
}

function hasSelection(): boolean {
	const s = window.getSelection();
	return !!s && !s.isCollapsed;
}

function windowControls(): ContextMenuItem[] {
	return [
		{
			type: 'item',
			id: 'maximize',
			label: 'Maximize',
			icon: Maximize2,
			action: () => windowOp('toggleMaximize')
		},
		{
			type: 'item',
			id: 'minimize',
			label: 'Minimize',
			icon: Minimize2,
			action: () => windowOp('minimize')
		},
		{ type: 'divider' },
		{
			type: 'item',
			id: 'close',
			label: 'Close',
			icon: X,
			danger: true,
			action: () => windowOp('close')
		}
	];
}

function windowOp(op: 'toggleMaximize' | 'minimize' | 'close') {
	if (!isTauri()) return;
	try {
		const win = getCurrentWindow();
		const promise =
			op === 'toggleMaximize' ? win.toggleMaximize() : op === 'minimize' ? win.minimize() : win.close();
		promise.catch(() => {});
	} catch {
		// Not running inside Tauri (plain browser preview) - ignore.
	}
}

function textItems(editable: boolean, hasText: boolean): ContextMenuItem[] {
	return [
		{
			type: 'item',
			id: 'cut',
			label: 'Cut',
			icon: Scissors,
			shortcut: 'Ctrl+X',
			disabled: !editable,
			action: () => exec('cut')
		},
		{
			type: 'item',
			id: 'copy',
			label: 'Copy',
			icon: Copy,
			shortcut: 'Ctrl+C',
			disabled: !editable && !hasText,
			action: copy
		},
		{
			type: 'item',
			id: 'paste',
			label: 'Paste',
			icon: ClipboardPaste,
			shortcut: 'Ctrl+V',
			disabled: !editable,
			action: () => exec('paste')
		},
		{ type: 'divider' },
		{
			type: 'item',
			id: 'select-all',
			label: 'Select all',
			icon: TextSelect,
			shortcut: 'Ctrl+A',
			action: () => exec('selectAll')
		}
	];
}

function linkItems(link: HTMLAnchorElement): ContextMenuItem[] {
	const href = link.href;
	return [
		{
			type: 'item',
			id: 'open-link',
			label: 'Open link',
			icon: ExternalLink,
			action: () => {
				if (isTauri()) {
					import('@tauri-apps/plugin-opener')
						.then(({ openUrl }) => openUrl(href).catch(() => {}))
						.catch(() => {});
				} else {
					window.open(href, '_blank', 'noopener');
				}
			}
		},
		{
			type: 'item',
			id: 'copy-link',
			label: 'Copy link address',
			icon: Link2,
			action: () => navigator.clipboard.writeText(href).catch(() => {})
		}
	];
}

function defaultItems(): ContextMenuItem[] {
	return [
		{
			type: 'item',
			id: 'new-project',
			label: 'New project',
			icon: FolderPlus,
			action: () => goto('/projects')
		},
		{
			type: 'item',
			id: 'new-task',
			label: 'New task',
			icon: ListPlus,
			action: () => goto('/tasks')
		},
		{ type: 'divider' },
		{
			type: 'item',
			id: 'settings',
			label: 'Settings',
			icon: Settings,
			action: () => goto('/settings')
		},
		{
			type: 'item',
			id: 'reload',
			label: 'Reload',
			icon: RefreshCw,
			shortcut: 'Ctrl+R',
			action: () => location.reload()
		}
	];
}

function buildItems(target: Element | null): ContextMenuItem[] {
	if (!target) return defaultItems();

	// Right-click on the custom title bar → window controls.
	if (target.closest('[data-tauri-drag-region]')) return windowControls();

	// Right-click inside an editable field → editing menu.
	const editable = target.closest('input, textarea, [contenteditable]');
	if (editable) return textItems(true, hasSelection());

	// Right-click over an existing page selection → editing menu.
	if (hasSelection()) return textItems(false, true);

	// Right-click on a link.
	const link = target.closest('a');
	if (link) return linkItems(link as HTMLAnchorElement);

	return defaultItems();
}
