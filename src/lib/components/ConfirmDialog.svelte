<script lang="ts">
	import { Trash2 } from '@lucide/svelte';

	let {
		open,
		title,
		message,
		confirmLabel = 'Delete',
		onConfirm,
		onCancel
	}: {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();

	$effect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onCancel();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div class="absolute inset-0 bg-neutral-900/50" role="presentation" onclick={onCancel}></div>
		<div
			class="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
			role="alertdialog"
			aria-modal="true"
			aria-label={title}
		>
			<div class="flex items-start gap-3">
				<span
					class="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"
				>
					<Trash2 size={18} />
				</span>
				<div>
					<h2 class="font-semibold tracking-tight text-neutral-900">{title}</h2>
					<p class="mt-1 text-sm text-neutral-500">{message}</p>
				</div>
			</div>
			<div class="mt-5 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
					onclick={onCancel}
				>
					Cancel
				</button>
				<button
					type="button"
					class="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
					onclick={onConfirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
