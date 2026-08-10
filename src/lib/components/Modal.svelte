<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		open,
		title,
		onClose,
		children
	}: { open: boolean; title: string; onClose: () => void; children: Snippet } = $props();

	$effect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div class="absolute inset-0 bg-neutral-900/50" role="presentation" onclick={onClose}></div>
		<div
			class="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-label={title}
		>
			<header class="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
				<h2 class="font-semibold tracking-tight text-neutral-900">{title}</h2>
				<button
					type="button"
					class="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
					aria-label="Close"
					onclick={onClose}
				>
					<X size={18} />
				</button>
			</header>
			<div class="overflow-y-auto px-5 py-4">
				{@render children()}
			</div>
		</div>
	</div>
{/if}
