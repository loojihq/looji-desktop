<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { open } from '@tauri-apps/plugin-dialog';
	import { ArrowLeft, CalendarDays, Columns, FileDown, FolderGit2, Gauge, GitBranch, LayoutGrid, List, Map, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, User, X } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import Select from '$lib/components/Select.svelte';
	import { checkTaskAgainstRepo, explainTask, generateAiDraft, suggestSpecialties, taskChatFollowUp, type AiDraftStatus, type RepoContext, type TaskChatMessage, type TaskContext } from '$lib/ai';
	import { exportDraftPdf, exportProjectPdf } from '$lib/pdf';
	import {
		extractSymbols,
		isKeyFile,
		readRelevantHunks,
		readRepoFiles,
		repoMapText,
		repoTreeText,
		scanRepo,
		type RepoScan
	} from '$lib/repo';
	import { projectAccents, priorityStyles, projectStatusStyles, taskStatusStyles } from '$lib/badges';
	import {
		activeAiProvider,
		clearAiDraft,
		clearTaskExplanation,
		createTask,
		deleteProject,
		deleteTask,
		loadAiDraft,
		loadRepoIndex,
		loadTaskExplanation,
		loadTaskExplanationIds,
		memberById,
		members,
		moveTask,
		projectProgress,
		projects,
		publishAiDraft,
		saveAiDraft,
		saveRepoIndex,
		saveTaskExplanation,
		settings,
		status,
		tasks,
		updateProject,
		updateSetting,
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
		type SavedAiDraft,
		type Task,
		type TaskStatus
	} from '$lib/types';
	import {
		daysFromNow,
		dueLabel,
		foldedBoardGroup,
		formatDate,
		formatEstimate,
		isOverdue,
		minutesToTime,
		relativeTime,
		resolveVisualDropIndex,
		timeToMinutes
	} from '$lib/utils';

	const project = $derived(projects.find((p) => p.slug === page.params.slug));
	const projectMembers = $derived(
		project
			? project.memberIds.map(memberById).filter((m): m is Member => m !== undefined)
			: []
	);

	const boardColumns = $derived.by(() => {
		const order: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
		const core: TaskStatus[] = ['todo', 'in_progress', 'done'];
		return order.filter((s) => core.includes(s) || settings.boardStatuses.includes(s));
	});

	// Columns display by the task's stored sequence (sortOrder), which the AI
	// publish fills with the plan order and the user can now change by dragging.
	const PRIORITY_WEIGHT: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

	// Disabled statuses fold into their neighbours so no task ever disappears:
	// backlog → To do, in_review → In progress. Folded tasks keep their own
	// sequence and append after the visible status's cards.
	/** Real task statuses shown together under a given board column. */
	function foldedGroup(displayStatus: TaskStatus): TaskStatus[] {
		return foldedBoardGroup(displayStatus, settings.boardStatuses) as TaskStatus[];
	}

	function tasksInColumn(status: TaskStatus) {
		if (!project) return [];
		const included = foldedGroup(status);
		return tasks
			.filter(
				(task) =>
					task.projectId === project.id && included.includes(task.status) && matchesQuery(task)
			)
			.sort(
				(a, b) =>
					a.sortOrder +
						(a.status !== status ? 100000 : 0) -
						(b.sortOrder + (b.status !== status ? 100000 : 0)) ||
					PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
					a.title.localeCompare(b.title)
			);
	}

	const openCount = $derived(
		project
			? tasks.filter((task) => task.projectId === project.id && task.status !== 'done').length
			: 0
	);

	let draggingId = $state<string | null>(null);
	let overStatus = $state<TaskStatus | null>(null);
	let boardQuery = $state('');
	let boardPriority = $state<'all' | Priority>('all');
	let boardAssignee = $state<'all' | 'none' | string>('all');

	// When search/filters are active the visible cards are a subset, so precise
	// drop positions can't map to the full column — reordering falls back to
	// appending at the end of the column (no insertion indicator).
	const boardFiltering = $derived(
		boardQuery.trim() !== '' || boardPriority !== 'all' || boardAssignee !== 'all'
	);

	function clearBoardFilters() {
		boardQuery = '';
		boardPriority = 'all';
		boardAssignee = 'all';
	}

	function matchesQuery(task: Task): boolean {
		const q = boardQuery.trim().toLowerCase();
		const matchesText =
			!q ||
			task.title.toLowerCase().includes(q) ||
			task.description.toLowerCase().includes(q) ||
			task.tags.some((t) => t.toLowerCase().includes(q));
		if (!matchesText) return false;
		if (boardPriority !== 'all' && task.priority !== boardPriority) return false;
		if (boardAssignee === 'none') {
			if (task.assigneeId) return false;
		} else if (boardAssignee !== 'all' && task.assigneeId !== boardAssignee) {
			return false;
		}
		return true;
	}

	type DragState = {
		taskId: string;
		x: number;
		y: number;
		offsetX: number;
		offsetY: number;
		width: number;
	};

	type PendingDrag = {
		taskId: string;
		startX: number;
		startY: number;
		offsetX: number;
		offsetY: number;
		width: number;
	};

	let drag = $state<DragState | null>(null);
	let pendingDrag = $state<PendingDrag | null>(null);
	let suppressClick = $state(false);
	let dropColumn = $state<TaskStatus | null>(null);
	let dropIndex = $state(-1);
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	function activateDrag() {
		if (!pendingDrag) return;
		draggingId = pendingDrag.taskId;
		drag = {
			taskId: pendingDrag.taskId,
			x: pendingDrag.startX,
			y: pendingDrag.startY,
			offsetX: pendingDrag.offsetX,
			offsetY: pendingDrag.offsetY,
			width: pendingDrag.width
		};
		pendingDrag = null;
	}

	function startDrag(event: PointerEvent, task: Task) {
		if (event.button !== 0) return;
		const card = event.currentTarget as HTMLElement;
		const rect = card.getBoundingClientRect();
		pendingDrag = {
			taskId: task.id,
			startX: event.clientX,
			startY: event.clientY,
			offsetX: event.clientX - rect.left,
			offsetY: event.clientY - rect.top,
			width: rect.width
		};
		window.addEventListener('pointermove', onDragMove);
		window.addEventListener('pointerup', onDragEnd);
		window.addEventListener('pointercancel', onDragEnd);
		// Grab the tile on long press even when the cursor hasn't moved yet;
		// a plain tap releases before the timer fires and still just expands.
		if (longPressTimer) clearTimeout(longPressTimer);
		longPressTimer = setTimeout(() => {
			longPressTimer = null;
			activateDrag();
		}, 400);
	}

	function onDragMove(event: PointerEvent) {
		if (pendingDrag) {
			const moved = Math.hypot(
				event.clientX - pendingDrag.startX,
				event.clientY - pendingDrag.startY
			);
			if (moved < 6) return;
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
			activateDrag();
		}
		if (!drag) return;
		drag.x = event.clientX;
		drag.y = event.clientY;
		const el = document.elementFromPoint(event.clientX, event.clientY);
		const column = el?.closest('[data-status]') as HTMLElement | null;
		if (column) {
			const status = column.dataset.status as TaskStatus;
			overStatus = status;
			if (boardFiltering) {
				dropColumn = status;
				dropIndex = -1;
			} else {
				// Compute where inside the column the card would land: the index of
				// the card whose midpoint the pointer is above, or the end otherwise.
				// This index includes the dragged card's own (dimmed) tile, matching
				// the inclusive `i` the template renders each card at - resolveDrop()
				// below is what excludes it when translating to moveTask's index.
				const cards = column.querySelectorAll<HTMLElement>('[data-task-id]');
				let insertAt = cards.length;
				for (let i = 0; i < cards.length; i++) {
					const rect = cards[i].getBoundingClientRect();
					if (event.clientY < rect.top + rect.height / 2) {
						insertAt = i;
						break;
					}
				}
				dropColumn = status;
				dropIndex = insertAt;
			}
		} else {
			overStatus = null;
			dropColumn = null;
			dropIndex = -1;
		}
	}

	/**
	 * Translates a visual drop - the display column, and `visualIndex` within
	 * its rendered card list (which still includes the dragged card's own
	 * dimmed tile, same as the template's `i`) - into the real status/index
	 * moveTask needs.
	 *
	 * Two adjustments happen here: (1) the dragged card's own slot is excluded
	 * before counting, since moveTask's column list never contains it either
	 * - counting it in would shift every position after it by one; (2) when
	 * the target column folds a hidden status in (e.g. Backlog folded into
	 * "To do"), reordering within the folded group must not silently
	 * promote/demote the task's real status - only an actual cross-group drop
	 * (dropped on a column outside its current folded group) should change it.
	 */
	function resolveDrop(
		task: Task,
		displayStatus: TaskStatus,
		visualIndex: number
	): { status: TaskStatus; index: number } {
		const group = foldedGroup(displayStatus);
		const status = group.includes(task.status) ? task.status : displayStatus;
		const index = resolveVisualDropIndex(tasksInColumn(displayStatus), task.id, status, visualIndex);
		return { status, index };
	}

	function onDragEnd() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		if (drag) {
			const { taskId } = drag;
			if (overStatus && dropColumn) {
				const task = tasks.find((t) => t.id === taskId);
				if (task) {
					const { status, index } = resolveDrop(task, dropColumn, dropIndex);
					void moveTask(taskId, status, index);
				}
			}
			suppressClick = true;
			setTimeout(() => (suppressClick = false), 0);
		}
		draggingId = null;
		overStatus = null;
		drag = null;
		pendingDrag = null;
		dropColumn = null;
		dropIndex = -1;
		window.removeEventListener('pointermove', onDragMove);
		window.removeEventListener('pointerup', onDragEnd);
		window.removeEventListener('pointercancel', onDragEnd);
	}

	let view = $state<'board' | 'list' | 'roadmap' | 'workload'>('board');
	let columnsOpen = $state(false);

	function toggleBoardStatus(status: TaskStatus) {
		const enabled = settings.boardStatuses.includes(status);
		updateSetting(
			'boardStatuses',
			enabled
				? settings.boardStatuses.filter((s) => s !== status)
				: [...settings.boardStatuses, status]
		);
	}

	const projectTasks = $derived(
		project ? tasks.filter((t) => t.projectId === project.id) : []
	);

	// sortOrder is only meaningful within a single status column (each status
	// keeps its own independently-renumbered 0..n-1 sequence), so comparing it
	// across statuses is meaningless here. Group by status in its canonical
	// order instead (which puts "done" last), then by due date - the one
	// ordering key that's globally comparable across every task.
	const STATUS_ORDER: Record<TaskStatus, number> = Object.fromEntries(
		taskStatuses.map((s, i) => [s, i])
	) as Record<TaskStatus, number>;

	const listRows = $derived(
		[...projectTasks].sort(
			(a, b) =>
				STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
				new Date(a.due).getTime() - new Date(b.due).getTime() ||
				PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
				a.title.localeCompare(b.title)
		)
	);

	const LIST_PAGE_SIZE = 25;
	let listPage = $state(1);
	const listPageCount = $derived(
		Math.max(1, Math.ceil(listRows.length / LIST_PAGE_SIZE))
	);
	const effectiveListPage = $derived(Math.min(listPage, listPageCount));
	const listPageRows = $derived(
		listRows.slice(
			(effectiveListPage - 1) * LIST_PAGE_SIZE,
			effectiveListPage * LIST_PAGE_SIZE
		)
	);

	// The range and the rendered list must agree on which tasks count - a
	// single old completed task shouldn't be able to skew the visible range
	// even though it's not shown on the roadmap.
	const roadmapTasks = $derived(
		[...projectTasks]
			.filter((t) => t.status !== 'done')
			.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
	);

	const roadmapStart = $derived.by(() => {
		const earliest =
			roadmapTasks.length > 0
				? Math.min(...roadmapTasks.map((t) => new Date(t.due).getTime()))
				: Date.now();
		const d = new Date(Math.min(earliest, Date.now()));
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	});

	const roadmapEnd = $derived.by(() => {
		const latest =
			roadmapTasks.length > 0
				? Math.max(...roadmapTasks.map((t) => new Date(t.due).getTime()))
				: Date.now() + 86400000;
		const d = new Date(latest);
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() + 1);
		return d.getTime();
	});

	function roadmapPct(due: string): number {
		const span = roadmapEnd - roadmapStart;
		if (span <= 0) return 0;
		return Math.min(96, Math.max(1, ((new Date(due).getTime() - roadmapStart) / span) * 100));
	}

	const todayPct = $derived(roadmapPct(new Date().toISOString()));

	const workloadRows = $derived(
		members
			.map((m) => {
				const owned = projectTasks.filter((t) => t.assigneeId === m.id);
				const open = owned.filter((t) => t.status !== 'done');
				const done = owned.filter((t) => t.status === 'done');
				return {
					member: m,
					openCount: open.length,
					doneCount: done.length,
					estimate: open.reduce((s, t) => s + (t.estimate ?? 0), 0)
				};
			})
			.filter((r) => r.openCount + r.doneCount > 0)
			.sort((a, b) => b.estimate - a.estimate)
	);

	const unassignedTasks = $derived(
		projectTasks.filter((t) => !t.assigneeId && t.status !== 'done')
	);

	const allStatuses: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

	let addingStatus = $state<TaskStatus | null>(null);
	let newTitle = $state('');
	let newAssigneeId = $state('');
	let addTaskError = $state('');
	let deleteProjectOpen = $state(false);
	let deleteTaskTarget = $state<Task | null>(null);
	let deleteError = $state('');

	let projectEditOpen = $state(false);
	let projName = $state('');
	let projDescription = $state('');
	let projStatus = $state<ProjectStatus>('planning');
	let projDue = $state('');
	let projWorkStart = $state('09:00');
	let projWorkEnd = $state('17:00');
	let projWorkDays = $state<number[]>([1, 2, 3, 4, 5]);
	let projRepoPath = $state('');
	let projRepoTrying = $state(false);
	let projRepoScan = $state<{ ok: boolean; message: string } | null>(null);
	let projError = $state('');

	const workDayOptions = [
		{ value: 0, label: 'S' },
		{ value: 1, label: 'M' },
		{ value: 2, label: 'T' },
		{ value: 3, label: 'W' },
		{ value: 4, label: 'T' },
		{ value: 5, label: 'F' },
		{ value: 6, label: 'S' }
	];

	function toggleWorkDay(day: number) {
		projWorkDays = projWorkDays.includes(day)
			? projWorkDays.filter((d) => d !== day)
			: [...projWorkDays, day].sort();
	}

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

	// "Explain task" modal — a persistent conversation about a single task.
	// The conversation is saved to the database per task, so it survives closing
	// the modal or restarting the app. It can only be closed via ✕ or Cancel.
	let explainTarget = $state<Task | null>(null);
	let explainMessages = $state<TaskChatMessage[]>([]);
	let explainPending = $state('');
	let explainInput = $state('');
	let explainBusy = $state(false);
	let explainError = $state('');
	let explainAbort = $state<AbortController | null>(null);
	let conversationEl = $state<HTMLDivElement | null>(null);
	// Model used for THIS chat — independent of the active provider's default
	// model (which is what project planning / spec generation uses). Re-syncs
	// to the active provider's model whenever the active provider itself
	// changes, but otherwise leaves the user's local override alone.
	let explainModel = $state('');
	let explainModelProviderId = $state('');
	$effect(() => {
		const provider = activeAiProvider();
		if (provider && provider.id !== explainModelProviderId) {
			explainModelProviderId = provider.id;
			explainModel = provider.model;
		}
	});
	/** The active provider, with its model swapped for the chat's own picker. */
	const explainProvider = $derived.by(() => {
		const provider = activeAiProvider();
		if (!provider) return null;
		return explainModel ? { ...provider, model: explainModel } : provider;
	});

	// Connected local repository: scan state plus the per-task repo context
	// that is injected into the AI prompts.
	let repoScan = $state<RepoScan | null>(null);
	let repoSymbols = $state<{ file: string; symbols: string[] }[]>([]);
	let repoScanning = $state(false);
	let repoScanError = $state('');
	let explainRepo = $state<RepoContext | null>(null);
	let explainRepoTaskId = $state<string | null>(null);
	let repoScanPromise: Promise<void> | null = null;

	async function scanProjectRepo(): Promise<void> {
		if (!project?.repoPath) return;
		// Share the in-flight scan so concurrent callers wait for the same one.
		if (repoScanPromise) return repoScanPromise;
		repoScanPromise = (async () => {
			repoScanning = true;
			repoScanError = '';
			try {
				// Reuse the persisted index when the path is unchanged, so opening
				// the chat doesn't re-walk the whole repository every time.
				const cached = await loadRepoIndex(project.id);
				if (cached && cached.root === project.repoPath && cached.files.length > 0) {
					repoScan = { root: cached.root, files: cached.files, truncated: false, error: null };
					repoSymbols = cached.symbols;
					return;
				}
				const scan = await scanRepo(project.repoPath);
				repoScan = scan;
				if (scan.error) {
					repoScanError = scan.error;
					return;
				}
				repoSymbols = await extractSymbols(scan.root, scan.files);
				await saveRepoIndex(project.id, {
					root: scan.root,
					files: scan.files,
					symbols: repoSymbols
				});
			} catch (err) {
				repoScanError = err instanceof Error ? err.message : String(err);
			} finally {
				repoScanning = false;
			}
		})();
		try {
			await repoScanPromise;
		} finally {
			repoScanPromise = null;
		}
	}

	/** Builds the repo context for a task: file tree + symbol map + key files,
	 *  plus hunks of the files the LOCAL retriever picks (path/symbol scoring,
	 *  entry files, content matches). No extra model call — fast. Cached per
	 *  task while the modal is open. */
	async function ensureRepoContext(task: Task): Promise<RepoContext | null> {
		if (!project?.repoPath) return null;
		if (explainRepo && explainRepoTaskId === task.id) return explainRepo;
		// Wait for any in-flight scan so the first prompt includes repo context.
		if (!repoScan) await scanProjectRepo();
		if (!repoScan || repoScan.error) return null;
		const keywords = [task.title, task.description, ...task.tags].filter((k) => k.trim());
		const tree = repoTreeText(repoScan.files);
		const map = repoMapText(repoSymbols);
		const keys = repoScan.files.filter((f) => isKeyFile(f.path)).slice(0, 3);
		const keyContents = await readRepoFiles(keys, 20_000);
		const hunks = await readRelevantHunks(repoScan.root, repoScan.files, repoSymbols, keywords);
		const ctx: RepoContext = {
			root: repoScan.root,
			tree,
			map,
			contents: [...keyContents, ...hunks]
		};
		explainRepo = ctx;
		explainRepoTaskId = task.id;
		return ctx;
	}

	// Tasks in this project that already have a saved explanation → the card
	// button reads "Open explanation" instead of "Explain task".
	let explainedTaskIds = $state<Set<string>>(new Set());

	$effect(() => {
		if (!project || !status.ready) return;
		void explainedTaskIds;
		loadTaskExplanationIds(project.id)
			.then((ids) => {
				explainedTaskIds = new Set(ids);
			})
			.catch((err) => console.error('Failed to load explanation ids', err));
	});

	function markExplained(taskId: string) {
		explainedTaskIds = new Set(explainedTaskIds).add(taskId);
	}

	// Keep the latest reply in view while it streams in, unless the user has
	// scrolled up to re-read something.
	$effect(() => {
		if (!explainTarget || !conversationEl) return;
		void explainMessages;
		void explainPending;
		const el = conversationEl;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
		if (!nearBottom) return;
		requestAnimationFrame(() => {
			el.scrollTop = el.scrollHeight;
		});
	});

	function explainContext(task: Task, repo?: RepoContext | null): TaskContext {
		const assignee = memberById(task.assigneeId);
		return {
			projectName: project?.name ?? '',
			projectDescription: project?.description ?? '',
			task: {
				title: task.title,
				description: task.description,
				priority: task.priority,
				estimate: task.estimate,
				tags: task.tags,
				assignee: assignee?.name ?? '',
				assigneeRole: assignee?.role ?? ''
			},
			otherTasks: projectTasks
				.filter((t) => t.id !== task.id)
				.map((t) => ({
					title: t.title,
					status: taskStatusStyles[t.status].label,
					assignee: memberById(t.assigneeId)?.name ?? ''
				})),
			repo: repo ?? undefined
		};
	}

	/** Multi-line pastes (usually code) are sent as a fenced block so they render
	 *  with proper code formatting instead of being collapsed by markdown. */
	function formatUserMessage(text: string): string {
		if (!text.includes('\n')) return text;
		if (/^```/m.test(text)) return text;
		return '```\n' + text + '\n```';
	}

	async function generateExplanation(task: Task) {
		if (!explainProvider) return;
		explainMessages = [];
		explainPending = '';
		explainError = '';
		explainBusy = true;
		const abort = new AbortController();
		explainAbort = abort;
		try {
			const repo = await ensureRepoContext(task);
			const text = await explainTask({
				...explainContext(task, repo),
				provider: explainProvider,
				onDelta: (delta) => (explainPending += delta),
				signal: abort.signal
			});
			const messages: TaskChatMessage[] = [{ role: 'assistant', content: text }];
			explainMessages = messages;
			explainPending = '';
			await saveTaskExplanation(task.id, messages);
			markExplained(task.id);
		} catch (err) {
			if (abort.signal.aborted) {
				explainPending = '';
				return;
			}
			explainError = err instanceof Error ? err.message : String(err);
			explainPending = '';
		} finally {
			explainBusy = false;
			explainAbort = null;
		}
	}

	async function handleExplain(task: Task) {
		if (!project || !explainProvider || explainBusy) return;
		explainTarget = task;
		explainError = '';
		// Start scanning the connected repository in the background so the chat
		// and repo checks have context ready.
		if (project.repoPath && !repoScan && !repoScanning) {
			void scanProjectRepo();
		}
		// Resume a saved conversation when one exists; otherwise start fresh.
		const saved = await loadTaskExplanation(task.id);
		if (saved && saved.length > 0) {
			explainMessages = saved;
			return;
		}
		await generateExplanation(task);
	}

	/** Starts a blank chat: discards the saved conversation and shows
	 *  suggestion prompts. Nothing is generated until the user asks. */
	/** Starts a blank chat: discards the saved conversation and shows
	 *  suggestion prompts. Nothing is generated until the user asks. */
	async function newExplanation() {
		if (!explainTarget || explainBusy) return;
		await clearTaskExplanation(explainTarget.id);
		const remaining = new Set(explainedTaskIds);
		remaining.delete(explainTarget.id);
		explainedTaskIds = remaining;
		explainMessages = [];
		explainPending = '';
		explainError = '';
	}

	/** Checks the task against the connected repository: is it implemented, what
	 *  is missing, and review notes. Result streams in as an assistant reply. */
	async function checkTaskInRepo() {
		if (!explainTarget || explainBusy || !project?.repoPath || !explainProvider) return;
		const task = explainTarget;
		const repo = await ensureRepoContext(task);
		if (!repo) {
			explainError =
				repoScanError || 'Could not read the repository — check the path in project settings.';
			return;
		}
		explainMessages = [
			...explainMessages,
			{ role: 'user', content: 'Check this task against the repository — is it implemented?' }
		];
		explainPending = '';
		explainError = '';
		explainBusy = true;
		const abort = new AbortController();
		explainAbort = abort;
		try {
			const text = await checkTaskAgainstRepo({
				context: { ...explainContext(task, repo), repo },
				provider: explainProvider,
				onDelta: (delta) => (explainPending += delta),
				signal: abort.signal
			});
			explainMessages = [...explainMessages, { role: 'assistant', content: text }];
			explainPending = '';
			await saveTaskExplanation(task.id, explainMessages);
			markExplained(task.id);
		} catch (err) {
			if (abort.signal.aborted) {
				explainPending = '';
				return;
			}
			explainError = err instanceof Error ? err.message : String(err);
			explainPending = '';
		} finally {
			explainBusy = false;
			explainAbort = null;
		}
	}

	/** Contextual prompts shown while the chat is empty, so the user has a
	 *  starting point without the AI generating anything yet. */
	function explainSuggestions(task: Task): string[] {
		const out: string[] = [];
		const assignee = memberById(task.assigneeId);
		if (!task.description) {
			out.push('I have no description for this task — what should it involve?');
		} else {
			out.push('What does this task actually require, in plain language?');
		}
		out.push('How should I implement this step by step?');
		out.push(
			assignee
				? `How should ${assignee.name} approach this?`
				: 'Who would be the best person to work on this?'
		);
		if (task.estimate) {
			out.push(`Is ${formatEstimate(task.estimate)} enough time for this?`);
		}
		if (projectTasks.some((t) => t.id !== task.id)) {
			out.push('Which other tasks does this depend on, and which depend on it?');
		} else {
			out.push('What are the risks or edge cases to watch for?');
		}
		return out.slice(0, 4);
	}

	/** Number of user questions that are still waiting for an answer. */
	const unansweredCount = $derived.by(() => {
		let count = 0;
		for (let i = explainMessages.length - 1; i >= 0; i--) {
			if (explainMessages[i].role === 'user') count++;
			else break;
		}
		return count;
	});

	/** Sends a follow-up. The input is never blocked: if a reply is still
	 *  streaming, the question is shown immediately and queued for answering. */
	function sendFollowUp() {
		const raw = explainInput.trim();
		if (!raw) return;
		sendFollowUpText(raw);
	}

	/** Appends the question to the conversation and starts answering it. */
	function sendFollowUpText(raw: string) {
		if (!raw.trim() || !explainTarget || !explainProvider) return;
		const question = formatUserMessage(raw.trim());
		explainInput = '';
		explainError = '';
		explainMessages = [...explainMessages, { role: 'user', content: question }];
		void answerNext();
	}

	/** Answers the first unanswered user question in the conversation. */
	async function answerNext() {
		if (!explainTarget || explainBusy || explainMessages.length === 0 || !explainProvider) return;
		// Everything after the last assistant reply is unanswered (user) input.
		let start = 0;
		for (let i = 0; i < explainMessages.length; i++) {
			if (explainMessages[i].role === 'assistant') start = i + 1;
		}
		const question = explainMessages[start]?.content;
		if (!question) return;
		const task = explainTarget;
		explainPending = '';
		explainBusy = true;
		const abort = new AbortController();
		explainAbort = abort;
		try {
			const repo = await ensureRepoContext(task);
			const text = await taskChatFollowUp({
				context: explainContext(task, repo),
				history: explainMessages.slice(0, start),
				question,
				provider: explainProvider,
				onDelta: (delta) => (explainPending += delta),
				signal: abort.signal
			});
			explainMessages = [...explainMessages, { role: 'assistant', content: text }];
			explainPending = '';
			await saveTaskExplanation(task.id, explainMessages);
			markExplained(task.id);
		} catch (err) {
			if (abort.signal.aborted) {
				explainPending = '';
				return;
			}
			explainError = err instanceof Error ? err.message : String(err);
			explainPending = '';
		} finally {
			explainBusy = false;
			explainAbort = null;
			// Answer any questions that were queued while this one was streaming.
			void answerNext();
		}
	}

	/** Aborts the in-flight response and drops queued (unanswered) questions so
	 *  nothing continues after the stop press. */
	function stopExplain() {
		explainAbort?.abort();
		let end = explainMessages.length;
		while (end > 0 && explainMessages[end - 1].role === 'user') end--;
		if (end < explainMessages.length) {
			explainMessages = explainMessages.slice(0, end);
		}
		explainPending = '';
	}

	function closeExplain() {
		explainAbort?.abort();
		explainTarget = null;
		explainMessages = [];
		explainPending = '';
		explainInput = '';
		explainError = '';
	}

	// Lock page scroll while the explain modal is open.
	$effect(() => {
		if (!explainTarget) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

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
	let aiNeedsProvider = $state(false);
	let aiStatus = $state<AiDraftStatus | null>(null);
	let aiRepoEnabled = $state(true);
	let newStory = $state('');
	let draftLoaded = $state(false);

	const DRAFT_PAGE_SIZE = 15;
	let draftPage = $state(1);
	const draftPageCount = $derived(
		aiDraft ? Math.max(1, Math.ceil(aiDraft.tasks.length / DRAFT_PAGE_SIZE)) : 1
	);
	const effectiveDraftPage = $derived(Math.min(draftPage, draftPageCount));
	const draftPageTasks = $derived(
		aiDraft
			? aiDraft.tasks.slice(
					(effectiveDraftPage - 1) * DRAFT_PAGE_SIZE,
					effectiveDraftPage * DRAFT_PAGE_SIZE
				)
			: []
	);

	// Resume a previously saved draft when the project opens.
	$effect(() => {
		if (!project || !status.ready || draftLoaded) return;
		draftLoaded = true;
		loadSavedDraft(project.id);
	});

	async function loadSavedDraft(projectId: string) {
		const saved = await loadAiDraft(projectId);
		if (!saved) return;
		aiDraft = saved.draft;
		aiDesires = saved.desires;
		aiDue = saved.due;
		aiSpecialties = saved.specialties;
		aiIncluded = saved.included;
		aiSpecialty = saved.specialty;
		aiOpen = true;
	}

	// Auto-save the draft (debounced) so it survives navigation and app closes.
	$effect(() => {
		if (!project || (!aiDraft && !aiDesires.trim())) return;
		const payload: SavedAiDraft = {
			draft: aiDraft,
			desires: aiDesires,
			due: aiDue,
			specialties: aiSpecialties,
			included: aiIncluded,
			specialty: aiSpecialty
		};
		const timer = setTimeout(() => {
			saveAiDraft(project.id, payload);
		}, 700);
		return () => clearTimeout(timer);
	});

	function persistDraftNow() {
		if (!project || (!aiDraft && !aiDesires.trim())) return;
		saveAiDraft(project.id, {
			draft: aiDraft,
			desires: aiDesires,
			due: aiDue,
			specialties: aiSpecialties,
			included: aiIncluded,
			specialty: aiSpecialty
		});
	}

	const selectedAiMembers = $derived(members.filter((m) => aiIncluded[m.id]));
	const draftTotalEstimate = $derived(
		aiDraft ? aiDraft.tasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0) : 0
	);

	function openAiPanel() {
		if (!project) return;
		aiOpen = true;
		aiPublished = false;
		aiError = '';
		aiNeedsProvider = !activeAiProvider();
		if (!aiDue) aiDue = project.due.slice(0, 10);
		if (Object.keys(aiIncluded).length === 0) {
			aiIncluded = Object.fromEntries(members.map((m) => [m.id, true]));
			aiSpecialty = Object.fromEntries(members.map((m) => [m.id, '']));
		}
		if (!aiNeedsProvider && aiSpecialties.length === 0) suggestSpecialtiesNow();
	}

	function closeAiPanel() {
		aiOpen = false;
		aiDraft = null;
		aiError = '';
		aiPublished = false;
	}

	async function suggestSpecialtiesNow() {
		const provider = activeAiProvider();
		if (!project || !provider) return;
		aiSuggesting = true;
		aiError = '';
		try {
			aiSpecialties = await suggestSpecialties(project.name, project.description, provider);
		} catch (err) {
			aiError = err instanceof Error ? err.message : String(err);
		} finally {
			aiSuggesting = false;
		}
	}

	/** Builds repo context for the project-level AI draft (keywords from the
	 *  project + desires). Returns null when no repo is connected/readable. */
	async function ensureProjectRepoContext(): Promise<RepoContext | null> {
		if (!project?.repoPath || !aiRepoEnabled) return null;
		if (!repoScan) await scanProjectRepo();
		if (!repoScan || repoScan.error) return null;
		const keywords = [project.name, project.description, aiDesires].filter((k) => k.trim());
		const hunks = await readRelevantHunks(repoScan.root, repoScan.files, repoSymbols, keywords);
		return {
			root: repoScan.root,
			tree: repoTreeText(repoScan.files),
			map: repoMapText(repoSymbols),
			contents: hunks
		};
	}

	async function handleAiGenerate(refine = false) {
		if (!project) return;
		const provider = activeAiProvider();
		if (!provider) {
			aiNeedsProvider = true;
			return;
		}
		if (!aiDesires.trim()) {
			aiError = 'Describe what you want to build first.';
			return;
		}
		aiLoading = true;
		aiError = '';
		aiPublished = false;
		aiStatus = null;
		try {
			const repo = await ensureProjectRepoContext();
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
				provider,
				currentDraft: refine && aiDraft ? aiDraft : undefined,
				repo: repo ?? undefined,
				onStatus: (s) => (aiStatus = s)
			});
			if (draft.tasks.length === 0 && !draft.spec && draft.userStories.length === 0) {
				aiError = 'The AI returned an empty plan. Try rephrasing your desires.';
			} else {
				aiDraft = draft;
				draftPage = 1;
				persistDraftNow();
			}
		} catch (err) {
			aiError = err instanceof Error ? err.message : String(err);
			aiStatus = null;
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
			await clearAiDraft(project.id);
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
		projWorkStart = minutesToTime(project.workStart);
		projWorkEnd = minutesToTime(project.workEnd);
		projWorkDays = [...project.workDays];
		projRepoPath = project.repoPath;
		projRepoScan = null;
		projError = '';
		projectEditOpen = true;
	}

	function cancelProjectEdit() {
		projectEditOpen = false;
		projError = '';
	}

	/** Opens the native folder picker and fills the repository path. */
	async function browseRepoPath() {
		const selected = await open({
			directory: true,
			title: 'Select the project repository folder',
			multiple: false
		});
		if (typeof selected === 'string' && selected.trim()) {
			projRepoPath = selected;
			projRepoScan = null;
			await testRepoPath();
		}
	}

	/** Validates the repository path in the project form by scanning it. */
	async function testRepoPath() {
		const path = projRepoPath.trim();
		if (!path) {
			projRepoScan = { ok: false, message: 'Enter a repository path first.' };
			return;
		}
		projRepoTrying = true;
		projRepoScan = null;
		try {
			const scan = await scanRepo(path);
			projRepoScan = {
				ok: !scan.error && scan.files.length > 0,
				message: scan.error
					? scan.error
					: scan.files.length === 0
						? 'Found no source files (path may be wrong or the folder is empty).'
						: `${scan.files.length} source file${scan.files.length === 1 ? '' : 's'} found${scan.truncated ? ' (truncated)' : ''}.`
			};
		} catch (err) {
			projRepoScan = { ok: false, message: err instanceof Error ? err.message : String(err) };
		} finally {
			projRepoTrying = false;
		}
	}

	async function handleProjectSave() {
		if (!project || !projName.trim()) return;
		projError = '';
		try {
			const workStart = timeToMinutes(projWorkStart);
			const workEnd = timeToMinutes(projWorkEnd);
			if (workEnd <= workStart) {
				projError = 'Working hours end must be after the start time.';
				return;
			}
			if (projWorkDays.length === 0) {
				projError = 'Select at least one working day.';
				return;
			}
			await updateProject(project.id, {
				name: projName.trim(),
				description: projDescription.trim(),
				status: projStatus,
				due: projDue ? new Date(`${projDue}T12:00:00`).toISOString() : daysFromNow(30),
				workStart,
				workEnd,
				workDays: projWorkDays,
				repoPath: projRepoPath.trim()
			});
			repoScan = null;
			repoSymbols = [];
			explainRepo = null;
			explainRepoTaskId = null;
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

	async function handleAdd(status: TaskStatus) {
		if (!project || !newTitle.trim()) return;
		addTaskError = '';
		try {
			await createTask({
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
		} catch (err) {
			addTaskError = err instanceof Error ? err.message : String(err);
		}
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
				<div class="relative">
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-surface px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
						onclick={() => (columnsOpen = !columnsOpen)}
					>
						<Columns size={15} />
						Columns
					</button>
					{#if columnsOpen}
						<div
							class="fixed inset-0 z-20"
							role="presentation"
							onclick={() => (columnsOpen = false)}
						></div>
						<div
							class="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-neutral-200 bg-surface p-3 shadow-lg"
						>
							<p class="text-xs font-semibold text-neutral-600">Board columns</p>
							<div class="mt-2 space-y-1">
								<label
									class="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-neutral-600"
								>
									<input
										type="checkbox"
										class="size-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
										checked
										disabled
									/>
									To do
								</label>
								<label
									class="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-neutral-600"
								>
									<input
										type="checkbox"
										class="size-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
										checked
										disabled
									/>
									In progress
								</label>
								<label
									class="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-neutral-600"
								>
									<input
										type="checkbox"
										class="size-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
										checked
										disabled
									/>
									Done
								</label>
								<label
									class="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-neutral-700"
								>
									<input
										type="checkbox"
										class="size-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
										checked={settings.boardStatuses.includes('backlog')}
										onchange={() => toggleBoardStatus('backlog')}
									/>
									Backlog
								</label>
								<label
									class="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-neutral-700"
								>
									<input
										type="checkbox"
										class="size-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
										checked={settings.boardStatuses.includes('in_review')}
										onchange={() => toggleBoardStatus('in_review')}
									/>
									In review
								</label>
							</div>
							<p class="mt-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-400">
								To do, In progress and Done are always shown. Backlog and In review are
								optional — disabled ones fold into the nearest column.
							</p>
						</div>
					{/if}
				</div>
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
					onclick={() => {
						deleteProjectOpen = true;
						deleteError = '';
					}}
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

	<div
		class="mt-6 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-surface p-1 shadow-xs"
	>
		<button
			type="button"
			onclick={() => (view = 'board')}
			class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {view ===
			'board'
				? 'bg-indigo-600 text-white shadow-sm'
				: 'text-neutral-600 hover:bg-neutral-100'}"
		>
			<LayoutGrid size={15} />
			Board
		</button>
		<button
			type="button"
			onclick={() => (view = 'list')}
			class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {view ===
			'list'
				? 'bg-indigo-600 text-white shadow-sm'
				: 'text-neutral-600 hover:bg-neutral-100'}"
		>
			<List size={15} />
			List
		</button>
		<button
			type="button"
			onclick={() => (view = 'roadmap')}
			class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {view ===
			'roadmap'
				? 'bg-indigo-600 text-white shadow-sm'
				: 'text-neutral-600 hover:bg-neutral-100'}"
		>
			<Map size={15} />
			Roadmap
		</button>
		<button
			type="button"
			onclick={() => (view = 'workload')}
			class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {view ===
			'workload'
				? 'bg-indigo-600 text-white shadow-sm'
				: 'text-neutral-600 hover:bg-neutral-100'}"
		>
			<Gauge size={15} />
			Workload
		</button>
	</div>

	{#if projectEditOpen}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				handleProjectSave();
			}}
			autocomplete="off"
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
						autocomplete="off"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={projName}
						required
					/>
				</div>
				<div>
					<label for="proj-status" class="mb-1 block text-xs font-medium text-neutral-600">
						Status
					</label>
					<Select
						id="proj-status"
						class="w-full"
						bind:value={projStatus}
						options={projectStatuses.map((s) => ({
							value: s,
							label: projectStatusStyles[s].label
						}))}
					/>
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
				<div class="lg:col-span-4">
					<p class="mb-1 block text-xs font-medium text-neutral-600">Working hours</p>
					<div class="flex flex-wrap items-center gap-2">
						<input
							id="proj-work-start"
							type="time"
							class="rounded-lg border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={projWorkStart}
						/>
						<span class="text-sm text-neutral-400">to</span>
						<input
							id="proj-work-end"
							type="time"
							class="rounded-lg border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={projWorkEnd}
						/>
					</div>
					<div class="mt-2 flex flex-wrap items-center gap-1.5">
						{#each workDayOptions as day (day.value)}
							<button
								type="button"
								onclick={() => toggleWorkDay(day.value)}
								class="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors {projWorkDays.includes(day.value)
									? 'bg-indigo-600 text-white'
									: 'border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50'}"
								title={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.value]}
							>
								{day.label}
							</button>
						{/each}
						<span class="ml-1 text-xs text-neutral-400">
							Workdays · estimates count only these hours on these days when a task moves into
							In progress.
						</span>
					</div>
				</div>
				<div class="lg:col-span-4">
					<label for="proj-repo" class="mb-1 block text-xs font-medium text-neutral-600">
						Repository path
					</label>
					<div class="flex items-center gap-2">
						<input
							id="proj-repo"
							type="text"
							autocomplete="off"
							placeholder="C:\repo or \\wsl$\Ubuntu\home\you\repo"
							class="w-full rounded-lg border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={projRepoPath}
						/>
						<button
							type="button"
							class="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
							onclick={browseRepoPath}
							title="Pick the repository folder"
						>
							Browse…
						</button>
						<button
							type="button"
							class="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={testRepoPath}
							disabled={projRepoTrying || !projRepoPath.trim()}
						>
							{projRepoTrying ? 'Scanning…' : 'Scan'}
						</button>
					</div>
					{#if projRepoScan}
						<p
							class="mt-1.5 text-xs {projRepoScan.ok
								? 'text-emerald-600'
								: 'text-red-600'}"
						>
							{projRepoScan.message}
						</p>
					{/if}
					<p class="mt-1 text-xs text-neutral-400">
						Connect the local (or WSL) repository for this project so the AI can answer
						questions about the actual code, check if tasks are implemented, and help with
						reviews.
					</p>
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
			onsubmit={(event) => {
				event.preventDefault();
				handleTaskSave();
			}}
			autocomplete="off"
			class="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-xs"
		>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<div class="lg:col-span-3">
					<label for="edit-title" class="mb-1 block text-xs font-medium text-neutral-600">Title</label>
					<input
						id="edit-title"
						type="text"
						autocomplete="off"
						class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={editTitle}
						required
					/>
				</div>
				<div>
					<label for="edit-status" class="mb-1 block text-xs font-medium text-neutral-600">
						Status
					</label>
					<Select
						id="edit-status"
						class="w-full"
						bind:value={editStatus}
						options={taskStatuses.map((s) => ({
							value: s,
							label: taskStatusStyles[s].label
						}))}
					/>
				</div>
				<div>
					<label for="edit-priority" class="mb-1 block text-xs font-medium text-neutral-600">
						Priority
					</label>
					<Select
						id="edit-priority"
						class="w-full"
						bind:value={editPriority}
						options={priorities.map((p) => ({
							value: p,
							label: priorityStyles[p].label
						}))}
					/>
				</div>
				<div>
					<label for="edit-assignee" class="mb-1 block text-xs font-medium text-neutral-600">
						Assignee
					</label>
					<Select
						id="edit-assignee"
						class="w-full"
						bind:value={editAssigneeId}
						options={[
							{ value: '', label: 'Unassigned' },
							...members.map((m) => ({ value: m.id, label: m.name }))
						]}
					/>
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
						autocomplete="off"
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

			{#if aiNeedsProvider}
				<div
					class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
				>
					Connect an AI provider in{' '}
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
										autocomplete="off"
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
					{#if project?.repoPath}
						<label
							class="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-surface px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
							title="Include the connected repository's file tree, symbol map and relevant snippets so the plan builds on the existing code"
						>
							<input
								type="checkbox"
								class="size-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
								bind:checked={aiRepoEnabled}
							/>
							<FolderGit2 size={13} class="text-neutral-400" />
							Repo context
						</label>
					{/if}
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
						<span class="flex shrink-0 items-center gap-1">
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
						<div class="min-w-0">
							<p class="text-sm font-medium text-indigo-700">
								{aiStatus?.message ?? 'Working…'}
							</p>
							{#if aiStatus?.stage === 'tasks' && aiStatus.tasks}
								<div class="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-indigo-100">
									<div
										class="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
										style="width: {Math.min(96, aiStatus.tasks * 4)}%"
									></div>
								</div>
							{/if}
						</div>
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
										autocomplete="off"
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
								autocomplete="off"
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
							{#each draftPageTasks as task, i (i)}
								{@const globalIndex = (effectiveDraftPage - 1) * DRAFT_PAGE_SIZE + i}
								<li class="rounded-lg border border-neutral-200 bg-surface/60 p-2.5">
									<div class="flex flex-wrap items-center gap-2">
										<input
											type="text"
											autocomplete="off"
											class="min-w-40 flex-1 rounded-lg border-neutral-300 bg-surface px-2.5 py-1.5 text-sm font-medium focus:border-indigo-500 focus:ring-indigo-500"
											bind:value={task.title}
										/>
										<Select
											class="w-32 shrink-0"
											compact
											bind:value={task.priority}
											ariaLabel="Priority"
											options={priorities.map((p) => ({
												value: p,
												label: priorityStyles[p].label
											}))}
										/>
										<input
											type="number"
											min="0"
											step="0.5"
											placeholder="hrs"
											title="Estimated hours — 1 day = 8 working hours"
											class="w-20 rounded-lg border-neutral-300 bg-surface px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
											bind:value={task.estimateHours}
											aria-label="Estimate in hours"
										/>
										<Select
											class="w-36 shrink-0"
											compact
											bind:value={task.assignee}
											ariaLabel="Assignee"
											options={[
												{ value: '', label: 'Unassigned' },
												...selectedAiMembers.map((m) => ({ value: m.name, label: m.name }))
											]}
										/>
										<button
											type="button"
											class="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
											aria-label="Remove task"
											onclick={() => aiDraft!.tasks.splice(globalIndex, 1)}
										>
											<Trash2 size={15} />
										</button>
									</div>
									<input
										type="text"
										autocomplete="off"
										placeholder="Description"
										class="mt-1.5 w-full rounded-lg border-neutral-300 bg-surface px-2.5 py-1.5 text-sm text-neutral-500 focus:border-indigo-500 focus:ring-indigo-500"
										bind:value={task.description}
									/>
								</li>
							{/each}
						</ul>
						{#if draftPageCount > 1}
							<div class="flex items-center justify-between pt-2">
								<p class="text-xs text-neutral-400">
									Page {effectiveDraftPage} of {draftPageCount} · {aiDraft.tasks.length} tasks
								</p>
								<div class="flex items-center gap-1">
									<button
										type="button"
										class="rounded-lg border border-neutral-200 bg-surface px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
										onclick={() => (draftPage = Math.max(1, draftPage - 1))}
										disabled={draftPage <= 1}
									>
										Previous
									</button>
									<button
										type="button"
										class="rounded-lg border border-neutral-200 bg-surface px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
										onclick={() => (draftPage = Math.min(draftPageCount, draftPage + 1))}
										disabled={draftPage >= draftPageCount}
									>
										Next
									</button>
								</div>
							</div>
						{/if}
					</div>
					<p class="text-xs text-neutral-400">
						Edit anything above, then hit “Refine with AI” to recalibrate the plan, or publish
						as-is.
					</p>
				</div>
			{/if}
		</section>
	{/if}

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

	{#if view === 'board'}
	<section class="mt-6">
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<div class="relative w-full sm:max-w-xs">
				<span
					class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400"
				>
					<Search size={15} />
				</span>
				<input
					type="search"
					autocomplete="off"
					placeholder="Search tasks"
					class="w-full rounded-lg border-neutral-300 bg-surface py-2 pr-3 pl-9 text-sm focus:border-indigo-500 focus:ring-indigo-500"
					bind:value={boardQuery}
				/>
			</div>
			<Select
				class="w-40"
				bind:value={boardPriority}
				ariaLabel="Filter by priority"
				options={[
					{ value: 'all', label: 'All priorities' },
					...priorities.map((p) => ({ value: p, label: priorityStyles[p].label }))
				]}
			/>
			<Select
				class="w-44"
				bind:value={boardAssignee}
				ariaLabel="Filter by assignee"
				options={[
					{ value: 'all', label: 'All assignees' },
					{ value: 'none', label: 'Unassigned' },
					...members.map((m) => ({ value: m.id, label: m.name }))
				]}
			/>
			{#if boardQuery.trim() || boardPriority !== 'all' || boardAssignee !== 'all'}
				<p class="text-xs text-neutral-400">
					{projectTasks.filter(matchesQuery).length} match{projectTasks.filter(matchesQuery)
						.length === 1
						? ''
						: 'es'}
				</p>
				<button
					type="button"
					class="text-xs font-medium text-indigo-600 hover:text-indigo-700"
					onclick={clearBoardFilters}
				>
					Clear
				</button>
			{/if}
		</div>
		<div class="flex gap-4 overflow-x-auto pb-4">
			{#each boardColumns as status (status)}
				<div
					role="group"
					aria-label={taskStatusStyles[status].label}
					data-status={status}
					class="w-72 shrink-0 rounded-xl border p-3 transition-colors {overStatus ===
					status
						? 'border-indigo-300 bg-indigo-50/70'
						: 'border-neutral-200 bg-neutral-50/80'}"
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
						{#each tasksInColumn(status) as task, i (task.id)}
							{#if dropColumn === status && dropIndex === i}
								<div
									class="h-14 rounded-lg border-2 border-dashed border-indigo-400 bg-indigo-50/40"
								></div>
							{/if}
							{@const assignee = memberById(task.assigneeId)}
							<div
								data-task-id={task.id}
								onpointerdown={(event) => startDrag(event, task)}
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
												deleteError = '';
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
												<dd
													class="font-medium text-neutral-700"
													title={
														task.estimate
															? `Estimate: ${formatEstimate(task.estimate)} (1 day = 8 hours)`
															: undefined
													}
												>
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
										<div class="flex items-center gap-2">
											<button
												type="button"
												class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
												onpointerdown={(event) => event.stopPropagation()}
												onclick={(event) => {
													event.stopPropagation();
													handleExplain(task);
												}}
												disabled={!activeAiProvider()}
												title={
													!activeAiProvider()
														? 'Connect an AI provider in Settings → AI'
														: explainedTaskIds.has(task.id)
															? 'Open the saved explanation for this task'
															: 'Have AI explain this task'
													}
											>
												<Sparkles size={13} />
												{explainedTaskIds.has(task.id) ? 'Open explanation' : 'Explain task'}
											</button>
										</div>
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
												title={`Estimate: ${formatEstimate(task.estimate)} (1 day = 8 hours)`}
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
						{#if dropColumn === status && dropIndex === tasksInColumn(status).length}
							<div
								class="h-14 rounded-lg border-2 border-dashed border-indigo-400 bg-indigo-50/40"
							></div>
						{/if}
					</div>

					{#if addingStatus === status}
						<form
							class="mt-2 space-y-2"
							onsubmit={(event) => {
								event.preventDefault();
								handleAdd(status);
							}}
							autocomplete="off"
						>
							<input
								type="text"
								autocomplete="off"
								placeholder="Task title"
								class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
								bind:value={newTitle}
								required
							/>
							<Select
								class="w-full"
								bind:value={newAssigneeId}
								ariaLabel="Assignee"
								options={[
									{ value: '', label: 'Unassigned' },
									...members.map((m) => ({ value: m.id, label: m.name }))
								]}
							/>
						</form>
						{#if addTaskError}
							<p class="mt-1.5 text-xs text-red-600">{addTaskError}</p>
						{/if}
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
	{:else if view === 'list'}
		<section class="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-surface shadow-xs">
			<div class="overflow-x-auto">
				<table class="w-full min-w-[760px] text-left">
					<thead>
						<tr
							class="border-b border-neutral-200 text-xs font-semibold tracking-wider text-neutral-400 uppercase"
						>
							<th class="px-5 py-3">Task</th>
							<th class="px-3 py-3">Status</th>
							<th class="px-3 py-3">Priority</th>
							<th class="px-3 py-3">Assignee</th>
							<th class="px-3 py-3">Estimate</th>
							<th class="px-5 py-3">Due</th>
						</tr>
					</thead>
					<tbody>
						{#each listPageRows as task (task.id)}
							{@const assignee = memberById(task.assigneeId)}
							<tr
								class="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 {task.status ===
								'done'
									? 'bg-neutral-50/50'
									: ''}"
							>
								<td class="px-5 py-3">
									<p
										class="text-sm font-medium {task.status === 'done'
											? 'text-neutral-400 line-through'
											: 'text-neutral-800'}"
									>
										{task.title}
									</p>
									{#if task.description}
										<p class="mt-0.5 line-clamp-1 text-xs text-neutral-500">
											{task.description}
										</p>
									{/if}
								</td>
								<td class="px-3 py-3"><Badge variant="task" value={task.status} /></td>
								<td class="px-3 py-3"><Badge variant="priority" value={task.priority} /></td>
								<td class="px-3 py-3">
									{#if assignee}
										<span class="flex items-center gap-2 text-sm text-neutral-600">
											<Avatar member={assignee} size="sm" />
											{assignee.name}
										</span>
									{:else}
										<span class="text-sm text-neutral-400">Unassigned</span>
									{/if}
								</td>
								<td class="px-3 py-3 text-sm text-neutral-600">
									<span
										title={
											task.estimate
												? `Estimate: ${formatEstimate(task.estimate)} (1 day = 8 hours)`
												: undefined
										}
									>
										{formatEstimate(task.estimate) || '—'}
									</span>
								</td>
								<td
									class="px-5 py-3 text-sm {isOverdue(task.due) && task.status !== 'done'
										? 'font-medium text-red-600'
										: 'text-neutral-500'}"
								>
									{dueLabel(task.due)}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="6" class="px-5 py-16 text-center text-sm text-neutral-400">
									No tasks yet.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if listPageCount > 1}
				<div class="flex items-center justify-between border-t border-neutral-100 px-5 py-3">
					<p class="text-xs text-neutral-400">
						Page {effectiveListPage} of {listPageCount} · {listRows.length} tasks
					</p>
					<div class="flex items-center gap-1">
						<button
							type="button"
							class="rounded-lg border border-neutral-200 bg-surface px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
							onclick={() => (listPage = Math.max(1, listPage - 1))}
							disabled={listPage <= 1}
						>
							Previous
						</button>
						<button
							type="button"
							class="rounded-lg border border-neutral-200 bg-surface px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
							onclick={() => (listPage = Math.min(listPageCount, listPage + 1))}
							disabled={listPage >= listPageCount}
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		</section>
	{:else if view === 'roadmap'}
		<section class="mt-6 rounded-xl border border-neutral-200 bg-surface p-5 shadow-xs">
			<header class="flex items-center justify-between">
				<h2 class="font-semibold tracking-tight text-neutral-900">Roadmap</h2>
				<p class="text-xs text-neutral-400">{roadmapTasks.length} open tasks by target date</p>
			</header>
			{#if roadmapTasks.length === 0}
				<p class="py-12 text-center text-sm text-neutral-400">
					No open tasks with dates yet.
				</p>
			{:else}
				<div class="mt-4">
					<div class="mb-2 flex items-center justify-between text-xs text-neutral-400">
						<span>{formatDate(new Date(roadmapStart).toISOString())}</span>
						<span class="font-medium text-indigo-600">Today</span>
						<span>{formatDate(new Date(roadmapEnd).toISOString())}</span>
					</div>
					<ul class="divide-y divide-neutral-100">
						{#each roadmapTasks as task (task.id)}
							<li class="flex items-center gap-3 py-2.5">
								<div class="w-36 min-w-0 sm:w-56">
									<p class="truncate text-sm font-medium text-neutral-800">{task.title}</p>
									<p class="text-xs text-neutral-400">{dueLabel(task.due)}</p>
								</div>
								<div class="relative h-5 flex-1 rounded-full bg-neutral-100/80">
									{#if todayPct > 0 && todayPct < 100}
										<span
												class="absolute inset-y-0 w-px bg-indigo-400"
												style="left: {todayPct}%"
											></span>
									{/if}
									<span
										class="absolute inset-y-0 my-auto h-4 w-2 rounded-full {taskStatusStyles[task.status].dot}"
										style="left: {roadmapPct(task.due)}%"
										title="{task.title} · {dueLabel(task.due)}"
									></span>
								</div>
							</li>
						{/each}
					</ul>
				</div>
				<footer
					class="mt-3 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-3 text-[11px] text-neutral-400"
				>
					<span class="flex items-center gap-1.5">
						<span class="inline-block h-2 w-1.5 rounded-full bg-indigo-400"></span>
						Today
					</span>
					{#each allStatuses as s (s)}
						<span class="flex items-center gap-1.5">
							<span
								class="inline-block h-2 w-1.5 rounded-full {taskStatusStyles[s].dot}"
							></span>
							{taskStatusStyles[s].label}
						</span>
					{/each}
				</footer>
			{/if}
		</section>
	{:else}
		<section class="mt-6 rounded-xl border border-neutral-200 bg-surface p-5 shadow-xs">
			<header class="flex items-center justify-between">
				<h2 class="font-semibold tracking-tight text-neutral-900">Workload</h2>
				<p class="text-xs text-neutral-400">Open effort per team member</p>
			</header>
			<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{#each workloadRows as row (row.member.id)}
					{@const total = row.openCount + row.doneCount}
					<div class="rounded-xl border border-neutral-200 p-4">
						<div class="flex items-center gap-3">
							<Avatar member={row.member} />
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-neutral-900">
									{row.member.name}
								</p>
								<p class="text-xs text-neutral-400">
									{row.openCount} open · {row.doneCount} done
								</p>
							</div>
							{#if row.estimate > 0}
								<span
									class="ml-auto rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"
									title={`Estimate: ${formatEstimate(row.estimate)} (1 day = 8 hours)`}
								>
									~{formatEstimate(row.estimate)}
								</span>
							{/if}
						</div>
						<div class="mt-3">
							<ProgressBar
								value={total > 0 ? (row.doneCount / total) * 100 : 0}
								color="bg-emerald-500"
							/>
						</div>
					</div>
				{/each}
				{#if unassignedTasks.length > 0}
					<div class="rounded-xl border border-dashed border-neutral-300 p-4">
						<div class="flex items-center gap-3">
							<span
								class="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-500"
							>
								<User size={14} />
							</span>
							<div class="min-w-0">
								<p class="text-sm font-semibold text-neutral-900">Unassigned</p>
								<p class="text-xs text-neutral-400">
									{unassignedTasks.length} open tasks
								</p>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</section>
	{/if}

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
	error={deleteError}
	onConfirm={handleDeleteTask}
	onCancel={() => {
		deleteTaskTarget = null;
		deleteError = '';
	}}
/>
<ConfirmDialog
	open={deleteProjectOpen}
	title="Delete project?"
	message={`This will permanently delete "${project?.name ?? ''}" and all of its tasks.`}
	confirmLabel="Delete project"
	error={deleteError}
	onConfirm={handleDeleteProject}
	onCancel={() => {
		deleteProjectOpen = false;
		deleteError = '';
	}}
/>

{#if explainTarget}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- Deliberately no click handler: the modal only closes via ✕. -->
		<div class="absolute inset-0 bg-overlay" role="presentation"></div>
		<div
			class="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-200"
			role="dialog"
			aria-modal="true"
			aria-label="Explain task"
		>
			<header class="flex items-start gap-3 border-b border-neutral-100 px-5 py-4">
				<span
					class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"
				>
					<Sparkles size={17} />
				</span>
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-sm font-semibold text-neutral-900">
						{explainTarget.title}
					</h2>
					<p class="mt-0.5 text-xs text-neutral-500">
						{explainMessages.length === 0
							? 'Ask anything about this task — pick a suggestion or type below.'
							: 'AI-assisted walkthrough — ask follow-ups, the full project and task context is kept.'}
					</p>
				</div>
				<div class="flex shrink-0 items-center gap-1">
					{#if project?.repoPath}
						<button
							type="button"
							class="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={checkTaskInRepo}
							disabled={explainBusy || (!repoScan && !repoScanning)}
							title="Check the task against the connected repository (implementation & review)"
						>
							<GitBranch size={13} />
							Check repo
						</button>
					{/if}
					<button
						type="button"
						class="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
						onclick={newExplanation}
						disabled={explainBusy}
						title="Start a new explanation (replaces the saved one)"
					>
						<RefreshCw size={13} />
						New
					</button>
					<button
						type="button"
						class="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
						aria-label="Close"
						onclick={closeExplain}
					>
						<X size={18} />
					</button>
				</div>
			</header>

			{#if project?.repoPath}
				<div
					class="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/60 px-5 py-2"
				>
					<FolderGit2 size={13} class="shrink-0 text-neutral-400" />
					<span class="min-w-0 truncate text-xs text-neutral-500" title={project.repoPath}>
						{project.repoPath}
					</span>
					{#if repoScan && !repoScan.error}
						<span
							class="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
						>
							{repoScan.files.length} file{repoScan.files.length === 1 ? '' : 's'}
							{repoScan.truncated ? '+' : ''}
						</span>
					{:else if repoScanning}
						<span class="shrink-0 text-[10px] text-neutral-400">Scanning…</span>
					{:else if repoScanError}
						<span class="shrink-0 text-[10px] font-medium text-red-600">Unreadable</span>
					{:else}
						<span class="shrink-0 text-[10px] text-neutral-400">Not scanned</span>
					{/if}
					<button
						type="button"
						class="ml-auto shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
						onclick={() => {
							repoScan = null;
							repoSymbols = [];
							explainRepo = null;
							explainRepoTaskId = null;
							void scanProjectRepo();
						}}
						disabled={repoScanning}
						aria-label="Rescan repository"
						title="Rescan repository"
					>
						<RefreshCw size={12} />
					</button>
				</div>
			{/if}

			<div class="flex-1 space-y-3 overflow-y-auto px-5 py-4" bind:this={conversationEl}>
				{#if explainMessages.length === 0 && !explainBusy}
					<div class="space-y-3">
						<div class="flex items-start gap-2.5">
							<span
								class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"
							>
								<Sparkles size={12} />
							</span>
							<div
								class="max-w-[85%] rounded-xl rounded-tl-sm border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5 text-sm text-neutral-700"
							>
								Start a new conversation about this task.
							</div>
						</div>
						<p class="text-xs font-medium text-neutral-500">Try asking:</p>
						<div class="flex flex-wrap gap-2">
							{#each explainSuggestions(explainTarget) as suggestion (suggestion)}
								<button
									type="button"
									class="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-left text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
									onclick={() => sendFollowUpText(suggestion)}
								>
									{suggestion}
								</button>
							{/each}
						</div>
					</div>
				{/if}
				{#each explainMessages as message, i (i)}
					{#if message.role === 'assistant'}
						<div class="flex items-start gap-2.5">
							<span
								class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"
							>
								<Sparkles size={12} />
							</span>
							<div
								class="min-w-0 max-w-[85%] rounded-xl rounded-tl-sm border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5"
							>
								<Markdown text={message.content} />
							</div>
						</div>
					{:else}
						<div class="flex items-start justify-end gap-2.5">
							<div
								class="min-w-0 max-w-[85%] rounded-xl rounded-tr-sm border border-neutral-200 bg-surface px-3.5 py-2.5"
							>
								<Markdown text={message.content} />
							</div>
							<span
								class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500"
							>
								<User size={12} />
							</span>
						</div>
					{/if}
				{/each}

				{#if explainBusy && explainPending}
					<div class="flex items-start gap-2.5">
						<span
							class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"
						>
							<Sparkles size={12} />
						</span>
						<div
							class="min-w-0 max-w-[85%] rounded-xl rounded-tl-sm border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5"
						>
							<Markdown text={explainPending} />
							<span class="ml-0.5 inline-block w-1.5 animate-pulse bg-indigo-500">
								&nbsp;
							</span>
						</div>
					</div>
				{:else if explainBusy}
					<div class="flex items-start gap-2.5">
						<span
							class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"
						>
							<Sparkles size={12} />
						</span>
						<div
							class="flex items-center gap-1.5 rounded-xl rounded-tl-sm border border-indigo-100 bg-indigo-50/60 px-3.5 py-3"
						>
							<span class="size-1.5 animate-pulse rounded-full bg-indigo-400"></span>
							<span
								class="size-1.5 animate-pulse rounded-full bg-indigo-400 [animation-delay:150ms]"
							></span>
							<span
								class="size-1.5 animate-pulse rounded-full bg-indigo-400 [animation-delay:300ms]"
							></span>
						</div>
					</div>
				{/if}

				{#if explainError}
					<p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
						{explainError}
					</p>
				{/if}
			</div>

			<footer class="border-t border-neutral-100 px-5 py-3">
				<form
					class="flex items-end gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						if (explainBusy) {
							stopExplain();
						} else {
							sendFollowUp();
						}
					}}
				>
					<Select
						class="h-10 w-44 shrink-0"
						direction="up"
						bind:value={explainModel}
						ariaLabel="Model"
						options={
							(activeAiProvider()?.models.length ?? 0) > 0
								? (activeAiProvider()?.models ?? []).map((m) => ({ value: m, label: m }))
								: [{ value: explainModel, label: explainModel }]
						}
					/>
					<textarea
						rows="1"
						placeholder="Ask a follow-up about the task"
						class="max-h-40 min-h-10 w-full resize-none rounded-lg border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
						bind:value={explainInput}
						onkeydown={(event) => {
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault();
								sendFollowUp();
							}
						}}
						oninput={(event) => {
							const el = event.currentTarget;
							el.style.height = 'auto';
							el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
						}}
					></textarea>
					{#if explainBusy}
						<button
							type="submit"
							class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
							title="Stop generating"
							aria-label="Stop generating"
						>
							<span class="size-2.5 rounded-[2px] bg-current"></span>
						</button>
					{:else}
						<button
							type="submit"
							class="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!explainInput.trim() || !explainProvider}
						>
							Send
						</button>
					{/if}
				</form>
				<div class="mt-2 flex items-center justify-between">
					<p class="text-[11px] text-neutral-400">
						{#if unansweredCount > 1}
							{unansweredCount - 1} more question{unansweredCount - 1 === 1 ? '' : 's'} queued
						{:else}
							Enter to send · Shift+Enter for a new line
						{/if}
					</p>
				</div>
			</footer>
		</div>
	</div>
{/if}
