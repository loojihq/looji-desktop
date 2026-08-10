<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowLeft, CalendarDays, FileDown, Pencil, Plus, RefreshCw, Sparkles, Trash2, User, X } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { generateAiDraft, suggestSpecialties } from '$lib/ai';
	import { exportDraftPdf, exportProjectPdf } from '$lib/pdf';
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
	import { daysFromNow, dueLabel, formatDate, formatEstimate, isOverdue, relativeTime } from '$lib/utils';

	const project = $derived(projects.find((p) => p.slug === page.params.slug));
	const projectMembers = $derived(
		project
			? project.memberIds.map(memberById).filter((m): m is Member => m !== undefined)
			: []
	);

	const columns: TaskStatus[] = ['todo', 'in_progress', 'done'];

	// Backlog folds under "To do", and in-review under "In progress", so the
	// board stays a focused 3-column kanban without hiding any tasks.
	const columnStatuses: Partial<Record<TaskStatus, TaskStatus[]>> = {
		todo: ['todo', 'backlog'],
		in_progress: ['in_progress', 'in_review'],
		done: ['done']
	};

	function tasksInColumn(status: TaskStatus) {
		if (!project) return [];
		const included = columnStatuses[status] ?? [status];
		return tasks.filter(
			(task) => task.projectId === project.id && included.includes(task.status)
		);
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

	type DragState = {
		taskId: string;
		from: TaskStatus;
		x: number;
		y: number;
		offsetX: number;
		offsetY: number;
		width: number;
	};

	type PendingDrag = {
		taskId: string;
		from: TaskStatus;
		startX: number;
		startY: number;
		offsetX: number;
		offsetY: number;
		width: number;
	};

	let drag = $state<DragState | null>(null);
	let pendingDrag = $state<PendingDrag | null>(null);
	let suppressClick = $state(false);

	function startDrag(event: PointerEvent, task: Task, from: TaskStatus) {
		if (event.button !== 0) return;
		const card = event.currentTarget as HTMLElement;
		const rect = card.getBoundingClientRect();
		pendingDrag = {
			taskId: task.id,
			from,
			startX: event.clientX,
			startY: event.clientY,
			offsetX: event.clientX - rect.left,
			offsetY: event.clientY - rect.top,
			width: rect.width
		};
		window.addEventListener('pointermove', onDragMove);
		window.addEventListener('pointerup', onDragEnd);
		window.addEventListener('pointercancel', onDragEnd);
	}

	function onDragMove(event: PointerEvent) {
		if (pendingDrag) {
			const moved = Math.hypot(
				event.clientX - pendingDrag.startX,
				event.clientY - pendingDrag.startY
			);
			if (moved < 6) return;
			draggingId = pendingDrag.taskId;
			drag = {
				taskId: pendingDrag.taskId,
				from: pendingDrag.from,
				x: event.clientX,
				y: event.clientY,
				offsetX: pendingDrag.offsetX,
				offsetY: pendingDrag.offsetY,
				width: pendingDrag.width
			};
			pendingDrag = null;
		}
		if (!drag) return;
		drag.x = event.clientX;
		drag.y = event.clientY;
		const el = document.elementFromPoint(event.clientX, event.clientY);
		const column = el?.closest('[data-status]') as HTMLElement | null;
		overStatus = column ? (column.dataset.status as TaskStatus) : null;
	}

	function onDragEnd() {
		if (drag) {
			const { taskId, from } = drag;
			if (overStatus) {
				const task = tasks.find((t) => t.id === taskId);
				const target =
					task && task.status !== overStatus && canTransition(task.status, overStatus)
						? overStatus
						: null;
				if (target) {
					dropError = '';
					moveTask(taskId, target);
				} else if (overStatus !== from && task && !canTransition(task.status, overStatus)) {
					dropError = `Cannot move "${task.title}" from ${taskStatusStyles[task.status].label} directly to ${taskStatusStyles[overStatus].label}. Allowed next steps: ${taskTransitions[task.status]
						.map((s) => taskStatusStyles[s].label)
						.join(', ')}.`;
				}
			}
			suppressClick = true;
			setTimeout(() => (suppressClick = false), 0);
		}
		draggingId = null;
		overStatus = null;
		drag = null;
		pendingDrag = null;
		window.removeEventListener('pointermove', onDragMove);
		window.removeEventListener('pointerup', onDragEnd);
		window.removeEventListener('pointercancel', onDragEnd);
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
	let editDescription = $state('');
	let editEstimate = $state('');
	let editError = $state('');

	let expandedTaskId = $state<string | null>(null);

	function toggleTaskExpand(taskId: string) {
		expandedTaskId = expandedTaskId === taskId ? null : taskId;
	}

	let exporting = $state(false);
	let exportError = $state('');

	async function handleExportProject() {
		if (!project || exporting) return;
		exporting = true;
		exportError = '';
		try {
			await exportProjectPdf({
				projectName: project.name,
				projectStatus: projectStatusStyles[project.status].label,
				projectDue: project.due,
				description: project.description,
				spec: project.spec,
				userStories: project.userStories,
				tasks: tasks
					.filter((t) => t.projectId === project.id)
					.map((t) => ({
						title: t.title,
						description: t.description,
						priority: t.priority,
						estimate: t.estimate,
						due: t.due,
						assignee: memberById(t.assigneeId)?.name ?? '',
						status: t.status
					}))
			});
		} catch (err) {
			exportError = err instanceof Error ? err.message : String(err);
		} finally {
			exporting = false;
		}
	}

	async function handleExportDraft() {
		if (!project || !aiDraft || exporting) return;
		exporting = true;
		exportError = '';
		try {
			const due = aiDue ? new Date(`${aiDue}T12:00:00`).toISOString() : project.due;
			await exportDraftPdf({
				projectName: project.name,
				projectDue: due,
				desires: aiDesires,
				spec: aiDraft.spec,
				userStories: aiDraft.userStories,
				tasks: aiDraft.tasks.map((t) => ({
					title: t.title,
					description: t.description,
					priority: t.priority,
					estimate: t.estimateHours,
					due,
					assignee: t.assignee ?? ''
				}))
			});
		} catch (err) {
			exportError = err instanceof Error ? err.message : String(err);
		} finally {
			exporting = false;
		}
	}

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
	let aiStatusMessage = $state('');
	let newStory = $state('');

	const aiStatusMessages = [
		'Understanding your request…',
		'Planning the spec…',
		'Writing user stories…',
		'Breaking down tasks…'
	];

	const selectedAiMembers = $derived(members.filter((m) => aiIncluded[m.id]));
	const draftTotalEstimate = $derived(
		aiDraft ? aiDraft.tasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0) : 0
	);

	$effect(() => {
		if (!aiLoading) return;
		let i = 0;
		aiStatusMessage = aiStatusMessages[0];
		const timer = setInterval(() => {
			i = (i + 1) % aiStatusMessages.length;
			aiStatusMessage = aiStatusMessages[i];
		}, 2200);
		return () => clearInterval(timer);
	});

	function openAiPanel() {
		if (!project) return;
		aiOpen = true;
		aiPublished = false;
		aiDraft = null;
		aiError = '';
		aiNeedsKey = !settings.aiApiKey;
		aiDue = project.due.slice(0, 10);
		aiIncluded = Object.fromEntries(members.map((m) => [m.id, true]));
		aiSpecialty = Object.fromEntries(members.map((m) => [m.id, '']));
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

	async function handleAiGenerate(refine = false) {
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
			const draft = await generateAiDraft({
				projectName: project.name,
				projectDescription: project.description,
				desires: aiDesires.trim(),
				dueDate: aiDue ? new Date(`${aiDue}T12:00:00`).toISOString() : project.due,
				members: selectedAiMembers.map((m) => ({
					name: m.name,
					specialty: aiSpecialty[m.id] ?? ''
				})),
				existingTitles: tasks.filter((t) => t.projectId === project.id).map((t) => t.title),
				apiKey: settings.aiApiKey,
				model: settings.aiModel,
				currentDraft: refine && aiDraft ? aiDraft : undefined
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

	function addStory() {
		if (!aiDraft || !newStory.trim()) return;
		aiDraft.userStories.push(newStory.trim());
		newStory = '';
	}

	async function handleAiPublish() {
		if (!project || !aiDraft) return;
		aiPublishing = true;
		aiError = '';
		try {
			const assignments: Record<string, string | null> = {};
			for (const m of members) {
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
		editDescription = task.description;
		editEstimate = task.estimate ? String(task.estimate) : '';
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
			const estimate = parseFloat(editEstimate);
			await updateTask(editTask.id, {
				title: editTitle.trim(),
				description: editDescription.trim(),
				projectId: project.id,
				status: editStatus,
				priority: editPriority,
				assigneeId: editAssigneeId || null,
				estimate: Number.isFinite(estimate) && estimate > 0 ? estimate : null,
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
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-surface px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
					onclick={handleExportProject}
					disabled={exporting}
				>
					<FileDown size={15} />
					{exporting ? 'Exporting…' : 'Export PDF'}
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
				<div class="lg:col-span-3">
					<label for="edit-description" class="mb-1 block text-xs font-medium text-neutral-600">
						Description
					</label>
					<textarea
						id="edit-description"
						rows={2}
						placeholder="What does this task involve, and how do we verify it?"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editDescription}
					></textarea>
				</div>
				<div>
					<label for="edit-estimate" class="mb-1 block text-xs font-medium text-neutral-600">
						Estimate (hours)
					</label>
					<input
						id="edit-estimate"
						type="number"
						min="0"
						step="0.5"
						placeholder="e.g. 4"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editEstimate}
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
					{#if members.length === 0}
						<p
							class="rounded-lg border border-dashed border-neutral-300 bg-surface/60 px-3 py-2.5 text-sm text-neutral-500"
						>
							No team members yet — generated tasks will be unassigned. Add members on the
							Team page.
						</p>
					{:else}
						<div class="space-y-1.5">
							{#each members as member (member.id)}
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
						onclick={() => handleAiGenerate(false)}
						disabled={aiLoading || aiPublishing}
					>
						<Sparkles size={15} />
						{aiDraft ? 'Regenerate plan' : 'Generate plan'}
					</button>
					{#if aiDraft && aiDraft.tasks.length > 0}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-surface px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={() => handleAiGenerate(true)}
							disabled={aiLoading || aiPublishing}
						>
							<RefreshCw size={15} />
							Refine with AI
						</button>
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={handleAiPublish}
							disabled={aiPublishing}
						>
							{aiPublishing ? 'Publishing…' : 'Publish to backlog'}
						</button>
					{/if}
					{#if aiDraft}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-surface px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={handleExportDraft}
							disabled={exporting || aiLoading || aiPublishing}
						>
							<FileDown size={15} />
							{exporting ? 'Exporting…' : 'Export PDF'}
						</button>
					{/if}
				</div>

				{#if aiLoading}
					<div
						class="mt-4 flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3"
					>
						<span class="flex items-center gap-1">
							<span class="size-1.5 animate-pulse rounded-full bg-indigo-400"></span>
							<span
								class="size-1.5 animate-pulse rounded-full bg-indigo-500"
								style="animation-delay: 150ms"
							></span>
							<span
								class="size-1.5 animate-pulse rounded-full bg-indigo-600"
								style="animation-delay: 300ms"
							></span>
						</span>
						<p class="text-sm font-medium text-indigo-700">{aiStatusMessage}</p>
					</div>
				{/if}
			{/if}

			{#if aiError}
				<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>
			{/if}

			{#if aiPublished}
				<p class="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
					Published — the tasks are now on the board, and the spec &amp; user stories are
					saved below.
				</p>
			{/if}

			{#if aiDraft}
				<div class="mt-5 space-y-4 border-t border-indigo-200/70 pt-4">
					<div>
						<h3
							class="text-xs font-semibold tracking-wider text-neutral-500 uppercase"
						>
							Spec
						</h3>
						<textarea
							rows={3}
							class="mt-1 w-full rounded-lg border-neutral-300 bg-surface text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={aiDraft.spec}
						></textarea>
					</div>
					<div>
						<h3
							class="text-xs font-semibold tracking-wider text-neutral-500 uppercase"
						>
							User stories
						</h3>
						<ul class="mt-1 space-y-1.5">
							{#each aiDraft.userStories as story, i (i)}
								<li class="flex items-center gap-2">
									<span class="shrink-0 text-indigo-500">•</span>
									<input
										type="text"
										class="w-full rounded-lg border-neutral-300 bg-surface px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
										bind:value={aiDraft.userStories[i]}
									/>
									<button
										type="button"
										class="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
										aria-label="Remove story"
										onclick={() => aiDraft!.userStories.splice(i, 1)}
									>
										<Trash2 size={14} />
									</button>
								</li>
							{/each}
						</ul>
						<div class="mt-2 flex items-center gap-2">
							<input
								type="text"
								placeholder="Add a user story…"
								class="w-full rounded-lg border-neutral-300 bg-surface px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
								bind:value={newStory}
								onkeydown={(event) => {
									if (event.key === 'Enter') {
										event.preventDefault();
										addStory();
									}
								}}
							/>
							<button
								type="button"
								class="shrink-0 rounded-lg border border-neutral-200 bg-surface px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
								onclick={addStory}
							>
								Add
							</button>
						</div>
					</div>
					<div>
						<h3
							class="text-xs font-semibold tracking-wider text-neutral-500 uppercase"
						>
							Tasks ({aiDraft.tasks.length})
							{#if draftTotalEstimate > 0}
								<span class="ml-2 normal-case tracking-normal text-neutral-400">
									· ~{formatEstimate(draftTotalEstimate)} total
								</span>
							{/if}
						</h3>
						<ul class="mt-1 space-y-2">
							{#each aiDraft.tasks as task, i (i)}
								<li class="rounded-lg border border-neutral-200 bg-surface/60 p-2.5">
									<div class="flex flex-wrap items-center gap-2">
										<input
											type="text"
											class="min-w-40 flex-1 rounded-lg border-neutral-300 bg-surface px-2.5 py-1.5 text-sm font-medium focus:border-indigo-500 focus:ring-indigo-500"
											bind:value={task.title}
										/>
										<select
											class="rounded-lg border-neutral-300 bg-surface px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
											bind:value={task.priority}
											aria-label="Priority"
										>
											{#each priorities as p (p)}
												<option value={p}>{priorityStyles[p].label}</option>
											{/each}
										</select>
										<input
											type="number"
											min="0"
											step="0.5"
											placeholder="hrs"
											class="w-20 rounded-lg border-neutral-300 bg-surface px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
											bind:value={task.estimateHours}
											aria-label="Estimate in hours"
										/>
										<select
											class="rounded-lg border-neutral-300 bg-surface px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
											bind:value={task.assignee}
											aria-label="Assignee"
										>
											<option value="">Unassigned</option>
											{#each selectedAiMembers as m (m.id)}
												<option value={m.name}>{m.name}</option>
											{/each}
										</select>
										<button
											type="button"
											class="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
											aria-label="Remove task"
											onclick={() => aiDraft!.tasks.splice(i, 1)}
										>
											<Trash2 size={15} />
										</button>
									</div>
									<input
										type="text"
										placeholder="Description"
										class="mt-1.5 w-full rounded-lg border-neutral-300 bg-surface px-2.5 py-1.5 text-sm text-neutral-500 focus:border-indigo-500 focus:ring-indigo-500"
										bind:value={task.description}
									/>
								</li>
							{/each}
						</ul>
					</div>
					<p class="text-xs text-neutral-400">
						Edit anything above, then hit “Refine with AI” to recalibrate the plan, or publish
						as-is.
					</p>
				</div>
			{/if}
		</section>
	{/if}

	<section class="mt-6">
		{#if exportError}
			<div
				class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
			>
				<p>{exportError}</p>
				<button
					type="button"
					class="shrink-0 rounded-md p-1 text-red-400 hover:bg-red-100 hover:text-red-700"
					aria-label="Dismiss"
					onclick={() => (exportError = '')}
				>
					<X size={14} />
				</button>
			</div>
		{/if}
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
					data-status={status}
					class="w-72 shrink-0 rounded-xl border p-3 transition-colors {overStatus === status &&
					isValidTarget(status)
						? 'border-indigo-300 bg-indigo-50/70'
						: 'border-neutral-200 bg-neutral-50/80'} {draggingId && !isValidTarget(status)
						? 'opacity-50'
						: ''}"
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
							<div
								onpointerdown={(event) => startDrag(event, task, status)}
								onclick={() => {
									if (suppressClick) {
										suppressClick = false;
										return;
									}
									toggleTaskExpand(task.id);
								}}
								role="button"
								tabindex="0"
								onkeydown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										toggleTaskExpand(task.id);
									}
								}}
								class="group touch-none cursor-grab rounded-lg border bg-white p-3 shadow-xs transition-colors select-none {expandedTaskId ===
								task.id
									? 'border-indigo-300'
									: 'border-neutral-200 hover:border-neutral-300'} {draggingId === task.id
									? 'opacity-40'
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
											onpointerdown={(event) => event.stopPropagation()}
											onclick={(event) => {
												event.stopPropagation();
												startEditTask(task);
											}}
										>
											<Pencil size={13} />
										</button>
										<button
											type="button"
											class="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
											aria-label="Delete {task.title}"
											onpointerdown={(event) => event.stopPropagation()}
											onclick={(event) => {
												event.stopPropagation();
												deleteTaskTarget = task;
											}}
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
								{#if expandedTaskId === task.id}
									<div class="mt-2 space-y-2 border-t border-neutral-100 pt-2">
										{#if task.description}
											<p
												class="text-xs leading-relaxed whitespace-pre-line text-neutral-500"
											>
												{task.description}
											</p>
										{:else}
											<p class="text-xs text-neutral-400">
												No description yet — use the pencil to add one.
											</p>
										{/if}
										<dl class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
											<div class="flex items-center gap-1">
												<dt class="text-neutral-400">Priority</dt>
												<dd class="font-medium text-neutral-700">
													{priorityStyles[task.priority].label}
												</dd>
											</div>
											<div class="flex items-center gap-1">
												<dt class="text-neutral-400">Estimate</dt>
												<dd class="font-medium text-neutral-700">
													{formatEstimate(task.estimate) || '—'}
												</dd>
											</div>
											<div class="flex items-center gap-1">
												<dt class="text-neutral-400">Assignee</dt>
												<dd class="font-medium text-neutral-700">
													{assignee?.name ?? 'Unassigned'}
												</dd>
											</div>
											{#if task.updatedAt}
												<div class="flex items-center gap-1">
													<dt class="text-neutral-400">Updated</dt>
													<dd class="font-medium text-neutral-700">
														{relativeTime(task.updatedAt)}
													</dd>
												</div>
											{/if}
										</dl>
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
									<div class="flex items-center gap-2">
										{#if task.status !== status}
											<span
												class="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
											>
												{taskStatusStyles[task.status].label}
											</span>
										{/if}
										{#if formatEstimate(task.estimate)}
											<span
													class="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700"
											>
												{formatEstimate(task.estimate)}
											</span>
										{/if}
										<span
											class={isOverdue(task.due)
												? 'text-xs font-medium text-red-600'
												: 'text-xs text-neutral-400'}
										>
											{dueLabel(task.due)}
										</span>
									</div>
								</footer>
							</div>
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

		{#if drag}
			{@const ghostTask = tasks.find((t) => t.id === drag?.taskId)}
			{#if ghostTask}
				<div
					class="pointer-events-none fixed z-50 rounded-lg border border-indigo-300 bg-surface p-3 shadow-xl"
					style="left: {drag.x - drag.offsetX}px; top: {drag.y - drag.offsetY}px; width: {drag.width}px;"
				>
					<p class="text-sm font-medium text-neutral-800">{ghostTask.title}</p>
				</div>
			{/if}
		{/if}
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
