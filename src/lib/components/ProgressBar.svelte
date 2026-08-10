<script lang="ts">
	let { value, color = 'bg-indigo-500' }: { value: number; color?: string } = $props();

	const clamped = $derived(Math.min(100, Math.max(0, Math.round(value))));
</script>

<div
	class="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/60"
	role="progressbar"
	aria-valuenow={clamped}
	aria-valuemin={0}
	aria-valuemax={100}
>
	<div
		class="h-full rounded-full transition-all duration-300 {color}"
		style="width: {clamped}%"
	></div>
</div>
