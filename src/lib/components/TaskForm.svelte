<script lang="ts">
	import Modal from './Modal.svelte';
	import { priorityStyles, taskStatusStyles } from '$lib/badges';
	import { createTask, members, projects, updateTask } from '$lib/store.svelte';
	import { priorities, taskStatuses, type Priority, type Task, type TaskStatus } from '$lib/types';
	import { daysFromNow } from '$lib/utils';

	let {
		open,
		task = null,
		onClose
	}: { open: boolean; task?: Task | null; onClose: () => void } = $props();

	let title = $state('');
	let projectId = $state('');
	let status = $state<TaskStatus>('todo');
	let priority = $state<Priority>('medium');
	let assigneeId = $state('');
	let due = $state('');
	let tags = $state('');

	$effect(() => {
		if (!open) return;
		title = task?.title ?? '';
		projectId = task?.projectId ?? projects[0]?.id ?? '';
		status = task?.status ?? 'todo';
		priority = task?.priority ?? 'medium';
		assigneeId = task?.assigneeId ?? '';
		due = task?.due ? task.due.slice(0, 10) : daysFromNow(7).slice(0, 10);
		tags = (task?.tags ?? []).join(', ');
	});

	async function handleSubmit() {
		if (!title.trim() || !projectId) return;
		const payload = {
			title: title.trim(),
			projectId,
			status,
			priority,
			assigneeId: assigneeId || null,
			due: due ? new Date(`${due}T12:00:00`).toISOString() : daysFromNow(7),
			tags: tags
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean)
		};
		if (task) await updateTask(task.id, payload);
		else await createTask(payload);
		onClose();
	}
</script>

<Modal open={open} title={task ? 'Edit task' : 'New task'} onClose={onClose}>
	<form class="space-y-4" onsubmit={handleSubmit}>
		<div>
			<label for="task-title" class="mb-1 block text-xs font-medium text-neutral-600">Title</label>
			<input
				id="task-title"
				type="text"
				placeholder="e.g. Fix login redirect"
				class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={title}
				required
			/>
		</div>
		<div>
			<label for="task-project" class="mb-1 block text-xs font-medium text-neutral-600">Project</label>
			<select
				id="task-project"
				class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={projectId}
			>
				{#each projects as project (project.id)}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="task-status" class="mb-1 block text-xs font-medium text-neutral-600">
					Status
				</label>
				<select
					id="task-status"
					class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={status}
				>
					{#each taskStatuses as s (s)}
						<option value={s}>{taskStatusStyles[s].label}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="task-priority" class="mb-1 block text-xs font-medium text-neutral-600">
					Priority
				</label>
				<select
					id="task-priority"
					class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={priority}
				>
					{#each priorities as p (p)}
						<option value={p}>{priorityStyles[p].label}</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="task-assignee" class="mb-1 block text-xs font-medium text-neutral-600">
					Assignee
				</label>
				<select
					id="task-assignee"
					class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={assigneeId}
				>
					<option value="">Unassigned</option>
					{#each members as member (member.id)}
						<option value={member.id}>{member.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="task-due" class="mb-1 block text-xs font-medium text-neutral-600">Due date</label>
				<input
					id="task-due"
					type="date"
					class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={due}
				/>
			</div>
		</div>
		<div>
			<label for="task-tags" class="mb-1 block text-xs font-medium text-neutral-600">
				Tags (comma separated)
			</label>
			<input
				id="task-tags"
				type="text"
				placeholder="e.g. frontend, bug"
				class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={tags}
			/>
		</div>
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
				{task ? 'Save changes' : 'Create task'}
			</button>
		</div>
	</form>
</Modal>
