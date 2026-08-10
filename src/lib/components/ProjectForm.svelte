<script lang="ts">
	import Modal from './Modal.svelte';
	import { projectStatusStyles } from '$lib/badges';
	import { createProject, updateProject } from '$lib/store.svelte';
	import { projectStatuses, type Project, type ProjectStatus } from '$lib/types';
	import { daysFromNow } from '$lib/utils';

	let {
		open,
		project = null,
		onClose
	}: { open: boolean; project?: Project | null; onClose: () => void } = $props();

	let name = $state('');
	let description = $state('');
	let status = $state<ProjectStatus>('planning');
	let due = $state('');
	let error = $state('');

	$effect(() => {
		if (!open) return;
		name = project?.name ?? '';
		description = project?.description ?? '';
		status = project?.status ?? 'planning';
		due = project?.due ? project.due.slice(0, 10) : daysFromNow(30).slice(0, 10);
	});

	async function handleSubmit() {
		if (!name.trim()) return;
		error = '';
		try {
			const payload = {
				name: name.trim(),
				description: description.trim(),
				status,
				due: due ? new Date(`${due}T12:00:00`).toISOString() : daysFromNow(30)
			};
			if (project) await updateProject(project.id, payload);
			else await createProject(payload);
			onClose();
		} catch (err) {
			console.error('Failed to save project', err);
			error = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<Modal open={open} title={project ? 'Edit project' : 'New project'} onClose={onClose}>
	<form class="space-y-4" onsubmit={handleSubmit}>
		<div>
			<label for="project-name" class="mb-1 block text-xs font-medium text-neutral-600">Name</label>
			<input
				id="project-name"
				type="text"
				placeholder="e.g. iOS redesign"
				class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={name}
				required
			/>
		</div>
		<div>
			<label for="project-description" class="mb-1 block text-xs font-medium text-neutral-600">
				Description
			</label>
			<textarea
				id="project-description"
				rows={3}
				class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={description}
			></textarea>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="project-status" class="mb-1 block text-xs font-medium text-neutral-600">
					Status
				</label>
				<select
					id="project-status"
					class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={status}
				>
					{#each projectStatuses as s (s)}
						<option value={s}>{projectStatusStyles[s].label}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="project-due" class="mb-1 block text-xs font-medium text-neutral-600">
					Target date
				</label>
				<input
					id="project-due"
					type="date"
					class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={due}
				/>
			</div>
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
				{project ? 'Save changes' : 'Create project'}
			</button>
		</div>
	</form>
</Modal>
