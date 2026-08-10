<script lang="ts">
	import type { Member } from '$lib/types';
	import { initials } from '$lib/utils';

	let {
		member,
		size = 'md',
		ring = false
	}: { member: Member; size?: 'xs' | 'sm' | 'md' | 'lg'; ring?: boolean } = $props();

	const sizes: Record<string, string> = {
		xs: 'size-5 text-[10px]',
		sm: 'size-6 text-[11px]',
		md: 'size-8 text-xs',
		lg: 'size-10 text-sm'
	};
</script>

<span
	class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none {member.color} {sizes[
		size
	]} {ring ? 'ring-2 ring-white' : ''}"
	title={member.name}
>
	{initials(member.name)}
</span>
