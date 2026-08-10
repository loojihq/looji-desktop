<script lang="ts">
	import { ArrowDown, ArrowUp, Flame, Minus } from '@lucide/svelte';
	import { priorityStyles, projectStatusStyles, taskStatusStyles } from '$lib/badges';
	import type { Priority, ProjectStatus, TaskStatus } from '$lib/types';

	type Variant = 'project' | 'task' | 'priority';

	let { variant, value }: { variant: Variant; value: ProjectStatus | TaskStatus | Priority } =
		$props();

	const style = $derived(
		variant === 'project'
			? projectStatusStyles[value as ProjectStatus]
			: variant === 'task'
				? taskStatusStyles[value as TaskStatus]
				: priorityStyles[value as Priority]
	);
</script>

<span
	class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap {style.bg} {style.text}"
>
	{#if variant === 'priority'}
		{#if value === 'urgent'}
			<Flame size={12} strokeWidth={2.5} />
		{:else if value === 'high'}
			<ArrowUp size={12} strokeWidth={2.5} />
		{:else if value === 'medium'}
			<Minus size={12} strokeWidth={2.5} />
		{:else}
			<ArrowDown size={12} strokeWidth={2.5} />
		{/if}
	{/if}
	{style.label}
</span>
