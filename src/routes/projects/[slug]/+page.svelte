<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowLeft, CalendarDays, Pencil, Plus, Sparkles, Trash2, User, X } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { generateAiDraft, suggestSpecialties } from '$lib/ai';
	import { projectAccents, priorityStyles, projectStatusStyles, taskStatusStyles } from '$lib/badges';
	import {
		canTransition,
		createTask,
		deleteProject,
		deleteTask,
		memberById,
		members,
		moveTask,
		projectProgress,
		projects,
		publishAiDraft,
		settings,
		tasks,
		taskTransitions,
		updateProject,
		updateTask
	} from '$lib/store.svelte';
	import {
		priorities,
		projectStatuses,
		taskStatuses,
		type AiDraft,
		type Member,
		type Priority,
		type ProjectStatus,
		type Task,
		type TaskStatus
	} from '$lib/types';
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
	let dropError = $state('');

	function isValidTarget(status: TaskStatus): boolean {
		if (!draggingId) return false;
		const task = tasks.find((t) => t.id === draggingId);
		if (!task) return false;
		return canTransition(task.status, status);
	}

	function handleDrop(status: TaskStatus) {
		if (draggingId) {
			const task = tasks.find((t) => t.id === draggingId);
			if (task && !canTransition(task.status, status)) {
				dropError = `Cannot move "${task.title}" from ${taskStatusStyles[task.status].label} directly to ${taskStatusStyles[status].label}. Allowed next steps: ${taskTransitions[task.status]
					.map((s) => taskStatusStyles[s].label)
					.join(', ')}.`;
			} else {
				dropError = '';
				moveTask(draggingId, status);
			}
		}
		draggingId = null;
		overStatus = null;
	}

	let addingStatus = $state<TaskStatus | null>(null);
	let newTitle = $state('');
	let newAssigneeId = $state('');
	let deleteProjectOpen = $state(false);
	let deleteTaskTarget = $state<Task | null>(null);
	let deleteError = $state('');

	let projectEditOpen = $state(false);
	let projName = $state('');
	let projDescription = $state('');
	let projStatus = $state<ProjectStatus>('planning');
	let projDue = $state('');
	let projError = $state('');

	let editTask = $state<Task | null>(null);
	let editTitle = $state('');
	let editStatus = $state<TaskStatus>('todo');
	let editPriority = $state<Priority>('medium');
	let editAssigneeId = $state('');
	let editDue = $state('');
	let editTags = $state('');
	let editError = $state('');

	let aiOpen = $state(false);
	let aiDesires = $state('');
	let aiDue = $state('');
	let aiSpecialties = $state<string[]>([]);
	let aiSuggesting = $state(false);
	let aiIncluded = $state<Record<string, boolean>>({});
	let aiSpecialty = $state<Record<string, string>>({});
	let aiLoading = $state(false);
	let aiPublishing = $state(false);
	let aiError = $state('');
	let aiDraft = $state<AiDraft | null>(null);
	let aiPublished = $state(false);
	let aiNeedsKey = $state(false);

	function openAiPanel() {
		if (!project) return;
		aiOpen = true;
		aiPublished = false;
		aiDraft = null;
		aiError = '';
		aiNeedsKey = !settings.aiApiKey;
		aiDue = project.due.slice(0, 10);
		aiIncluded = Object.fromEntries(projectMembers.map((m) => [m.id, true]));
		aiSpecialty = Object.fromEntries(projectMembers.map((m) => [m.id, '']));
		if (!aiNeedsKey) suggestSpecialtiesNow();
	}

	function closeAiPanel() {
		aiOpen = false;
		aiDraft = null;
		aiError = '';
		aiPublished = false;
	}

	async function suggestSpecialtiesNow() {
		if (!project || !settings.aiApiKey) return;
		aiSuggesting = true;
		aiError = '';
		try {
			aiSpecialties = await suggestSpecialties(
				project.name,
				project.description,
				settings.aiApiKey,
				settings.aiModel
			);
		} catch (err) {
			aiError = err instanceof Error ? err.message : String(err);
		} finally {
			aiSuggesting = false;
		}
	}

	async function handleAiGenerate() {
		if (!project) return;
		if (!settings.aiApiKey) {
			aiNeedsKey = true;
			return;
		}
		if (!aiDesires.trim()) {
			aiError = 'Describe what you want to build first.';
			return;
		}
		aiLoading = true;
		aiError = '';
		aiPublished = false;
		try {
			const selected = projectMembers.filter((m) => aiIncluded[m.id]);
			const draft = await generateAiDraft({
				projectName: project.name,
				projectDescription: project.description,
				desires: aiDesires.trim(),
				dueDate: aiDue ? new Date(`${aiDue}T12:00:00`).toISOString() : project.due,
				members: selected.map((m) => ({ name: m.name, specialty: aiSpecialty[m.id] ?? '' })),
				existingTitles: tasks.filter((t) => t.projectId === project.id).map((t) => t.title),
				apiKey: settings.aiApiKey,
				model: settings.aiModel
			});
			if (draft.tasks.length === 0 && !draft.spec && draft.userStories.length === 0) {
				aiError = 'The AI returned an empty plan. Try rephrasing your desires.';
			} else {
				aiDraft = draft;
			}
		} catch (err) {
			aiError = err instanceof Error ? err.message : String(err);
		} finally {
			aiLoading = false;
		}
	}

	async function handleAiPublish() {
		if (!project || !aiDraft) return;
		aiPublishing = true;
		aiError = '';
		try {
			const assignments: Record<string, string | null> = {};
			for (const m of projectMembers) {
				if (aiIncluded[m.id]) assignments[m.name] = m.id;
			}
			const due = aiDue ? new Date(`${aiDue}T12:00:00`).toISOString() : project.due;
			await publishAiDraft(project.id, aiDraft, due, assignments);
			aiPublished = true;
			aiDraft = null;
			aiDesires = '';
		} catch (err) {
			aiError = err instanceof Error ? err.message : String(err);
		} finally {
			aiPublishing = false;
		}
	}

	function openProjectEdit() {
		if (!project) return;
		projName = project.name;
		projDescription = project.description;
		projStatus = project.status;
		projDue = project.due.slice(0, 10);
		projError = '';
		projectEditOpen = true;
	}

	function cancelProjectEdit() {
		projectEditOpen = false;
		projError = '';
	}

	async function handleProjectSave() {
		if (!project || !projName.trim()) return;
		projError = '';
		try {
			await updateProject(project.id, {
				name: projName.trim(),
				description: projDescription.trim(),
				status: projStatus,
				due: projDue ? new Date(`${projDue}T12:00:00`).toISOString() : daysFromNow(30)
			});
			cancelProjectEdit();
		} catch (err) {
			console.error('Failed to save project', err);
			projError = err instanceof Error ? err.message : String(err);
		}
	}

	function startEditTask(task: Task) {
		editTask = task;
		editTitle = task.title;
		editStatus = task.status;
		editPriority = task.priority;
		editAssigneeId = task.assigneeId ?? '';
		editDue = task.due.slice(0, 10);
		editTags = task.tags.join(', ');
		editError = '';
	}

	function cancelEditTask() {
		editTask = null;
		editError = '';
	}

	async function handleTaskSave() {
		if (!editTask || !project || !editTitle.trim()) return;
		editError = '';
		try {
			await updateTask(editTask.id, {
				title: editTitle.trim(),
				projectId: project.id,
				status: editStatus,
				priority: editPriority,
				assigneeId: editAssigneeId || null,
				due: editDue ? new Date(`${editDue}T12:00:00`).toISOString() : daysFromNow(7),
				tags: editTags
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			});
			cancelEditTask();
		} catch (err) {
			console.error('Failed to save task', err);
			editError = err instanceof Error ? err.message : String(err);
		}
	}

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

	async function handleDeleteTask() {
		if (!deleteTaskTarget) return;
		try {
			await deleteTask(deleteTaskTarget.id);
			deleteTaskTarget = null;
		} catch (err) {
			deleteError = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleDeleteProject() {
		if (!project) return;
		try {
			await deleteProject(project.id);
			deleteProjectOpen = false;
			await goto('/projects');
		} catch (err) {
			deleteError = err instanceof Error ? err.message : String(err);
		}
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
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
					onclick={openAiPanel}
				>
					<Sparkles size={15} />
					Generate with AI
				</button>
				<span
					class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-600"
				>
					<CalendarDays size={15} />
					Due {formatDate(project.due)}
				</span>
				<button
					type="button"
					class="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
					aria-label="Edit project"
					onclick={openProjectEdit}
				>
					<Pencil size={15} />
				</button>
				<button
					type="button"
					class="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
					aria-label="Delete project"
					onclick={() => (deleteProjectOpen = true)}
				>
					<Trash2 size={15} />
				</button>
			</div>
		</div>

		<div class="mt-6">
			<div class="mb-1.5 flex items-center justify-between text-xs">
				<span class="font-medium text-neutral-400">Progress</span>
				<span class="font-semibold text-neutral-600">{projectProgress(project.id)}%</span>
			</div>
			<ProgressBar
				value={projectProgress(project.id)}
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

	{#if deleteError}
		<div class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
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

	{#if projectEditOpen}
		<form
			onsubmit={handleProjectSave}
			class="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-xs"
		>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="sm:col-span-2">
					<label for="proj-name" class="mb-1 block text-xs font-medium text-neutral-600">
						Project name
					</label>
					<input
						id="proj-name"
						type="text"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={projName}
						required
					/>
				</div>
				<div>
					<label for="proj-status" class="mb-1 block text-xs font-medium text-neutral-600">
						Status
					</label>
					<select
						id="proj-status"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={projStatus}
					>
						{#each projectStatuses as s (s)}
							<option value={s}>{projectStatusStyles[s].label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="proj-due" class="mb-1 block text-xs font-medium text-neutral-600">
						Target date
					</label>
					<input
						id="proj-due"
						type="date"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={projDue}
					/>
				</div>
				<div class="lg:col-span-4">
					<label for="proj-description" class="mb-1 block text-xs font-medium text-neutral-600">
						Description
					</label>
					<textarea
						id="proj-description"
						rows={2}
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={projDescription}
					></textarea>
				</div>
			</div>
			{#if projError}
				<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{projError}</p>
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
					onclick={cancelProjectEdit}
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	{#if editTask}
		<form
			onsubmit={handleTaskSave}
			class="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-xs"
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
					onclick={cancelEditTask}
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	{#if aiOpen}
		<section class="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-xs">
			<header class="flex items-start justify-between gap-3">
				<div>
					<h2 class="font-semibold tracking-tight text-neutral-900">Generate with AI</h2>
					<p class="mt-0.5 text-sm text-neutral-500">
						Describe what you want, pick the team, and the AI drafts a spec, user stories and
						tasks.
					</p>
				</div>
				<button
					type="button"
					class="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
					aria-label="Close AI generator"
					onclick={closeAiPanel}
				>
					<X size={16} />
				</button>
			</header>

			{#if aiNeedsKey}
				<div
					class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
				>
					Add your DeepSeek API key in{' '}
					<a href={resolve('/settings')} class="font-medium underline">Settings → AI</a> to use
					the AI generator.
				</div>
			{:else}
				<div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
					<div>
						<label for="ai-desires" class="mb-1 block text-xs font-medium text-neutral-600">
							What do you want to build?
						</label>
						<textarea
							id="ai-desires"
							rows={3}
							placeholder="e.g. A mobile app where users can track their daily habits, set reminders, and see weekly streaks…"
							class="w-full rounded-lg border-neutral-300 bg-surface text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={aiDesires}
						></textarea>
					</div>
					<div>
						<label for="ai-due" class="mb-1 block text-xs font-medium text-neutral-600">
							Target date
						</label>
						<input
							id="ai-due"
							type="date"
							class="w-full rounded-lg border-neutral-300 bg-surface text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={aiDue}
						/>
					</div>
				</div>

				<div class="mt-4">
					<div class="mb-1.5 flex items-center justify-between gap-3">
						<p class="text-xs font-medium text-neutral-600">Team &amp; specialties</p>
						<button
							type="button"
							class="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
							onclick={suggestSpecialtiesNow}
							disabled={aiSuggesting}
						>
							{aiSuggesting
								? 'Suggesting…'
								: aiSpecialties.length > 0
									? 'Re-suggest specialties'
									: 'Suggest specialties from description'}
						</button>
					</div>
					{#if projectMembers.length === 0}
						<p
							class="rounded-lg border border-dashed border-neutral-300 bg-surface/60 px-3 py-2.5 text-sm text-neutral-500"
						>
							No team members yet — generated tasks will be unassigned. Add members on the
							Team page.
						</p>
					{:else}
						<div class="space-y-1.5">
							{#each projectMembers as member (member.id)}
								<div
									class="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-surface px-3 py-2"
								>
									<input
										type="checkbox"
										class="size-4 shrink-0 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
										checked={aiIncluded[member.id]}
										onchange={() => (aiIncluded[member.id] = !aiIncluded[member.id])}
										aria-label="Include {member.name}"
									/>
									<Avatar member={member} size="sm" />
									<span class="w-36 truncate text-sm font-medium text-neutral-800">
										{member.name}
									</span>
									<input
										type="text"
										list="ai-specialties"
										placeholder="Specialty (optional)"
										class="w-full min-w-40 flex-1 rounded-lg border-neutral-300 bg-surface px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-40"
										bind:value={aiSpecialty[member.id]}
										disabled={!aiIncluded[member.id]}
									/>
								</div>
							{/each}
						</div>
						<datalist id="ai-specialties">
							{#each aiSpecialties as s (s)}
								<option value={s}></option>
							{/each}
						</datalist>
					{/if}
				</div>

				<div class="mt-4 flex items-center gap-2">
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
						onclick={handleAiGenerate}
						disabled={aiLoading || aiPublishing}
					>
						<Sparkles size={15} />
						{aiLoading ? 'Generating…' : 'Generate plan'}
					</button>
					{#if aiDraft && aiDraft.tasks.length > 0}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={handleAiPublish}
							disabled={aiPublishing}
						>
							{aiPublishing ? 'Publishing…' : 'Publish to backlog'}
						</button>
					{/if}
				</div>
			{/if}

			{#if aiError}
				<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>
			{/if}

			{#if aiPublished}
				<p class="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
					Published — the tasks are now in the Backlog column, and the spec &amp; user stories are
					saved below.
				</p>
			{/if}

			{#if aiDraft}
				<div class="mt-5 space-y-4 border-t border-indigo-200/70 pt-4">
					{#if aiDraft.spec}
						<div>
							<h3
								class="text-xs font-semibold tracking-wider text-neutral-500 uppercase"
							>
								Spec
							</h3>
							<p class="mt-1 text-sm whitespace-pre-line text-neutral-700">{aiDraft.spec}</p>
						</div>
					{/if}
					{#if aiDraft.userStories.length > 0}
						<div>
							<h3
								class="text-xs font-semibold tracking-wider text-neutral-500 uppercase"
							>
								User stories
							</h3>
							<ul class="mt-1 space-y-1">
								{#each aiDraft.userStories as story (story)}
									<li class="flex gap-1.5 text-sm text-neutral-600">
										<span class="text-indigo-500">•</span>
										<span>{story}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
					<div>
						<h3
							class="text-xs font-semibold tracking-wider text-neutral-500 uppercase"
						>
							Tasks ({aiDraft.tasks.length})
						</h3>
						<ul class="mt-1 divide-y divide-neutral-100">
							{#each aiDraft.tasks as task (task.title)}
								<li class="flex items-start gap-2 py-2">
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-neutral-800">{task.title}</p>
										{#if task.description}
											<p class="mt-0.5 text-xs text-neutral-500">{task.description}</p>
										{/if}
									</div>
									<Badge variant="priority" value={task.priority} />
									{#if task.assignee}
										<span class="shrink-0 text-xs text-neutral-500">{task.assignee}</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<section class="mt-6">
		{#if dropError}
			<div class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
				<p>{dropError}</p>
				<button
					type="button"
					class="shrink-0 rounded-md p-1 text-red-400 hover:bg-red-100 hover:text-red-700"
					aria-label="Dismiss"
					onclick={() => (dropError = '')}
				>
					<X size={14} />
				</button>
			</div>
		{/if}
		<div class="flex gap-4 overflow-x-auto pb-4">
			{#each columns as status (status)}
				<div
					role="group"
					aria-label={taskStatusStyles[status].label}
					class="w-72 shrink-0 rounded-xl border p-3 transition-colors {overStatus === status &&
					isValidTarget(status)
						? 'border-indigo-300 bg-indigo-50/70'
						: 'border-neutral-200 bg-neutral-50/80'} {draggingId && !isValidTarget(status)
						? 'opacity-50'
						: ''}"
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
									<div
										class="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
									>
										<button
											type="button"
											class="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
											aria-label="Edit {task.title}"
											onclick={() => startEditTask(task)}
										>
											<Pencil size={13} />
										</button>
										<button
											type="button"
											class="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
											aria-label="Delete {task.title}"
											onclick={() => (deleteTaskTarget = task)}
										>
											<Trash2 size={13} />
										</button>
									</div>
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

	{#if project?.spec || (project?.userStories?.length ?? 0) > 0}
		<section class="mt-6 rounded-xl border border-neutral-200 bg-surface p-5 shadow-xs">
			<h2 class="font-semibold tracking-tight text-neutral-900">Project plan</h2>
			{#if project.spec}
				<div class="mt-3">
					<h3 class="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
						Spec
					</h3>
					<p class="mt-1 text-sm whitespace-pre-line text-neutral-700">{project.spec}</p>
				</div>
			{/if}
			{#if project.userStories.length > 0}
				<div class="mt-4">
					<h3 class="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
						User stories
					</h3>
					<ul class="mt-1 space-y-1">
						{#each project.userStories as story (story)}
							<li class="flex gap-1.5 text-sm text-neutral-600">
								<span class="text-indigo-500">•</span>
								<span>{story}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}
{/if}

<ConfirmDialog
	open={deleteTaskTarget !== null}
	title="Delete task?"
	message={`This will permanently delete "${deleteTaskTarget?.title ?? ''}".`}
	confirmLabel="Delete task"
	onConfirm={handleDeleteTask}
	onCancel={() => (deleteTaskTarget = null)}
/>
<ConfirmDialog
	open={deleteProjectOpen}
	title="Delete project?"
	message={`This will permanently delete "${project?.name ?? ''}" and all of its tasks.`}
	confirmLabel="Delete project"
	onConfirm={handleDeleteProject}
	onCancel={() => (deleteProjectOpen = false)}
/>
