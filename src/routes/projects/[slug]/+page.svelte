<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ArrowLeft, CalendarDays, Plus, User } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { projectAccents, priorityStyles, taskStatusStyles } from '$lib/badges';
	import { createTask, memberById, members, moveTask, projects, tasks } from '$lib/store.svelte';
	import type { Member, TaskStatus } from '$lib/types';
	import { daysFromNow, dueLabel, formatDate, isOverdue } from '$lib/utils';

	const project = $derived(projects.find((p) => p.slug === page.params.slug));
	const projectMembers = $derived(
		project
			? project.memberIds.map(memberById).filter((m): m is Member => m !== undefined)
			: []
	);

	const columns: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

	function tasksInColumn(status: TaskStatus) {
		if (!project) return [];
		return tasks.filter((task) => task.projectId === project.id && task.status === status);
	}

	const openCount = $derived(
		project
			? tasks.filter((task) => task.projectId === project.id && task.status !== 'done').length
			: 0
	);

	let draggingId = $state<string | null>(null);
	let overStatus = $state<TaskStatus | null>(null);

	function handleDrop(status: TaskStatus) {
		if (draggingId) moveTask(draggingId, status);
		draggingId = null;
		overStatus = null;
	}

	let addingStatus = $state<TaskStatus | null>(null);
	let newTitle = $state('');
	let newAssigneeId = $state('');

	function handleAdd(status: TaskStatus) {
		if (!project || !newTitle.trim()) return;
		createTask({
			title: newTitle.trim(),
			projectId: project.id,
			status,
			priority: 'medium',
			assigneeId: newAssigneeId || null,
			due: daysFromNow(7)
		});
		newTitle = '';
		newAssigneeId = '';
		addingStatus = null;
	}
</script>

<svelte:head>
	<title>{project?.name ?? 'Project'} · Workmaster</title>
</svelte:head>

{#if !project}
	<div
		class="rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-20 text-center"
	>
		<p class="text-sm font-medium text-neutral-600">Project not found</p>
		<a
			href={resolve('/projects')}
			class="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
		>
			Back to all projects
		</a>
	</div>
{:else}
	<a
		href={resolve('/projects')}
		class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900"
	>
		<ArrowLeft size={16} />
		All projects
	</a>

	<section class="mt-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-xs">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-3">
					<h1 class="text-2xl font-semibold tracking-tight text-neutral-900">{project.name}</h1>
					<Badge variant="project" value={project.status} />
				</div>
				<p class="mt-2 max-w-2xl text-sm text-neutral-500">{project.description}</p>
			</div>
			<span
				class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-600"
			>
				<CalendarDays size={15} />
				Due {formatDate(project.due)}
			</span>
		</div>

		<div class="mt-6">
			<div class="mb-1.5 flex items-center justify-between text-xs">
				<span class="font-medium text-neutral-400">Progress</span>
				<span class="font-semibold text-neutral-600">{project.progress}%</span>
			</div>
			<ProgressBar
				value={project.progress}
				color={projectAccents[project.color]?.bar ?? 'bg-indigo-500'}
			/>
		</div>

		<div class="mt-5 flex items-center justify-between border-t border-neutral-100 pt-4">
			<div class="flex -space-x-2">
				{#each projectMembers as member (member.id)}
					<Avatar member={member} ring />
				{/each}
			</div>
			<p class="text-xs text-neutral-400">{openCount} open tasks</p>
		</div>
	</section>

	<section class="mt-6">
		<div class="flex gap-4 overflow-x-auto pb-4">
			{#each columns as status (status)}
				<div
					role="group"
					aria-label={taskStatusStyles[status].label}
					class="w-72 shrink-0 rounded-xl border p-3 transition-colors {overStatus === status
						? 'border-indigo-300 bg-indigo-50/70'
						: 'border-neutral-200 bg-neutral-50/80'}"
					ondragover={(event) => {
						event.preventDefault();
						overStatus = status;
					}}
					ondragleave={() => {
						if (overStatus === status) overStatus = null;
					}}
					ondrop={(event) => {
						event.preventDefault();
						handleDrop(status);
					}}
				>
					<header class="mb-3 flex items-center gap-2 px-1">
						<span class="size-2 rounded-full {taskStatusStyles[status].dot}"></span>
						<h3 class="text-sm font-semibold text-neutral-700">
							{taskStatusStyles[status].label}
						</h3>
						<span
							class="ml-auto rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-xs font-medium text-neutral-500"
						>
							{tasksInColumn(status).length}
						</span>
						<button
							type="button"
							class="rounded-md p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
							aria-label="Add task to {taskStatusStyles[status].label}"
							onclick={() => {
								addingStatus = addingStatus === status ? null : status;
							}}
						>
							<Plus size={15} />
						</button>
					</header>

					<div class="space-y-2">
						{#each tasksInColumn(status) as task (task.id)}
							{@const assignee = memberById(task.assigneeId)}
							<article
								draggable="true"
								ondragstart={() => (draggingId = task.id)}
								ondragend={() => {
									draggingId = null;
									overStatus = null;
								}}
								class="group cursor-grab rounded-lg border border-neutral-200 bg-white p-3 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing {draggingId ===
								task.id
									? 'opacity-50'
									: ''}"
							>
								<div class="flex items-start gap-2.5">
									<span
										class="mt-1 size-1.5 shrink-0 rounded-full {priorityStyles[task.priority].dot}"
									></span>
									<p class="text-sm font-medium text-neutral-800">{task.title}</p>
								</div>
								{#if task.tags.length > 0}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each task.tags as tag (tag)}
											<span
												class="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500"
											>
												{tag}
											</span>
										{/each}
									</div>
								{/if}
								<footer class="mt-3 flex items-center justify-between">
									{#if assignee}
										<Avatar member={assignee} size="xs" />
									{:else}
										<span
											class="flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-400"
											title="Unassigned"
										>
											<User size={11} />
										</span>
									{/if}
									<span
										class={isOverdue(task.due)
											? 'text-xs font-medium text-red-600'
											: 'text-xs text-neutral-400'}
									>
										{dueLabel(task.due)}
									</span>
								</footer>
							</article>
						{/each}
					</div>

					{#if addingStatus === status}
						<form class="mt-2 space-y-2" onsubmit={() => handleAdd(status)}>
							<input
								type="text"
								placeholder="Task title"
								class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
								bind:value={newTitle}
								required
							/>
							<select
								class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
								bind:value={newAssigneeId}
								aria-label="Assignee"
							>
								<option value="">Unassigned</option>
								{#each members as member (member.id)}
									<option value={member.id}>{member.name}</option>
								{/each}
							</select>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}
