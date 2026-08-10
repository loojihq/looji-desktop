<script lang="ts">
	import Modal from './Modal.svelte';
	import { addMember, updateMember } from '$lib/store.svelte';
	import type { Member } from '$lib/types';

	let {
		open,
		member = null,
		onClose
	}: { open: boolean; member?: Member | null; onClose: () => void } = $props();

	const roles = ['Engineering', 'Design', 'Product', 'Marketing', 'Operations'];

	let name = $state('');
	let email = $state('');
	let role = $state('Engineering');
	let error = $state('');

	$effect(() => {
		if (!open) return;
		name = member?.name ?? '';
		email = member?.email ?? '';
		role = member?.role ?? 'Engineering';
	});

	async function handleSubmit() {
		if (!name.trim() || !email.trim()) return;
		error = '';
		try {
			const payload = { name: name.trim(), email: email.trim(), role };
			if (member) await updateMember(member.id, payload);
			else await addMember(payload);
			onClose();
		} catch (err) {
			console.error('Failed to save member', err);
			error = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<Modal open={open} title={member ? 'Edit member' : 'Add member'} onClose={onClose}>
	<form class="space-y-4" onsubmit={handleSubmit}>
		<div>
			<label for="member-name" class="mb-1 block text-xs font-medium text-neutral-600">Name</label>
			<input
				id="member-name"
				type="text"
				placeholder="e.g. Jamie Lee"
				class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={name}
				required
			/>
		</div>
		<div>
			<label for="member-email" class="mb-1 block text-xs font-medium text-neutral-600">Email</label>
			<input
				id="member-email"
				type="email"
				placeholder="jamie@company.com"
				class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={email}
				required
			/>
		</div>
		<div>
			<label for="member-role" class="mb-1 block text-xs font-medium text-neutral-600">Role</label>
			<select
				id="member-role"
				class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={role}
			>
				{#each roles as r (r)}
					<option value={r}>{r}</option>
				{/each}
			</select>
		</div>
		{#if error}
			<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
		{/if}
		<div class="flex justify-end gap-2 pt-2">
			<button
				type="button"
				class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
				onclick={onClose}
			>
				Cancel
			</button>
			<button
				type="submit"
				class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
			>
				{member ? 'Save changes' : 'Add member'}
			</button>
		</div>
	</form>
</Modal>
