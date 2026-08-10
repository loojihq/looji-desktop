<script lang="ts">
	import { Pencil, Plus, Search, Trash2 } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { priorityStyles, projectAccents, taskStatusStyles } from '$lib/badges';
	import {
		createTask,
		deleteTask,
		memberById,
		members,
		projectById,
		projects,
		tasks,
		toggleTaskDone,
		updateTask
	} from '$lib/store.svelte';
	import { priorities, taskStatuses, type Priority, type Task, type TaskStatus } from '$lib/types';
	import { daysFromNow, dueLabel, isOverdue } from '$lib/utils';
	import { resolve } from '$app/paths';

	let query = $state('');
	let statusFilter = $state<'all' | TaskStatus>('all');
	let priorityFilter = $state<'all' | Priority>('all');

	let newTitle = $state('');
	let newProjectId = $state('');
	let newAssigneeId = $state('');
	let newPriority = $state<Priority>('medium');
	let deleteTarget = $state<Task | null>(null);

	let editTarget = $state<Task | null>(null);
	let editTitle = $state('');
	let editProjectId = $state('');
	let editStatus = $state<TaskStatus>('todo');
	let editPriority = $state<Priority>('medium');
	let editAssigneeId = $state('');
	let editDue = $state('');
	let editTags = $state('');
	let editError = $state('');

	function startEdit(task: Task) {
		editTarget = task;
		editTitle = task.title;
		editProjectId = task.projectId;
		editStatus = task.status;
		editPriority = task.priority;
		editAssigneeId = task.assigneeId ?? '';
		editDue = task.due.slice(0, 10);
		editTags = task.tags.join(', ');
		editError = '';
	}

	function cancelEdit() {
		editTarget = null;
		editError = '';
	}

	async function handleEditSave() {
		if (!editTarget || !editTitle.trim() || !editProjectId) return;
		editError = '';
		try {
			await updateTask(editTarget.id, {
				title: editTitle.trim(),
				projectId: editProjectId,
				status: editStatus,
				priority: editPriority,
				assigneeId: editAssigneeId || null,
				due: editDue ? new Date(`${editDue}T12:00:00`).toISOString() : daysFromNow(7),
				tags: editTags
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			});
			cancelEdit();
		} catch (err) {
			console.error('Failed to save task', err);
			editError = err instanceof Error ? err.message : String(err);
		}
	}

	$effect(() => {
		if (!newProjectId && projects[0]) newProjectId = projects[0].id;
	});

	const filtered = $derived(
		[...tasks]
			.sort((a, b) => {
				const aDone = a.status === 'done' ? 1 : 0;
				const bDone = b.status === 'done' ? 1 : 0;
				if (aDone !== bDone) return aDone - bDone;
				return new Date(a.due).getTime() - new Date(b.due).getTime();
			})
			.filter((task) => {
				const matchesQuery = task.title.toLowerCase().includes(query.toLowerCase());
				const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
				const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
				return matchesQuery && matchesStatus && matchesPriority;
			})
	);

	const openCount = $derived(tasks.filter((task) => task.status !== 'done').length);

	function handleQuickAdd() {
		if (!newTitle.trim() || !newProjectId) return;
		createTask({
			title: newTitle.trim(),
			projectId: newProjectId,
			status: 'backlog',
			priority: newPriority,
			assigneeId: newAssigneeId || null,
			due: daysFromNow(7)
		});
		newTitle = '';
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		await deleteTask(deleteTarget.id);
		deleteTarget = null;
	}
</script>

<svelte:head>
	<title>Tasks · Workmaster</title>
</svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Tasks</h1>
	<p class="mt-1 text-sm text-neutral-500">
		{openCount} open, {tasks.length - openCount} done across all projects.
	</p>
</div>

<div class="mb-4">
	{#if editTarget}
		<form
			onsubmit={handleEditSave}
			class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-xs"
		>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<div class="lg:col-span-3">
					<label for="edit-title" class="mb-1 block text-xs font-medium text-neutral-600">Title</label>
					<input
						id="edit-title"
						type="text"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editTitle}
						required
					/>
				</div>
				<div>
					<label for="edit-project" class="mb-1 block text-xs font-medium text-neutral-600">
						Project
					</label>
					<select
						id="edit-project"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editProjectId}
					>
						{#each projects as project (project.id)}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="edit-status" class="mb-1 block text-xs font-medium text-neutral-600">
						Status
					</label>
					<select
						id="edit-status"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editStatus}
					>
						{#each taskStatuses as status (status)}
							<option value={status}>{taskStatusStyles[status].label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="edit-priority" class="mb-1 block text-xs font-medium text-neutral-600">
						Priority
					</label>
					<select
						id="edit-priority"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editPriority}
					>
						{#each priorities as priority (priority)}
							<option value={priority}>{priorityStyles[priority].label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="edit-assignee" class="mb-1 block text-xs font-medium text-neutral-600">
						Assignee
					</label>
					<select
						id="edit-assignee"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editAssigneeId}
					>
						<option value="">Unassigned</option>
						{#each members as member (member.id)}
							<option value={member.id}>{member.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="edit-due" class="mb-1 block text-xs font-medium text-neutral-600">Due date</label>
					<input
						id="edit-due"
						type="date"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editDue}
					/>
				</div>
				<div>
					<label for="edit-tags" class="mb-1 block text-xs font-medium text-neutral-600">
						Tags (comma separated)
					</label>
					<input
						id="edit-tags"
						type="text"
						placeholder="e.g. frontend, bug"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editTags}
					/>
				</div>
			</div>
			{#if editError}
				<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>
			{/if}
			<div class="mt-4 flex items-center gap-2">
				<button
					type="submit"
					class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
				>
					Save changes
				</button>
				<button
					type="button"
					class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
					onclick={cancelEdit}
				>
					Cancel
				</button>
			</div>
		</form>
	{:else}
		<form class="flex flex-wrap items-center gap-2" onsubmit={handleQuickAdd}>
			<div class="relative min-w-64 flex-1">
				<Plus
					size={16}
					class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
				/>
				<input
					type="text"
					placeholder="Add a task"
					class="w-full rounded-lg border-neutral-300 py-2 pr-3 pl-9 text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={newTitle}
				/>
			</div>
			<select
				class="rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newProjectId}
				aria-label="Project"
			>
				{#each projects as project (project.id)}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
			<select
				class="rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newPriority}
				aria-label="Priority"
			>
				{#each priorities as priority (priority)}
					<option value={priority}>{priorityStyles[priority].label}</option>
				{/each}
			</select>
			<select
				class="rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newAssigneeId}
				aria-label="Assignee"
			>
				<option value="">Unassigned</option>
				{#each members as member (member.id)}
					<option value={member.id}>{member.name}</option>
				{/each}
			</select>
			<button
				type="submit"
				class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
			>
				Add task
			</button>
		</form>
	{/if}
</div>

<div class="mb-4 flex flex-wrap items-center gap-3">
	<div class="relative w-full sm:max-w-xs">
		<Search
			size={16}
			class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
		/>
		<input
			type="search"
			placeholder="Search tasks"
			class="w-full rounded-lg border-neutral-300 py-2 pr-3 pl-9 text-sm focus:border-indigo-500 focus:ring-indigo-500"
			bind:value={query}
		/>
	</div>
	<select
		class="rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
		bind:value={statusFilter}
		aria-label="Filter by status"
	>
		<option value="all">All statuses</option>
		{#each taskStatuses as status (status)}
			<option value={status}>{taskStatusStyles[status].label}</option>
		{/each}
	</select>
	<select
		class="rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
		bind:value={priorityFilter}
		aria-label="Filter by priority"
	>
		<option value="all">All priorities</option>
		{#each priorities as priority (priority)}
			<option value={priority}>{priorityStyles[priority].label}</option>
		{/each}
	</select>
	<span class="ml-auto text-sm text-neutral-400">
		{filtered.length} of {tasks.length} tasks
	</span>
</div>

<div class="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
	<div class="overflow-x-auto">
		<table class="w-full min-w-[720px] text-left">
			<thead>
				<tr
					class="border-b border-neutral-200 text-xs font-semibold tracking-wider text-neutral-400 uppercase"
				>
					<th class="w-10 px-5 py-3"></th>
					<th class="px-3 py-3">Task</th>
					<th class="px-3 py-3">Project</th>
					<th class="px-3 py-3">Assignee</th>
					<th class="px-3 py-3">Priority</th>
					<th class="px-3 py-3">Due</th>
					<th class="px-5 py-3">Status</th>
					<th class="w-20 px-3 py-3"></th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as task (task.id)}
					{@const project = projectById(task.projectId)}
					{@const assignee = memberById(task.assigneeId)}
					<tr
						class="border-b border-neutral-100 transition-colors last:border-b-0 hover:bg-neutral-50 {task.status ===
						'done'
							? 'bg-neutral-50/50'
							: ''}"
					>
						<td class="px-5 py-3">
							<input
								type="checkbox"
								checked={task.status === 'done'}
								onchange={() => toggleTaskDone(task.id)}
								class="size-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
								aria-label="Mark {task.title} as done"
							/>
						</td>
						<td class="px-3 py-3">
							<p
								class="text-sm font-medium {task.status === 'done'
									? 'text-neutral-400 line-through'
									: 'text-neutral-800'}"
							>
								{task.title}
							</p>
							{#if task.tags.length > 0}
								<div class="mt-1 flex flex-wrap gap-1.5">
									{#each task.tags as tag (tag)}
										<span
											class="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500"
										>
											{tag}
										</span>
									{/each}
								</div>
							{/if}
						</td>
						<td class="px-3 py-3">
							{#if project}
								<a
									href={resolve(`/projects/${project.slug}`)}
									class="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-indigo-600"
								>
									<span
										class="size-1.5 rounded-full {projectAccents[project.color]?.chip ??
											'bg-neutral-400'}"
									></span>
									{project.name}
								</a>
							{:else}
								<span class="text-sm text-neutral-400">Unknown project</span>
							{/if}
						</td>
						<td class="px-3 py-3">
							{#if assignee}
								<div class="flex items-center gap-2">
									<Avatar member={assignee} size="sm" />
									<span class="text-sm text-neutral-600">{assignee.name}</span>
								</div>
							{:else}
								<span class="text-sm text-neutral-400">Unassigned</span>
							{/if}
						</td>
						<td class="px-3 py-3">
							<Badge variant="priority" value={task.priority} />
						</td>
						<td class="px-3 py-3">
							<span
								class={isOverdue(task.due) && task.status !== 'done'
									? 'text-sm font-medium text-red-600'
									: 'text-sm text-neutral-500'}
							>
								{dueLabel(task.due)}
							</span>
						</td>
						<td class="px-5 py-3">
							<Badge variant="task" value={task.status} />
						</td>
						<td class="px-3 py-3">
							<div class="flex items-center gap-0.5">
								<button
									type="button"
									class="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
									aria-label="Edit {task.title}"
									onclick={() => startEdit(task)}
								>
									<Pencil size={14} />
								</button>
								<button
									type="button"
									class="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
									aria-label="Delete {task.title}"
									onclick={() => (deleteTarget = task)}
								>
									<Trash2 size={14} />
								</button>
							</div>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="8" class="px-5 py-16 text-center text-sm text-neutral-400">
							{#if tasks.length === 0}
								No tasks yet. Add your first task above.
							{:else}
								No tasks match your filters.
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<ConfirmDialog
	open={deleteTarget !== null}
	title="Delete task?"
	message={`This will permanently delete "${deleteTarget?.title ?? ''}".`}
	confirmLabel="Delete task"
	onConfirm={handleDelete}
	onCancel={() => (deleteTarget = null)}
/>
