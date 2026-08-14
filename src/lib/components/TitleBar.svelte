<script lang="ts">
	import { Copy, Minus, Square, X } from '@lucide/svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { onMount } from 'svelte';

	const win = getCurrentWindow();

	// macOS keeps the native traffic lights (titleBarStyle: Overlay), so the
	// custom minimize/maximize/close buttons only apply on Windows & Linux.
	const isMac = $derived(
		typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
	);

	let maximized = $state(false);

	onMount(() => {
		let disposed = false;
		let unlisten: (() => void) | undefined;
		win
			.isMaximized()
			.then((value) => {
				if (!disposed) maximized = value;
			})
			.catch(() => {});
		win
			.onResized(() => {
				win
					.isMaximized()
					.then((value) => {
						if (!disposed) maximized = value;
					})
					.catch(() => {});
			})
			.then((fn) => {
				if (disposed) fn();
				else unlisten = fn;
			})
			.catch(() => {});
		return () => {
			disposed = true;
			unlisten?.();
		};
	});

	function minimize() {
		win.minimize().catch(() => {});
	}

	function toggleMaximize() {
		win.toggleMaximize().catch(() => {});
	}

	function close() {
		win.close().catch(() => {});
	}
</script>

<div
	data-tauri-drag-region="deep"
	class="flex h-9 w-full select-none items-stretch justify-between text-neutral-500"
>
	<div class="flex h-full items-center gap-2 {isMac ? 'pl-20' : 'pl-3.5'} pr-4">
		<img
			src="/app-icon.png"
			alt="Workmaster"
			draggable="false"
			class="size-4.5 rounded-[5px]"
		/>
		<span class="text-[11px] font-semibold tracking-tight text-neutral-600">Workmaster</span>
	</div>

	{#if !isMac}
		<div class="flex h-full items-stretch">
		<button
			type="button"
			aria-label="Minimize"
			onclick={minimize}
			class="flex w-11 items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-indigo-500"
		>
			<Minus size={14} strokeWidth={2} />
		</button>
		<button
			type="button"
			aria-label={maximized ? 'Restore' : 'Maximize'}
			onclick={toggleMaximize}
			class="flex w-11 items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-indigo-500"
		>
			{#if maximized}
				<Copy size={12} strokeWidth={2} />
			{:else}
				<Square size={11} strokeWidth={2} />
			{/if}
		</button>
		<button
			type="button"
			aria-label="Close"
			onclick={close}
			class="flex w-11 items-center justify-center text-neutral-500 transition-colors hover:bg-red-600 hover:text-white focus-visible:outline-2 focus-visible:outline-indigo-500"
		>
			<X size={14} strokeWidth={2} />
		</button>
		</div>
	{/if}
</div>
