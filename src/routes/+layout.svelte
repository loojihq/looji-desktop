<script lang="ts">
	import { Menu, X } from '@lucide/svelte';
	import './layout.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { applyTheme, initStore, runAutomations, status } from '$lib/store.svelte';

	let { children } = $props();

	let mobileOpen = $state(false);

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

<div class="min-h-screen">
	<div class="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:block lg:w-64">
		<Sidebar />
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

	<div class="lg:pl-64">
		<header
			class="sticky top-0 z-40 flex items-center gap-3 border-b border-neutral-200 bg-neutral-100/90 px-4 py-3 backdrop-blur lg:hidden"
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

		<main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
			{#if status.error}
				<div
					class="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-sm text-red-700"
				>
					<p class="font-semibold">Could not open the database</p>
					<p class="mt-1">{status.error}</p>
				</div>
			{:else if !status.ready}
				<div class="flex flex-col items-center justify-center py-24">
					<span class="size-8 animate-pulse rounded-full bg-indigo-200"></span>
					<p class="mt-3 text-sm text-neutral-400">Loading workspace</p>
				</div>
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>
</div>
