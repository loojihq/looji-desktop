<script lang="ts">
	import { Mail, UserPlus, X } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { addMember, members, tasks } from '$lib/store.svelte';

	let showForm = $state(false);
	let newName = $state('');
	let newEmail = $state('');
	let newRole = $state('Engineering');

	async function handleAdd() {
		if (!newName.trim() || !newEmail.trim()) return;
		await addMember({
			name: newName.trim(),
			email: newEmail.trim(),
			role: newRole
		});
		newName = '';
		newEmail = '';
		newRole = 'Engineering';
		showForm = false;
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
		onclick={() => (showForm = !showForm)}
		class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
	>
		{#if showForm}
			<X size={16} />
		{:else}
			<UserPlus size={16} strokeWidth={2.25} />
		{/if}
		{showForm ? 'Cancel' : 'Add member'}
	</button>
</div>

{#if showForm}
	<form
		onsubmit={handleAdd}
		class="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-xs sm:flex sm:items-end sm:gap-3"
	>
		<div class="flex-1">
			<label for="member-name" class="mb-1 block text-xs font-medium text-neutral-600">Name</label>
			<input
				id="member-name"
				type="text"
				placeholder="e.g. Jamie Lee"
				class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newName}
				required
			/>
		</div>
		<div class="flex-1">
			<label for="member-email" class="mb-1 block text-xs font-medium text-neutral-600">Email</label>
			<input
				id="member-email"
				type="email"
				placeholder="jamie@company.com"
				class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newEmail}
				required
			/>
		</div>
		<div>
			<label for="member-role" class="mb-1 block text-xs font-medium text-neutral-600">Role</label>
			<select
				id="member-role"
				class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newRole}
			>
				{#each ['Engineering', 'Design', 'Product', 'Marketing', 'Operations'] as role (role)}
					<option value={role}>{role}</option>
				{/each}
			</select>
		</div>
		<button
			type="submit"
			class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
		>
			Add member
		</button>
	</form>
{/if}

{#if members.length === 0}
	<div
		class="rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center"
	>
		<p class="text-sm font-medium text-neutral-600">No team members yet</p>
		<p class="mt-1 text-sm text-neutral-400">Add the people you work with to assign them tasks.</p>
		<button
			type="button"
			onclick={() => (showForm = true)}
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
					<span
						class="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-medium {member.online
							? 'text-emerald-600'
							: 'text-neutral-400'}"
					>
						<span class="size-2 rounded-full {member.online ? 'bg-emerald-500' : 'bg-neutral-300'}"
						></span>
						{member.online ? 'Online' : 'Offline'}
					</span>
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
