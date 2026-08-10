<script lang="ts">
	import { CalendarDays, FolderKanban, Plus, Search, X } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { projectAccents, projectStatusStyles } from '$lib/badges';
	import { createProject, memberById, projects } from '$lib/store.svelte';
	import { resolve } from '$app/paths';
	import type { ProjectStatus } from '$lib/types';
	import { daysFromNow, formatDate } from '$lib/utils';

	const createStatuses: ProjectStatus[] = ['planning', 'active', 'on_hold'];

	let query = $state('');
	let statusFilter = $state<'all' | ProjectStatus>('all');
	let showForm = $state(false);
	let newName = $state('');
	let newStatus = $state<ProjectStatus>('planning');
	let newDue = $state('');

	const tabs = $derived([
		{ value: 'all', label: 'All', count: projects.length },
		{
			value: 'planning',
			label: 'Planning',
			count: projects.filter((p) => p.status === 'planning').length
		},
		{
			value: 'active',
			label: 'Active',
			count: projects.filter((p) => p.status === 'active').length
		},
		{
			value: 'on_hold',
			label: 'On hold',
			count: projects.filter((p) => p.status === 'on_hold').length
		},
		{
			value: 'completed',
			label: 'Completed',
			count: projects.filter((p) => p.status === 'completed').length
		}
	] as const);

	const filtered = $derived(
		projects.filter((project) => {
			const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
			const matchesQuery = `${project.name} ${project.description}`
				.toLowerCase()
				.includes(query.toLowerCase());
			return matchesStatus && matchesQuery;
		})
	);

	function handleCreate() {
		if (!newName.trim()) return;
		createProject({ name: newName.trim(), status: newStatus, due: newDue || daysFromNow(30) });
		newName = '';
		newStatus = 'planning';
		newDue = '';
		showForm = false;
	}
</script>

<svelte:head>
	<title>Projects · Workmaster</title>
</svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Projects</h1>
		<p class="mt-1 text-sm text-neutral-500">
			{projects.length} projects across {new Set(projects.flatMap((p) => p.memberIds)).size} team members.
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
			<Plus size={16} strokeWidth={2.5} />
		{/if}
		{showForm ? 'Cancel' : 'New project'}
	</button>
</div>

{#if showForm}
	<form
		onsubmit={handleCreate}
		class="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-xs sm:flex sm:items-end sm:gap-3"
	>
		<div class="flex-1">
			<label for="project-name" class="mb-1 block text-xs font-medium text-neutral-600">
				Project name
			</label>
			<input
				id="project-name"
				type="text"
				placeholder="e.g. iOS redesign"
				class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newName}
				required
			/>
		</div>
		<div>
			<label for="project-status" class="mb-1 block text-xs font-medium text-neutral-600">
				Status
			</label>
			<select
				id="project-status"
				class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newStatus}
			>
				{#each createStatuses as status (status)}
					<option value={status}>{projectStatusStyles[status].label}</option>
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
				class="rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
				bind:value={newDue}
			/>
		</div>
		<button
			type="submit"
			class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
		>
			Create project
		</button>
	</form>
{/if}

<div class="mb-6 flex flex-wrap items-center gap-3">
	<div class="flex flex-wrap items-center gap-2">
		{#each tabs as tab (tab.value)}
			<button
				type="button"
				onclick={() => (statusFilter = tab.value)}
				class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {statusFilter ===
				tab.value
					? 'bg-neutral-900 text-white'
					: 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}"
			>
				{tab.label}
				<span
					class="ml-1.5 text-xs {statusFilter === tab.value
						? 'text-neutral-400'
						: 'text-neutral-400'}"
				>
					{tab.count}
				</span>
			</button>
		{/each}
	</div>
	<div class="relative ml-auto w-full sm:w-72">
		<Search
			size={16}
			class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
		/>
		<input
			type="search"
			placeholder="Search projects"
			class="w-full rounded-lg border-neutral-300 py-2 pr-3 pl-9 text-sm focus:border-indigo-500 focus:ring-indigo-500"
			bind:value={query}
		/>
	</div>
</div>

<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
	{#each filtered as project (project.id)}
		<a
			href={resolve(`/projects/${project.slug}`)}
			class="group flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="flex items-center gap-3">
					<span
						class="flex size-10 shrink-0 items-center justify-center rounded-lg {projectAccents[
							project.color
						]?.icon ?? 'bg-neutral-100 text-neutral-500'}"
					>
						<FolderKanban size={20} />
					</span>
					<div>
						<h3 class="font-semibold tracking-tight text-neutral-900 group-hover:text-indigo-600">
							{project.name}
						</h3>
						<p class="text-xs text-neutral-400">{project.memberIds.length} members</p>
					</div>
				</div>
				<Badge variant="project" value={project.status} />
			</div>

			<p class="mt-4 line-clamp-2 text-sm text-neutral-500">{project.description}</p>

			<div class="mt-4">
				<div class="mb-1.5 flex items-center justify-between text-xs">
					<span class="font-medium text-neutral-400">Progress</span>
					<span class="font-semibold text-neutral-600">{project.progress}%</span>
				</div>
				<ProgressBar
					value={project.progress}
					color={projectAccents[project.color]?.bar ?? 'bg-indigo-500'}
				/>
			</div>

			<div class="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
				<div class="flex -space-x-2">
					{#each project.memberIds.slice(0, 4) as memberId (memberId)}
						<Avatar member={memberById(memberId)} size="sm" ring />
					{/each}
				</div>
				<span class="inline-flex items-center gap-1.5 text-xs text-neutral-400">
					<CalendarDays size={14} />
					{formatDate(project.due)}
				</span>
			</div>
		</a>
	{:else}
		<div
			class="col-span-full rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center"
		>
			<p class="text-sm font-medium text-neutral-600">No projects match your filters</p>
			<p class="mt-1 text-sm text-neutral-400">Try a different search or status.</p>
		</div>
	{/each}
</div>
