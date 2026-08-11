<script lang="ts">
	import { WORKSPACE_TILE_STYLE, workspaceTileContent } from '$lib/workspaces';

	let {
		icon,
		name,
		class: className = 'size-8'
	}: {
		icon: string;
		name: string;
		class?: string;
	} = $props();
</script>

<span
	class="flex shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-bold text-white {className}"
	style={icon ? 'background: transparent' : WORKSPACE_TILE_STYLE}
>
	{#if icon}
		<img src={icon} alt="" class="size-full object-cover" />
	{:else}
		{workspaceTileContent(name)}
	{/if}
</span>
