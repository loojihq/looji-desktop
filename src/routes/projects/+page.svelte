<script lang="ts">
	import { resolve } from '$app/paths';
	import { CalendarDays, FolderKanban, Pencil, Plus, Search, Trash2, X } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { projectAccents, projectStatusStyles } from '$lib/badges';
	import {
		createProject,
		deleteProject,
		memberById,
		projectProgress,
		projects,
		updateProject
	} from '$lib/store.svelte';
	import { projectStatuses, type Project, type ProjectStatus } from '$lib/types';
	import { daysFromNow, formatDate } from '$lib/utils';

	let query = $state('');
	let statusFilter = $state<'all' | ProjectStatus>('all');
	let deleteTarget = $state<Project | null>(null);
	let deleteError = $state('');

	let formOpen = $state(false);
	let editTarget = $state<Project | null>(null);
	let formName = $state('');
	let formDescription = $state('');
	let formStatus = $state<ProjectStatus>('planning');
	let formDue = $state('');
	let formError = $state('');

	const tabs = $derived([
		{ value: 'all', label: 'All', count: projects.length },
		{ value: 'planning', label: 'Planning', count: projects.filter((p) => p.status === 'planning').length },
		{ value: 'active', label: 'Active', count: projects.filter((p) => p.status === 'active').length },
		{ value: 'on_hold', label: 'On hold', count: projects.filter((p) => p.status === 'on_hold').length },
		{ value: 'completed', label: 'Completed', count: projects.filter((p) => p.status === 'completed').length }
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

	function openCreate() {
		editTarget = null;
		formName = '';
		formDescription = '';
		formStatus = 'planning';
		formDue = daysFromNow(30).slice(0, 10);
		formError = '';
		formOpen = true;
	}

	function openEdit(project: Project) {
		editTarget = project;
		formName = project.name;
		formDescription = project.description;
		formStatus = project.status;
		formDue = project.due.slice(0, 10);
		formError = '';
		formOpen = true;
	}

	function closeForm() {
		formOpen = false;
		editTarget = null;
		formError = '';
	}

	async function handleSave() {
		if (!formName.trim()) return;
		formError = '';
		try {
			const payload = {
				name: formName.trim(),
				description: formDescription.trim(),
				status: formStatus,
				due: formDue ? new Date(`${formDue}T12:00:00`).toISOString() : daysFromNow(30)
			};
			if (editTarget) await updateProject(editTarget.id, payload);
			else await createProject(payload);
			closeForm();
		} catch (err) {
			console.error('Failed to save project', err);
			formError = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		try {
			await deleteProject(deleteTarget.id);
			deleteTarget = null;
		} catch (err) {
			deleteError = err instanceof Error ? err.message : String(err);
		}
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
		onclick={() => (formOpen ? closeForm() : openCreate())}
		class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
	>
		{#if formOpen}
			<X size={16} />
		{:else}
			<Plus size={16} strokeWidth={2.5} />
		{/if}
		{formOpen ? 'Cancel' : 'New project'}
	</button>
</div>

{#if formOpen}
	<form
		onsubmit={handleSave}
		class="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-xs"
	>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div class="sm:col-span-2">
				<label for="project-name" class="mb-1 block text-xs font-medium text-neutral-600">
					Project name
				</label>
				<input
					id="project-name"
					type="text"
					placeholder="e.g. iOS redesign"
					class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={formName}
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
					bind:value={formStatus}
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
					class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={formDue}
				/>
			</div>
			<div class="lg:col-span-4">
				<label for="project-description" class="mb-1 block text-xs font-medium text-neutral-600">
					Description
				</label>
				<textarea
					id="project-description"
					rows={2}
					placeholder="What is this project about?"
					class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={formDescription}
				></textarea>
			</div>
		</div>
		{#if formError}
			<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
		{/if}
		<div class="mt-4 flex items-center gap-2">
			<button
				type="submit"
				class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
			>
				{editTarget ? 'Save changes' : 'Create project'}
			</button>
			<button
				type="button"
				class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
				onclick={closeForm}
			>
				Cancel
			</button>
		</div>
	</form>
{/if}

<div class="mb-6 flex flex-wrap items-center gap-3">
	<div class="flex flex-wrap items-center gap-2">
		{#each tabs as tab (tab.value)}
			<button
				type="button"
				onclick={() => (statusFilter = tab.value)}
				class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {statusFilter === tab.value
					? 'bg-foreground text-background'
					: 'border border-neutral-200 bg-surface text-neutral-600 hover:bg-neutral-50'}"
			>
				{tab.label}
				<span class="ml-1.5 text-xs text-neutral-400">{tab.count}</span>
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
		<article
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
						<a
							href={resolve(`/projects/${project.slug}`)}
							class="font-semibold tracking-tight text-neutral-900 hover:text-indigo-600"
						>
							{project.name}
						</a>
						<p class="text-xs text-neutral-400">{project.memberIds.length} members</p>
					</div>
				</div>
				<div class="flex items-center gap-1">
					<Badge variant="project" value={project.status} />
					<button
						type="button"
						class="rounded-lg p-1.5 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100"
						aria-label="Edit {project.name}"
						onclick={() => openEdit(project)}
					>
						<Pencil size={14} />
					</button>
					<button
						type="button"
						class="rounded-lg p-1.5 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
						aria-label="Delete {project.name}"
						onclick={() => (deleteTarget = project)}
					>
						<Trash2 size={14} />
					</button>
				</div>
			</div>

			<p class="mt-4 line-clamp-2 text-sm text-neutral-500">{project.description}</p>

			<div class="mt-4">
				<div class="mb-1.5 flex items-center justify-between text-xs">
					<span class="font-medium text-neutral-400">Progress</span>
					<span class="font-semibold text-neutral-600">{projectProgress(project.id)}%</span>
				</div>
				<ProgressBar
					value={projectProgress(project.id)}
					color={projectAccents[project.color]?.bar ?? 'bg-indigo-500'}
				/>
			</div>

			<div class="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
				<div class="flex -space-x-2">
					{#each project.memberIds.slice(0, 4) as memberId (memberId)}
						{@const member = memberById(memberId)}
						{#if member}
							<Avatar member={member} size="sm" ring />
						{/if}
					{/each}
				</div>
				<span class="inline-flex items-center gap-1.5 text-xs text-neutral-400">
					<CalendarDays size={14} />
					{formatDate(project.due)}
				</span>
			</div>
		</article>
	{:else}
		{#if projects.length === 0}
			<div
				class="col-span-full rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center"
			>
				<p class="text-sm font-medium text-neutral-600">No projects yet</p>
				<p class="mt-1 text-sm text-neutral-400">Create your first project to get started.</p>
				<button
					type="button"
					onclick={openCreate}
					class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
				>
					<Plus size={15} />
					New project
				</button>
			</div>
		{:else}
			<div
				class="col-span-full rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center"
			>
				<p class="text-sm font-medium text-neutral-600">No projects match your filters</p>
				<p class="mt-1 text-sm text-neutral-400">Try a different search or status.</p>
			</div>
		{/if}
	{/each}
</div>

{#if deleteError}
	<div
		class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
	>
		<p>{deleteError}</p>
		<button
			type="button"
			class="shrink-0 rounded-md p-1 text-red-400 hover:bg-red-100 hover:text-red-700"
			aria-label="Dismiss"
			onclick={() => (deleteError = '')}
		>
			<X size={14} />
		</button>
	</div>
{/if}

<ConfirmDialog
	open={deleteTarget !== null}
	title="Delete project?"
	message={`This will permanently delete "${deleteTarget?.name ?? ''}" and all of its tasks.`}
	confirmLabel="Delete project"
	onConfirm={handleDelete}
	onCancel={() => (deleteTarget = null)}
/>
