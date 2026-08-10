<script lang="ts">
	import { Mail, Pencil, Trash2, UserPlus } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import MemberForm from '$lib/components/MemberForm.svelte';
	import { deleteMember, members, tasks } from '$lib/store.svelte';
	import type { Member } from '$lib/types';

	let createOpen = $state(false);
	let editTarget = $state<Member | null>(null);
	let deleteTarget = $state<Member | null>(null);

	async function handleDelete() {
		if (!deleteTarget) return;
		await deleteMember(deleteTarget.id);
		deleteTarget = null;
	}

	const openCountFor = (id: string) =>
		tasks.filter((task) => task.assigneeId === id && task.status !== 'done').length;

	const doneCountFor = (id: string) =>
		tasks.filter((task) => task.assigneeId === id && task.status === 'done').length;

	const onlineCount = $derived(members.filter((member) => member.online).length);
</script>

<svelte:head>
	<title>Team · Workmaster</title>
</svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Team</h1>
		<p class="mt-1 text-sm text-neutral-500">
			{members.length} members, {onlineCount} online now.
		</p>
	</div>
	<button
		type="button"
		onclick={() => (createOpen = true)}
		class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
	>
		<UserPlus size={16} strokeWidth={2.25} />
		Add member
	</button>
</div>

{#if members.length === 0}
	<div
		class="rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center"
	>
		<p class="text-sm font-medium text-neutral-600">No team members yet</p>
		<p class="mt-1 text-sm text-neutral-400">Add the people you work with to assign them tasks.</p>
		<button
			type="button"
			onclick={() => (createOpen = true)}
			class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
		>
			<UserPlus size={15} />
			Add member
		</button>
	</div>
{:else}
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
		{#each members as member (member.id)}
			<div class="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
				<div class="flex items-center gap-4">
					<Avatar {member} size="lg" />
					<div class="min-w-0">
						<p class="font-semibold tracking-tight text-neutral-900">{member.name}</p>
						<p class="truncate text-sm text-neutral-500">{member.role}</p>
					</div>
					<div class="ml-auto flex shrink-0 items-center gap-0.5">
						<button
							type="button"
							class="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
							aria-label="Edit {member.name}"
							onclick={() => (editTarget = member)}
						>
							<Pencil size={14} />
						</button>
						<button
							type="button"
							class="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
							aria-label="Remove {member.name}"
							onclick={() => (deleteTarget = member)}
						>
							<Trash2 size={14} />
						</button>
					</div>
				</div>

				<p class="mt-4 flex items-center gap-1.5 text-sm text-neutral-500">
					<Mail size={14} class="shrink-0 text-neutral-400" />
					<span class="truncate">{member.email}</span>
				</p>

				<div class="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-4 text-center">
					<div>
						<p class="text-lg font-semibold text-neutral-900">{openCountFor(member.id)}</p>
						<p class="text-xs text-neutral-400">Open tasks</p>
					</div>
					<div>
						<p class="text-lg font-semibold text-neutral-900">{doneCountFor(member.id)}</p>
						<p class="text-xs text-neutral-400">Completed</p>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<MemberForm open={createOpen} onClose={() => (createOpen = false)} />
<MemberForm open={editTarget !== null} member={editTarget} onClose={() => (editTarget = null)} />
<ConfirmDialog
	open={deleteTarget !== null}
	title="Remove member?"
	message={`This will remove "${deleteTarget?.name ?? ''}" and leave their tasks unassigned.`}
	confirmLabel="Remove member"
	onConfirm={handleDelete}
	onCancel={() => (deleteTarget = null)}
/>
