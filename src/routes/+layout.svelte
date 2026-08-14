	<script lang="ts">
	import { Menu, X } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import './layout.css';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TitleBar from '$lib/components/TitleBar.svelte';
	import { applyTheme, initStore, runAutomations, status } from '$lib/store.svelte';

	let { children } = $props();

	let mobileOpen = $state(false);

	// Only the desktop shell gets the custom title bar; the plain browser (dev
	// preview) keeps the native window chrome and no extra top padding.
	const isDesktop = $derived(
		typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
	);

	$effect(() => {
		initStore();
	});

	$effect(() => {
		applyTheme();
	});

	$effect(() => {
		const timer = setInterval(() => runAutomations(), 30 * 60 * 1000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (!mobileOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') mobileOpen = false;
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" />
</svelte:head>

<div class="flex h-screen flex-col overflow-hidden bg-surface">
	{#if isDesktop}
		<TitleBar />
	{/if}

	<div class="flex min-h-0 flex-1">
		<div class="hidden w-64 shrink-0 lg:block">
			<Sidebar />
		</div>

		<div class="flex min-w-0 flex-1 flex-col">
			<header
				class="flex items-center gap-3 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden"
			>
				<button
					type="button"
					class="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-200"
					aria-label="Open menu"
					onclick={() => (mobileOpen = true)}
				>
					<Menu size={20} />
				</button>
				<span class="font-semibold tracking-tight text-neutral-900">Workmaster</span>
			</header>

			<div class="min-h-0 w-full flex-1 pl-1 pt-1 pb-1 sm:pl-1.5 sm:pt-1.5 sm:pb-1.5">
				<div
					class="flex h-full flex-col overflow-hidden rounded-l-2xl bg-background shadow-sm"
				>
					<main class="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
				{#if status.error}
					<div
						class="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-sm text-red-700"
					>
						<p class="font-semibold">Could not open the database</p>
						<p class="mt-1">{status.error}</p>
					</div>
				{:else if !status.ready}
					<div transition:fade={{ duration: 200 }} class="flex flex-col items-center justify-center py-32">
						<img
							src="/app-icon.png"
							alt="Workmaster"
							draggable="false"
							class="size-16 rounded-2xl shadow-lg shadow-neutral-900/15"
						/>
						<p class="mt-4 text-sm font-semibold text-neutral-700">Workmaster</p>
						<p class="mt-1 text-xs text-neutral-400">Loading workspace</p>
						<div class="mt-4 flex items-center gap-1">
							<span class="size-1.5 animate-pulse rounded-full bg-indigo-400"></span>
							<span
								class="size-1.5 animate-pulse rounded-full bg-indigo-500"
								style="animation-delay: 150ms"
							></span>
							<span
								class="size-1.5 animate-pulse rounded-full bg-indigo-600"
								style="animation-delay: 300ms"
							></span>
						</div>
					</div>
				{:else}
					<div transition:fade={{ duration: 250 }}>
						{@render children()}
					</div>
				{/if}
				</main>
				</div>
				</div>
			</div>
		</div>
	</div>

	{#if mobileOpen}
		<div class="fixed inset-0 z-50 lg:hidden">
			<div
				class="absolute inset-0 bg-overlay"
				role="presentation"
				onclick={() => (mobileOpen = false)}
			></div>
			<div class="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
				<button
					type="button"
					class="absolute top-4 right-3 z-10 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"
					aria-label="Close menu"
					onclick={() => (mobileOpen = false)}
				>
					<X size={20} />
				</button>
				<Sidebar onNavigate={() => (mobileOpen = false)} />
			</div>
		</div>
	{/if}

<ContextMenu />
