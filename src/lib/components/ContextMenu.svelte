<script lang="ts">
	import { onMount } from 'svelte';
	import { closeMenu, menu, openAt } from '$lib/contextMenu.svelte';

	let rootEl = $state<HTMLDivElement | null>(null);
	let activeIndex = $state(-1);
	let placed = $state({ x: 0, y: 0 });
	let ready = $state(false);

	// Measure the rendered menu once so it never runs off-screen, and keep it
	// invisible for that one frame to avoid a visible jump.
	$effect(() => {
		if (!menu.open) return;
		ready = false;
		activeIndex = -1;
		const raf = requestAnimationFrame(() => {
			if (!rootEl || !menu.open) return;
			const rect = rootEl.getBoundingClientRect();
			const vw = document.documentElement.clientWidth;
			const vh = document.documentElement.clientHeight;
			placed = {
				x: Math.max(8, Math.min(menu.x, vw - rect.width - 8)),
				y: Math.max(8, Math.min(menu.y, vh - rect.height - 8))
			};
			ready = true;
		});
		return () => cancelAnimationFrame(raf);
	});

	// Keyboard navigation: arrows, Enter/Space, Escape, Home/End.
	$effect(() => {
		if (!menu.open) return;
		const items = menu.items;
		const itemIndices = items
			.map((item, i) => (item.type === 'item' ? i : -1))
			.filter((i) => i >= 0);
		if (itemIndices.length === 0) return;

		const onKey = (event: KeyboardEvent) => {
			const current = itemIndices.indexOf(activeIndex);
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				activeIndex = itemIndices[(current + 1) % itemIndices.length];
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				activeIndex = itemIndices[(current - 1 + itemIndices.length) % itemIndices.length];
			} else if (event.key === 'Home') {
				event.preventDefault();
				activeIndex = itemIndices[0];
			} else if (event.key === 'End') {
				event.preventDefault();
				activeIndex = itemIndices[itemIndices.length - 1];
			} else if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				const item = items[activeIndex];
				if (item?.type === 'item' && !item.disabled) {
					item.action();
					closeMenu();
				}
			} else if (event.key === 'Escape') {
				event.preventDefault();
				closeMenu();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	onMount(() => {
		const onContext = (event: MouseEvent) => {
			// Right-clicking the menu itself just closes it.
			event.preventDefault();
			if (rootEl?.contains(event.target as Node)) {
				closeMenu();
				return;
			}
			openAt(event.clientX, event.clientY, event.target);
		};
		const close = () => closeMenu();
		const onPointerDown = (event: PointerEvent) => {
			if (rootEl && !rootEl.contains(event.target as Node)) closeMenu();
		};
		window.addEventListener('contextmenu', onContext);
		window.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('blur', close);
		window.addEventListener('resize', close);
		window.addEventListener('scroll', close, true);
		return () => {
			window.removeEventListener('contextmenu', onContext);
			window.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('blur', close);
			window.removeEventListener('resize', close);
			window.removeEventListener('scroll', close, true);
		};
	});
</script>

{#if menu.open}
	<div
		bind:this={rootEl}
		role="menu"
		tabindex="-1"
		aria-orientation="vertical"
		class="fixed z-[9999] min-w-52 rounded-xl border border-neutral-200 bg-surface p-1.5 shadow-2xl shadow-neutral-900/15 transition-opacity duration-100"
		class:opacity-100={ready}
		class:opacity-0={!ready}
		style="left: {placed.x}px; top: {placed.y}px;"
		onmouseleave={() => (activeIndex = -1)}
	>
		{#each menu.items as item, i (item.type === 'divider' ? `divider-${i}` : item.id)}
			{#if item.type === 'divider'}
				<div class="mx-2 my-1 h-px bg-neutral-200"></div>
			{:else}
				{@const Icon = item.icon}
				<button
					type="button"
					role="menuitem"
					class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 {item.danger
						? 'text-red-600 hover:bg-red-50 hover:text-red-700'
						: 'text-neutral-600 hover:bg-indigo-50 hover:text-indigo-700'} {activeIndex === i
						? 'bg-indigo-50 text-indigo-700'
						: ''}"
					disabled={item.disabled}
					onclick={() => {
						item.action();
						closeMenu();
					}}
					onpointerenter={() => (activeIndex = i)}
				>
					{#if Icon}
						<Icon size={15} strokeWidth={2} />
					{:else}
						<span class="w-[15px] shrink-0"></span>
					{/if}
					<span class="flex-1 truncate">{item.label}</span>
					{#if item.shortcut}
						<span class="text-xs font-normal text-neutral-400">{item.shortcut}</span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}
