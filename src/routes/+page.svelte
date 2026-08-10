<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		CalendarDays,
		CheckCircle,
		Clock,
		Flame,
		FolderKanban,
		ListChecks,
		Plus,
		Timer,
		User,
		Users
	} from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { projectAccents } from '$lib/badges';
	import {
		auditLog,
		createTask,
		members,
		projectById,
		projectProgress,
		projects,
		tasks,
		toggleTaskDone
	} from '$lib/store.svelte';
	import { daysFromNow, dueLabel, formatDateLong, isOverdue, relativeTime } from '$lib/utils';

	const hour = new Date().getHours();
	const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

	let addingTask = $state(false);
	let quickTitle = $state('');
	let quickProjectId = $state('');

	$effect(() => {
		if (!quickProjectId && projects[0]) quickProjectId = projects[0].id;
	});

	const activeProjectCount = $derived(
		projects.filter((project) => project.status === 'active').length
	);
	const planningProjectCount = $derived(
		projects.filter((project) => project.status === 'planning').length
	);
	const openTaskCount = $derived(tasks.filter((task) => task.status !== 'done').length);
	const dueSoonCount = $derived(
		tasks.filter(
			(task) =>
				task.status !== 'done' &&
				!isOverdue(task.due) &&
				new Date(task.due).getTime() - Date.now() < 7 * 86400000
		).length
	);
	const doneTaskCount = $derived(tasks.filter((task) => task.status === 'done').length);
	const onlineMemberCount = $derived(members.filter((member) => member.online).length);
	const openTasks = $derived(
		[...tasks]
			.filter((task) => task.status !== 'done')
			.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
	);
	const topProjects = $derived([...projects].sort((a, b) => b.progress - a.progress).slice(0, 4));

	const attentionOverdue = $derived(
		tasks
			.filter((task) => task.status !== 'done' && isOverdue(task.due))
			.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
	);
	const attentionDueSoon = $derived(
		tasks
			.filter(
				(task) =>
					task.status !== 'done' &&
					!isOverdue(task.due) &&
					new Date(task.due).getTime() - Date.now() < 48 * 3600000
			)
			.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
	);
	const attentionStale = $derived(
		tasks
			.filter(
				(task) =>
					task.status === 'in_review' &&
					task.updatedAt &&
					Date.now() - new Date(task.updatedAt).getTime() > 3 * 86400000
			)
			.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
	);
	const attentionTotal = $derived(
		attentionOverdue.length + attentionDueSoon.length + attentionStale.length
	);

	function handleQuickAdd() {
		if (!quickTitle.trim() || !quickProjectId) return;
		createTask({
			title: quickTitle.trim(),
			projectId: quickProjectId,
			status: 'todo',
			priority: 'medium',
			due: daysFromNow(3)
		});
		quickTitle = '';
		addingTask = false;
	}
</script>

<svelte:head>
	<title>Dashboard · Workmaster</title>
</svelte:head>

<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">{greeting}</h1>
		<p class="mt-1 text-sm text-neutral-500">
			{formatDateLong(new Date())} · Here's what's happening in your workspace.
		</p>
	</div>
	{#if projects.length === 0}
		<a
			href={resolve('/projects')}
			class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
		>
			<Plus size={16} strokeWidth={2.5} />
			Create a project
		</a>
	{:else if addingTask}
		<form class="flex flex-wrap items-center gap-2" onsubmit={handleQuickAdd}>
			<input
				type="text"
				placeholder="Task title"
				class="w-52 rounded-lg border-neutral-300 bg-surface text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={quickTitle}
				required
			/>
			<select
				class="rounded-lg border-neutral-300 bg-surface text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={quickProjectId}
				aria-label="Project"
			>
				{#each projects as project (project.id)}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
			<button
				type="submit"
				class="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
			>
				Add
			</button>
		</form>
	{:else}
		<button
			type="button"
			onclick={() => (addingTask = true)}
			class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
		>
			<Plus size={16} strokeWidth={2.5} />
			New task
		</button>
	{/if}
</div>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<div class="rounded-xl border border-neutral-200 bg-surface p-5 shadow-xs">
		<div class="flex items-center justify-between">
			<p class="text-sm font-medium text-neutral-500">Active projects</p>
			<span class="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
				<FolderKanban size={18} />
			</span>
		</div>
		<p class="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">{activeProjectCount}</p>
		<p class="mt-1 text-xs text-neutral-400">{planningProjectCount} in planning</p>
	</div>
	<div class="rounded-xl border border-neutral-200 bg-surface p-5 shadow-xs">
		<div class="flex items-center justify-between">
			<p class="text-sm font-medium text-neutral-500">Open tasks</p>
			<span class="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
				<ListChecks size={18} />
			</span>
		</div>
		<p class="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">{openTaskCount}</p>
		<p class="mt-1 text-xs text-neutral-400">{dueSoonCount} due in 7 days</p>
	</div>
	<div class="rounded-xl border border-neutral-200 bg-surface p-5 shadow-xs">
		<div class="flex items-center justify-between">
			<p class="text-sm font-medium text-neutral-500">Completed tasks</p>
			<span class="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
				<CheckCircle size={18} />
			</span>
		</div>
		<p class="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">{doneTaskCount}</p>
		<p class="mt-1 text-xs text-neutral-400">of {tasks.length} total</p>
	</div>
	<div class="rounded-xl border border-neutral-200 bg-surface p-5 shadow-xs">
		<div class="flex items-center justify-between">
			<p class="text-sm font-medium text-neutral-500">Team members</p>
			<span class="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
				<Users size={18} />
			</span>
		</div>
		<p class="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">{onlineMemberCount}</p>
		<p class="mt-1 text-xs text-neutral-400">online right now</p>
	</div>
</div>

<section class="mt-6 rounded-xl border border-neutral-200 bg-surface shadow-xs">
	<header class="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
		<div class="flex items-center gap-2">
			<h2 class="font-semibold tracking-tight text-neutral-900">Needs attention</h2>
			{#if attentionTotal > 0}
				<span class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
					{attentionTotal}
				</span>
			{/if}
		</div>
	</header>
	{#if attentionTotal === 0}
		<p class="px-5 py-8 text-center text-sm text-neutral-400">All caught up, nothing needs attention.</p>
	{:else}
		<div class="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
			{#if attentionOverdue.length > 0}
				<div class="rounded-lg border border-red-100 bg-red-50/50 p-3">
					<p class="flex items-center gap-1.5 text-xs font-semibold text-red-700">
						<Flame size={13} />
						Overdue ({attentionOverdue.length})
					</p>
					<ul class="mt-2 space-y-2">
						{#each attentionOverdue.slice(0, 5) as task (task.id)}
							{@const project = projectById(task.projectId)}
							<li class="text-sm">
								<a
									href={resolve(`/projects/${project?.slug ?? ''}`)}
									class="font-medium text-neutral-800 hover:text-indigo-600"
								>
									{task.title}
								</a>
								<p class="mt-0.5 text-xs text-red-600">{dueLabel(task.due)}</p>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if attentionDueSoon.length > 0}
				<div class="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
					<p class="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
						<Clock size={13} />
						Due within 48 hours ({attentionDueSoon.length})
					</p>
					<ul class="mt-2 space-y-2">
						{#each attentionDueSoon.slice(0, 5) as task (task.id)}
							{@const project = projectById(task.projectId)}
							<li class="text-sm">
								<a
									href={resolve(`/projects/${project?.slug ?? ''}`)}
									class="font-medium text-neutral-800 hover:text-indigo-600"
								>
									{task.title}
								</a>
								<p class="mt-0.5 text-xs text-amber-700">{dueLabel(task.due)}</p>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if attentionStale.length > 0}
				<div class="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
					<p class="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
						<Timer size={13} />
						Stuck in review ({attentionStale.length})
					</p>
					<ul class="mt-2 space-y-2">
						{#each attentionStale.slice(0, 5) as task (task.id)}
							{@const project = projectById(task.projectId)}
							<li class="text-sm">
								<a
									href={resolve(`/projects/${project?.slug ?? ''}`)}
									class="font-medium text-neutral-800 hover:text-indigo-600"
								>
									{task.title}
								</a>
								<p class="mt-0.5 text-xs text-violet-700">
									In review since {relativeTime(task.updatedAt)}
								</p>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</section>

<div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
	<section class="rounded-xl border border-neutral-200 bg-surface shadow-xs xl:col-span-2">
		<header class="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
			<div class="flex items-center gap-2">
				<h2 class="font-semibold tracking-tight text-neutral-900">Open tasks</h2>
				<span class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
					{openTasks.length}
				</span>
			</div>
			<a
				href={resolve('/tasks')}
				class="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
			>
				View all
				<ArrowRight size={14} />
			</a>
		</header>
		<ul class="divide-y divide-neutral-100">
			{#each openTasks as task (task.id)}
				{@const project = projectById(task.projectId)}
				<li class="flex items-center gap-3 px-5 py-3">
					<input
						type="checkbox"
						checked={task.status === 'done'}
						onchange={() => toggleTaskDone(task.id)}
						class="size-4 shrink-0 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
						aria-label="Mark {task.title} as done"
					/>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-neutral-800">{task.title}</p>
						<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-neutral-400">
							{#if project}
								<span class="inline-flex items-center gap-1.5">
									<span
										class="size-1.5 rounded-full {projectAccents[project.color]?.chip ?? 'bg-neutral-400'}"
									></span>
									{project.name}
								</span>
							{/if}
							<span class="text-neutral-300">·</span>
							<span
								class={isOverdue(task.due)
									? 'inline-flex items-center gap-1 font-medium text-red-600'
									: 'inline-flex items-center gap-1'}
							>
								<CalendarDays size={12} />
								{dueLabel(task.due)}
							</span>
						</p>
					</div>
					{#if task.priority !== 'low'}
						<Badge variant="priority" value={task.priority} />
					{/if}
				</li>
			{:else}
				<li class="px-5 py-12 text-center text-sm text-neutral-400">
					{#if projects.length === 0}
						No tasks yet. Create a project to get started.
					{:else}
						No open tasks. Enjoy the quiet.
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<div class="space-y-6">
		<section class="rounded-xl border border-neutral-200 bg-surface shadow-xs">
			<header class="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
				<h2 class="font-semibold tracking-tight text-neutral-900">Projects</h2>
				<a
					href={resolve('/projects')}
					class="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
				>
					View all
					<ArrowRight size={14} />
				</a>
			</header>
			{#if topProjects.length === 0}
				<p class="px-5 py-8 text-center text-sm text-neutral-400">
					No projects yet. Create one to see progress here.
				</p>
			{:else}
				<ul class="space-y-4 px-5 py-4">
					{#each topProjects as project (project.id)}
						<li>
							<div class="mb-1.5 flex items-center justify-between text-sm">
								<a
									href={resolve(`/projects/${project.slug}`)}
									class="font-medium text-neutral-800 hover:text-indigo-600"
								>
									{project.name}
								</a>
								<span class="text-xs font-medium text-neutral-400">
									{projectProgress(project.id)}%
								</span>
							</div>
							<ProgressBar
								value={projectProgress(project.id)}
								color={projectAccents[project.color]?.bar ?? 'bg-indigo-500'}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="rounded-xl border border-neutral-200 bg-surface shadow-xs">
			<header class="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
				<h2 class="font-semibold tracking-tight text-neutral-900">Recent activity</h2>
				<a
					href={resolve('/activity')}
					class="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
				>
					View all
					<ArrowRight size={14} />
				</a>
			</header>
			{#if auditLog.length === 0}
				<p class="px-5 py-8 text-center text-sm text-neutral-400">
					No activity yet. Changes will show up here.
				</p>
			{:else}
				<ul class="divide-y divide-neutral-100 px-5 py-2">
					{#each auditLog.slice(0, 6) as entry (entry.id)}
						<li class="flex gap-3 py-3">
							<span
								class="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-500"
							>
								<User size={12} />
							</span>
							<div class="min-w-0 text-sm">
								<p class="text-neutral-600">
									<span class="font-medium text-neutral-900">You</span>
									<span> {entry.summary}</span>
								</p>
								<p class="mt-0.5 text-xs text-neutral-400">{relativeTime(entry.time)}</p>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>
