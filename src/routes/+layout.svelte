<script lang="ts">
	import { Menu, X } from '@lucide/svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Sidebar from '$lib/components/Sidebar.svelte';

	let { children } = $props();

	let mobileOpen = $state(false);

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
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen">
	<div class="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:block lg:w-64">
		<Sidebar />
	</div>

	{#if mobileOpen}
		<div class="fixed inset-0 z-50 lg:hidden">
			<div
				class="absolute inset-0 bg-neutral-900/50"
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
			{@render children()}
		</main>
	</div>
</div>
