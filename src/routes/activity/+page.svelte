<script lang="ts">
	import { User } from '@lucide/svelte';
	import { auditLog } from '$lib/store.svelte';
	import { relativeTime } from '$lib/utils';

	let entityFilter = $state<'all' | 'project' | 'task' | 'member' | 'workspace' | 'settings'>(
		'all'
	);

	const entityStyles: Record<string, { label: string; chip: string }> = {
		project: { label: 'Project', chip: 'bg-indigo-50 text-indigo-700' },
		task: { label: 'Task', chip: 'bg-sky-50 text-sky-700' },
		member: { label: 'Member', chip: 'bg-emerald-50 text-emerald-700' },
		workspace: { label: 'Workspace', chip: 'bg-violet-50 text-violet-700' },
		settings: { label: 'Settings', chip: 'bg-neutral-100 text-neutral-600' },
		activity: { label: 'System', chip: 'bg-neutral-100 text-neutral-600' }
	};

	const actionStyles: Record<string, { label: string; chip: string }> = {
		created: { label: 'Created', chip: 'bg-emerald-50 text-emerald-700' },
		updated: { label: 'Updated', chip: 'bg-sky-50 text-sky-700' },
		moved: { label: 'Moved', chip: 'bg-violet-50 text-violet-700' },
		completed: { label: 'Completed', chip: 'bg-emerald-50 text-emerald-700' },
		reopened: { label: 'Reopened', chip: 'bg-amber-50 text-amber-700' },
		deleted: { label: 'Deleted', chip: 'bg-red-50 text-red-700' },
		removed: { label: 'Removed', chip: 'bg-red-50 text-red-700' },
		'auto-moved': { label: 'Auto', chip: 'bg-amber-50 text-amber-700' }
	};

	const tabs = $derived([
		{ value: 'all', label: 'All', count: auditLog.length },
		{ value: 'project', label: 'Projects', count: auditLog.filter((a) => a.entityType === 'project').length },
		{ value: 'task', label: 'Tasks', count: auditLog.filter((a) => a.entityType === 'task').length },
		{ value: 'member', label: 'Members', count: auditLog.filter((a) => a.entityType === 'member').length },
		{ value: 'workspace', label: 'Workspaces', count: auditLog.filter((a) => a.entityType === 'workspace').length },
		{ value: 'settings', label: 'Settings', count: auditLog.filter((a) => a.entityType === 'settings').length }
	] as const);

	const filtered = $derived(
		entityFilter === 'all' ? auditLog : auditLog.filter((a) => a.entityType === entityFilter)
	);
</script>

<svelte:head>
	<title>Activity · Workmaster</title>
</svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Activity</h1>
	<p class="mt-1 text-sm text-neutral-500">
		A complete audit trail of every change in your workspace.
	</p>
</div>

<div class="mb-4 flex flex-wrap items-center gap-2">
	{#each tabs as tab (tab.value)}
		<button
			type="button"
			onclick={() => (entityFilter = tab.value)}
			class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {entityFilter === tab.value
				? 'bg-foreground text-background'
				: 'border border-neutral-200 bg-surface text-neutral-600 hover:bg-neutral-50'}"
		>
			{tab.label}
			<span class="ml-1.5 text-xs text-neutral-400">{tab.count}</span>
		</button>
	{/each}
</div>

<div class="overflow-hidden rounded-xl border border-neutral-200 bg-surface shadow-xs">
	{#if filtered.length === 0}
		<p class="px-6 py-16 text-center text-sm text-neutral-400">
			No activity recorded yet. Changes will show up here.
		</p>
	{:else}
		<ul class="divide-y divide-neutral-100">
			{#each filtered as entry (entry.id)}
				<li class="flex gap-3 px-5 py-4">
					<span
						class="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-500"
					>
						<User size={12} />
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="rounded-md px-1.5 py-0.5 text-[11px] font-medium {actionStyles[entry.action]?.chip ?? 'bg-neutral-100 text-neutral-600'}">
								{actionStyles[entry.action]?.label ?? entry.action}
							</span>
							<span class="rounded-md px-1.5 py-0.5 text-[11px] font-medium {entityStyles[entry.entityType]?.chip ?? 'bg-neutral-100 text-neutral-600'}">
								{entityStyles[entry.entityType]?.label ?? entry.entityType}
							</span>
							<span class="text-sm text-neutral-400">{relativeTime(entry.time)}</span>
						</div>
						<p class="mt-1 text-sm font-medium text-neutral-800">{entry.summary}</p>
						{#if Object.keys(entry.details).length > 0}
							<div class="mt-1.5 space-y-0.5">
								{#each Object.entries(entry.details) as [field, change] (field)}
									<p class="text-xs text-neutral-500">
										<span class="font-medium text-neutral-600">{field}</span>: {String(
											change.from
										)} → {String(change.to)}
									</p>
								{/each}
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
