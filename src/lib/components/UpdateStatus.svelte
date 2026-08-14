<script lang="ts">
	import { onMount } from 'svelte';
	import { check } from '@tauri-apps/plugin-updater';
	import { relaunch } from '@tauri-apps/plugin-process';
	import { CheckCircle2, TriangleAlert } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { checkForUpdates, type UpdateCheck } from '$lib/update';

	let result = $state<UpdateCheck | null>(null);
	let checking = $state(false);
	let updateOpen = $state(false);
	let installError = $state('');

	async function refresh() {
		if (checking) return;
		checking = true;
		installError = '';
		result = await checkForUpdates();
		checking = false;
	}

	onMount(() => {
		void refresh();
	});

	/** Starts the real updater flow (download, install, restart). */
	async function confirmUpdate() {
		updateOpen = false;
		installError = '';
		checking = true;
		try {
		const update = await check();
			if (!update) {
				checking = false;
				return;
			}
			// Downloads the new bundle, applies it, then relaunches. Database
			// migrations run automatically on the next start.
			await update.downloadAndInstall();
			await relaunch();
		} catch (err) {
			installError = err instanceof Error ? err.message : String(err);
			checking = false;
		}
	}

	function onClick() {
		if (checking) return;
		if (result?.available) {
			updateOpen = true;
		} else {
			void refresh();
		}
	}
</script>

<div class="border-t border-neutral-100 px-3 py-2.5">
	<button
		type="button"
		onclick={onClick}
		title={result?.available
			? `Update to v${result.latest}`
			: result?.error
				? `${result.error} Click to try again.`
				: result?.noReleases
					? 'No releases published yet. Click to check again.'
					: 'Check for updates'}
		class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-100"
	>
		{#if checking}
			<span class="size-2 shrink-0 animate-pulse rounded-full bg-neutral-400"></span>
		{:else if result?.available}
			<span class="size-2 shrink-0 rounded-full bg-indigo-500"></span>
		{:else if result?.error}
			<TriangleAlert size={13} class="shrink-0 text-amber-500" />
		{:else if result?.noReleases}
			<span class="size-2 shrink-0 rounded-full bg-neutral-300"></span>
		{:else}
			<CheckCircle2 size={13} class="shrink-0 text-emerald-500" />
		{/if}
		<span class="min-w-0 flex-1 truncate text-xs font-medium text-neutral-600">
			v{result?.current ?? '…'}
		</span>
		<span class="shrink-0 text-[10px] text-neutral-400">
			{#if checking}
				Checking…
			{:else if result?.available}
				{result.latest} available
			{:else if result?.error}
				Check failed
			{:else if result?.noReleases}
				No releases yet
			{:else}
				Up to date
			{/if}
		</span>
	</button>
	{#if installError}
		<p class="px-2 pt-1 text-[10px] text-red-600">{installError}</p>
	{:else if result?.error}
		<p class="px-2 pt-1 text-[10px] text-amber-600">{result.error}</p>
	{/if}
</div>

<ConfirmDialog
	open={updateOpen}
	title={`Update to v${result?.latest ?? ''}?`}
	message={`A new version of Workmaster is available. It will be downloaded and installed, then the app restarts. Any in-progress work is saved in the database.`}
	confirmLabel="Update now"
	onConfirm={confirmUpdate}
	onCancel={() => (updateOpen = false)}
/>
