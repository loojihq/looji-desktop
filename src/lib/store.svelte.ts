import Database from '@tauri-apps/plugin-sql';
import { avatarColors, taskStatusStyles } from './badges';
import type { TaskChatMessage } from './ai';
import type { RepoFile } from './repo';
import type {
	AiDraft,
	AuditEntry,
	Member,
	Priority,
	Project,
	ProjectStatus,
	SavedAiDraft,
	Settings,
	Task,
	TaskStatus
} from './types';
import { addWorkingHours, daysFromNow, minutesToTime } from './utils';

type MemberRow = {
	id: string;
	name: string;
	email: string;
	role: string;
	color: string;
	online: number;
};

type ProjectRow = {
	id: string;
	slug: string;
	name: string;
	description: string;
	status: string;
	progress: number;
	due: string;
	color: string;
	spec: string;
	user_stories: string;
	repo_path: string;
	work_start: number;
	work_end: number;
	work_days: string;
};

type ProjectMemberRow = { project_id: string; member_id: string };

type TaskRow = {
	id: string;
	title: string;
	description: string;
	project_id: string;
	assignee_id: string | null;
	status: string;
	priority: string;
	estimate: number;
	sort_order: number;
	original_due: string;
	due: string;
	tags: string;
	updated_at: string;
};

type AuditRow = {
	id: string;
	entity_type: string;
	entity_id: string;
	action: string;
	summary: string;
	details: string;
	time: string;
};

type SettingsRow = { key: string; value: string };

function assertProjectName(name: string): void {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Project name is required.');
	if (trimmed.length > 80) throw new Error('Project name must be 80 characters or fewer.');
}

function assertTaskTitle(title: string): void {
	const trimmed = title.trim();
	if (!trimmed) throw new Error('Task title is required.');
	if (trimmed.length > 200) throw new Error('Task title must be 200 characters or fewer.');
}

function assertMemberName(name: string): void {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Member name is required.');
	if (trimmed.length > 80) throw new Error('Member name must be 80 characters or fewer.');
}

function assertEmail(email: string): void {
	const trimmed = email.trim();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
		throw new Error('Please enter a valid email address.');
	}
	if (trimmed.length > 200) throw new Error('Email must be 200 characters or fewer.');
}

function assertProjectExists(projectId: string): void {
	if (!projects.some((p) => p.id === projectId)) {
		throw new Error('The task must belong to a project that exists.');
	}
}

function assertMemberExists(memberId: string | null): void {
	if (memberId && !members.some((m) => m.id === memberId)) {
		throw new Error('The selected assignee no longer exists.');
	}
}

let db: Database | null = null;
let initPromise: Promise<void> | null = null;

export const members = $state<Member[]>([]);
export const projects = $state<Project[]>([]);
export const tasks = $state<Task[]>([]);
export const auditLog = $state<AuditEntry[]>([]);
export const status = $state({ ready: false, error: null as string | null });
export const settings = $state<Settings>({
	theme: 'system',
	autoEscalate: true,
	notifAssignments: true,
	notifDigest: true,
	notifMentions: true,
	notifProduct: false,
	workspaceName: 'Workmaster',
	timezone: 'America/Los_Angeles',
	aiApiKey: '',
	aiModel: 'deepseek-chat',
	aiModels: [],
	boardStatuses: ['todo', 'in_progress', 'in_review', 'done']
});

function requireDb(): Database {
	if (!db) throw new Error('Store not initialised');
	return db;
}

function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
	return new Date().toISOString();
}

function memberFromRow(row: MemberRow): Member {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role,
		color: row.color,
		online: row.online === 1
	};
}

	const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

	function projectFromRow(row: ProjectRow, memberIds: string[]): Project {
	let userStories: string[] = [];
	try {
		userStories = JSON.parse(row.user_stories) as string[];
	} catch {
		userStories = [];
	}
	let workDays: number[] = [];
	try {
		const parsed = JSON.parse(row.work_days) as unknown;
		if (Array.isArray(parsed) && parsed.every((d) => typeof d === 'number')) {
			workDays = parsed;
		}
	} catch {
		workDays = [];
	}
	if (workDays.length === 0) workDays = DEFAULT_WORK_DAYS;
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		status: row.status as ProjectStatus,
		progress: row.progress,
		due: row.due,
		color: row.color,
		memberIds,
		spec: row.spec ?? '',
		userStories,
		repoPath: row.repo_path ?? '',
		workStart: row.work_start ?? 540,
		workEnd: row.work_end ?? 1020,
		workDays
	};
}

function taskFromRow(row: TaskRow): Task {
	let tags: string[] = [];
	try {
		tags = JSON.parse(row.tags) as string[];
	} catch {
		tags = [];
	}
	return {
		id: row.id,
		title: row.title,
		description: row.description ?? '',
		projectId: row.project_id,
		assigneeId: row.assignee_id,
		status: row.status as TaskStatus,
		priority: row.priority as Priority,
		estimate: row.estimate > 0 ? row.estimate : null,
		sortOrder: row.sort_order ?? 0,
		originalDue: row.original_due ?? '',
		due: row.due,
		tags,
		updatedAt: row.updated_at
	};
}

function auditFromRow(row: AuditRow): AuditEntry {
	let details: AuditEntry['details'] = {};
	try {
		details = JSON.parse(row.details) as AuditEntry['details'];
	} catch {
		details = {};
	}
	return {
		id: row.id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		action: row.action,
		summary: row.summary,
		details,
		time: row.time
	};
}

export function initStore(): Promise<void> {
	if (!initPromise) initPromise = load();
	return initPromise;
}

async function load(): Promise<void> {
	try {
		db = await Database.load('sqlite:workmaster.db');
		await refreshAll();
		await runAutomations();
	} catch (err) {
		console.error('Failed to load the database', err);
		status.error = err instanceof Error ? err.message : String(err);
	}
	status.ready = true;
}

async function refreshAll(): Promise<void> {
	const database = requireDb();

	const memberRows = await database.select<MemberRow[]>('SELECT * FROM members ORDER BY rowid');
	members.splice(0, members.length, ...memberRows.map(memberFromRow));

	const projectRows = await database.select<ProjectRow[]>('SELECT * FROM projects ORDER BY rowid');
	const linkRows = await database.select<ProjectMemberRow[]>(
		'SELECT project_id, member_id FROM project_members'
	);
	const memberIdsByProject = new Map<string, string[]>();
	for (const link of linkRows) {
		const list = memberIdsByProject.get(link.project_id) ?? [];
		list.push(link.member_id);
		memberIdsByProject.set(link.project_id, list);
	}
	projects.splice(
		0,
		projects.length,
		...projectRows.map((row) => projectFromRow(row, memberIdsByProject.get(row.id) ?? []))
	);

	const taskRows = await database.select<TaskRow[]>('SELECT * FROM tasks ORDER BY rowid');
	tasks.splice(0, tasks.length, ...taskRows.map(taskFromRow));

	const auditRows = await database.select<AuditRow[]>('SELECT * FROM audit_log ORDER BY rowid DESC');
	auditLog.splice(0, auditLog.length, ...auditRows.map(auditFromRow));

	const settingRows = await database.select<SettingsRow[]>('SELECT key, value FROM settings');
	for (const row of settingRows) {
		try {
			const parsed = JSON.parse(row.value);
			if (row.key in settings) {
				(settings as unknown as Record<string, unknown>)[row.key] = parsed;
			}
		} catch {
			// ignore malformed settings values
		}
	}
}

export function memberById(id: string | null): Member | undefined {
	if (!id) return undefined;
	return members.find((member) => member.id === id);
}

export function projectById(id: string): Project | undefined {
	return projects.find((project) => project.id === id);
}

export function projectProgress(projectId: string): number {
	const projectTasks = tasks.filter((task) => task.projectId === projectId);
	if (projectTasks.length === 0) return 0;
	const done = projectTasks.filter((task) => task.status === 'done').length;
	return Math.round((done / projectTasks.length) * 100);
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

async function logAudit(
	entityType: string,
	entityId: string,
	action: string,
	summary: string,
	details: AuditEntry['details'] = {}
): Promise<void> {
	const database = requireDb();
	const entry: AuditEntry = {
		id: newId(),
		entityType,
		entityId,
		action,
		summary,
		details,
		time: nowIso()
	};
	await database.execute(
		'INSERT INTO audit_log (id, entity_type, entity_id, action, summary, details, time) VALUES (?, ?, ?, ?, ?, ?, ?)',
		[entry.id, entityType, entityId, action, summary, JSON.stringify(details), entry.time]
	);
	auditLog.unshift(entry);
}

export function applyTheme(): void {
	const root = document.documentElement;
	const dark =
		settings.theme === 'dark' ||
		(settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
	root.classList.toggle('dark', dark);
}

export async function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
	const database = requireDb();
	await database.execute(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
		[key, JSON.stringify(value)]
	);
	const previous = settings[key];
	settings[key] = value;
	if (key === 'workspaceName' || key === 'timezone' || key === 'theme') {
		await logAudit('settings', key, 'updated', `Changed setting "${key}" to ${String(value)}`, {
			[key]: { from: previous, to: value }
		});
	}
}

export async function addMember(input: { name: string; email: string; role: string }): Promise<void> {
	const database = requireDb();
	assertMemberName(input.name);
	assertEmail(input.email);
	const email = input.email.trim();
	if (members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
		throw new Error('A member with this email already exists.');
	}
	const member: Member = {
		id: newId(),
		name: input.name.trim(),
		email,
		role: input.role,
		color: avatarColors[members.length % avatarColors.length],
		online: true
	};
	await database.execute(
		'INSERT INTO members (id, name, email, role, color, online) VALUES (?, ?, ?, ?, ?, 1)',
		[member.id, member.name, member.email, member.role, member.color]
	);
	members.push(member);
	await logAudit('member', member.id, 'created', `Added member "${member.name}"`, {
		name: { from: null, to: member.name },
		email: { from: null, to: member.email },
		role: { from: null, to: member.role }
	});
}

export async function updateMember(
	id: string,
	input: { name: string; email: string; role: string }
): Promise<void> {
	const member = members.find((m) => m.id === id);
	if (!member) return;
	assertMemberName(input.name);
	assertEmail(input.email);
	const email = input.email.trim();
	if (members.some((m) => m.id !== id && m.email.toLowerCase() === email.toLowerCase())) {
		throw new Error('A member with this email already exists.');
	}
	const database = requireDb();
	const changes: AuditEntry['details'] = {};
	if (member.name !== input.name.trim()) changes.name = { from: member.name, to: input.name.trim() };
	if (member.email !== email) changes.email = { from: member.email, to: email };
	if (member.role !== input.role) changes.role = { from: member.role, to: input.role };
	await database.execute('UPDATE members SET name = ?, email = ?, role = ? WHERE id = ?', [
		input.name.trim(),
		email,
		input.role,
		id
	]);
	member.name = input.name.trim();
	member.email = email;
	member.role = input.role;
	if (Object.keys(changes).length > 0) {
		await logAudit('member', id, 'updated', `Updated member "${member.name}"`, changes);
	}
}

export async function deleteMember(id: string): Promise<void> {
	const member = members.find((m) => m.id === id);
	if (!member) return;
	const openTasks = tasks.filter((t) => t.assigneeId === id && t.status !== 'done').length;
	if (openTasks > 0) {
		throw new Error(
			`Cannot remove "${member.name}" while they have ${openTasks} open task${openTasks === 1 ? '' : 's'}. Reassign or complete them first.`
		);
	}
	const database = requireDb();
	await database.execute('UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?', [id]);
	await database.execute('DELETE FROM project_members WHERE member_id = ?', [id]);
	await database.execute('DELETE FROM members WHERE id = ?', [id]);
	for (const task of tasks) {
		if (task.assigneeId === id) task.assigneeId = null;
	}
	members.splice(members.indexOf(member), 1);
	await logAudit('member', id, 'removed', `Removed member "${member.name}"`, {});
}

export async function createProject(input: {
	name: string;
	description?: string;
	status?: ProjectStatus;
	due?: string;
}): Promise<void> {
	const database = requireDb();
	assertProjectName(input.name);
	const name = input.name.trim();
	if (projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
		throw new Error('A project with this name already exists.');
	}
	const project: Project = {
		id: newId(),
		slug: slugify(name),
		name,
		description: input.description?.trim() ?? '',
		status: input.status ?? 'planning',
		progress: 0,
		due: input.due ?? daysFromNow(30),
		color: 'indigo',
		memberIds: [],
		spec: '',
		userStories: [],
		repoPath: '',
		workStart: 540,
		workEnd: 1020,
		workDays: [1, 2, 3, 4, 5]
	};
	await database.execute(
		'INSERT INTO projects (id, slug, name, description, status, progress, due, color) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
		[project.id, project.slug, project.name, project.description, project.status, project.due, project.color]
	);
	projects.unshift(project);
	await logAudit('project', project.id, 'created', `Created project "${project.name}"`, {
		status: { from: null, to: project.status },
		due: { from: null, to: project.due }
	});
}

export async function updateProject(
	id: string,
	input: {
		name: string;
		description: string;
		status: ProjectStatus;
		due: string;
		workStart?: number;
		workEnd?: number;
		workDays?: number[];
		repoPath?: string;
	}
): Promise<void> {
	const project = projects.find((p) => p.id === id);
	if (!project) return;
	assertProjectName(input.name);
	const name = input.name.trim();
	if (projects.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) {
		throw new Error('A project with this name already exists.');
	}
	if (input.status === 'completed' && project.status !== 'completed') {
		const open = tasks.filter((t) => t.projectId === id && t.status !== 'done').length;
		if (open > 0) {
			throw new Error(
				`Cannot mark "${name}" as completed while it has ${open} open task${open === 1 ? '' : 's'}.`
			);
		}
	}
	const database = requireDb();
	const changes: AuditEntry['details'] = {};
	if (project.name !== name) changes.name = { from: project.name, to: name };
	if (project.description !== input.description.trim()) {
		changes.description = { from: project.description, to: input.description.trim() };
	}
	if (project.status !== input.status) changes.status = { from: project.status, to: input.status };
	if (project.due !== input.due) changes.due = { from: project.due, to: input.due };
	const workStart = input.workStart ?? project.workStart;
	const workEnd = input.workEnd ?? project.workEnd;
	const workDays = input.workDays ?? project.workDays;
	if (project.workStart !== workStart || project.workEnd !== workEnd) {
		changes.workingHours = {
			from: `${minutesToTime(project.workStart)}–${minutesToTime(project.workEnd)}`,
			to: `${minutesToTime(workStart)}–${minutesToTime(workEnd)}`
		};
	}
	if (JSON.stringify(project.workDays) !== JSON.stringify(workDays)) {
		changes.workDays = { from: [...project.workDays], to: [...workDays] };
	}
	const repoPath = (input.repoPath ?? project.repoPath).trim();
	if (project.repoPath !== repoPath) {
		changes.repoPath = { from: project.repoPath, to: repoPath };
	}
	await database.execute(
		'UPDATE projects SET name = ?, description = ?, status = ?, due = ?, work_start = ?, work_end = ?, work_days = ?, repo_path = ? WHERE id = ?',
		[
			name,
			input.description.trim(),
			input.status,
			input.due,
			workStart,
			workEnd,
			JSON.stringify(workDays),
			repoPath,
			id
		]
	);
	project.name = name;
	project.description = input.description.trim();
	project.status = input.status;
	project.due = input.due;
	project.workStart = workStart;
	project.workEnd = workEnd;
	project.workDays = workDays;
	project.repoPath = repoPath;
	if (Object.keys(changes).length > 0) {
		await logAudit('project', id, 'updated', `Updated project "${project.name}"`, changes);
	}
}

export async function deleteProject(id: string): Promise<void> {
	const project = projects.find((p) => p.id === id);
	if (!project) return;
	const database = requireDb();
	await database.execute('DELETE FROM tasks WHERE project_id = ?', [id]);
	await database.execute('DELETE FROM project_members WHERE project_id = ?', [id]);
	await database.execute('DELETE FROM projects WHERE id = ?', [id]);
	const remainingTasks = tasks.filter((task) => task.projectId !== id);
	tasks.splice(0, tasks.length, ...remainingTasks);
	projects.splice(projects.indexOf(project), 1);
	await logAudit('project', id, 'deleted', `Deleted project "${project.name}" and its tasks`, {});
}

export async function createTask(input: {
	title: string;
	description?: string;
	projectId: string;
	status?: TaskStatus;
	priority?: Priority;
	assigneeId?: string | null;
	estimate?: number | null;
	sortOrder?: number;
	due?: string;
	tags?: string[];
}): Promise<void> {
	const database = requireDb();
	assertTaskTitle(input.title);
	assertProjectExists(input.projectId);
	assertMemberExists(input.assigneeId ?? null);
	const task: Task = {
		id: newId(),
		title: input.title.trim(),
		description: input.description?.trim() ?? '',
		projectId: input.projectId,
		assigneeId: input.assigneeId ?? null,
		status: input.status ?? 'backlog',
		priority: input.priority ?? 'medium',
		estimate: input.estimate && input.estimate > 0 ? input.estimate : null,
		sortOrder: input.sortOrder ?? 0,
		originalDue: '',
		due: input.due ?? daysFromNow(7),
		tags: input.tags ?? [],
		updatedAt: nowIso()
	};
	await database.execute(
		'INSERT INTO tasks (id, title, description, project_id, assignee_id, status, priority, estimate, sort_order, due, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		[
			task.id,
			task.title,
			task.description,
			task.projectId,
			task.assigneeId,
			task.status,
			task.priority,
			task.estimate ?? 0,
			task.sortOrder,
			task.due,
			JSON.stringify(task.tags),
			task.updatedAt
		]
	);
	tasks.unshift(task);
	await logAudit('task', task.id, 'created', `Created task "${task.title}"`, {
		project: { from: null, to: projectById(task.projectId)?.name ?? task.projectId },
		status: { from: null, to: task.status },
		priority: { from: null, to: task.priority }
	});
}

export async function updateTask(
	id: string,
	input: {
		title: string;
		description?: string;
		projectId: string;
		assigneeId: string | null;
		status: TaskStatus;
		priority: Priority;
		estimate?: number | null;
		due: string;
		tags: string[];
	}
): Promise<void> {
	const task = tasks.find((t) => t.id === id);
	if (!task) return;
	assertTaskTitle(input.title);
	assertProjectExists(input.projectId);
	assertMemberExists(input.assigneeId);
	const database = requireDb();
	const changes: AuditEntry['details'] = {};
	if (task.title !== input.title.trim()) changes.title = { from: task.title, to: input.title.trim() };
	const nextDescription = input.description?.trim() ?? task.description;
	if (task.description !== nextDescription) {
		changes.description = { from: task.description, to: nextDescription };
	}
	if (task.projectId !== input.projectId) {
		changes.project = {
			from: projectById(task.projectId)?.name ?? task.projectId,
			to: projectById(input.projectId)?.name ?? input.projectId
		};
	}
	if (task.assigneeId !== input.assigneeId) {
		changes.assignee = { from: task.assigneeId ?? 'Unassigned', to: input.assigneeId ?? 'Unassigned' };
	}
	if (task.status !== input.status) changes.status = { from: task.status, to: input.status };
	if (task.priority !== input.priority) changes.priority = { from: task.priority, to: input.priority };
	const nextEstimateRaw = input.estimate ?? task.estimate;
	const nextEstimate = nextEstimateRaw && nextEstimateRaw > 0 ? nextEstimateRaw : null;
	if (task.estimate !== nextEstimate) {
		changes.estimate = { from: task.estimate, to: nextEstimate };
	}
	if (task.due !== input.due) changes.due = { from: task.due, to: input.due };
	const nextTags = input.tags ?? [];
	if (JSON.stringify(task.tags) !== JSON.stringify(nextTags)) {
		changes.tags = { from: task.tags.join(', '), to: nextTags.join(', ') };
	}
	const updatedAt = nowIso();
	await database.execute(
		'UPDATE tasks SET title = ?, description = ?, project_id = ?, assignee_id = ?, status = ?, priority = ?, estimate = ?, due = ?, tags = ?, updated_at = ? WHERE id = ?',
		[
			input.title.trim(),
			nextDescription,
			input.projectId,
			input.assigneeId,
			input.status,
			input.priority,
			nextEstimate ?? 0,
			input.due,
			JSON.stringify(nextTags),
			updatedAt,
			id
		]
	);
	task.title = input.title.trim();
	task.description = nextDescription;
	task.projectId = input.projectId;
	task.assigneeId = input.assigneeId;
	task.status = input.status;
	task.priority = input.priority;
	task.estimate = nextEstimate;
	task.due = input.due;
	task.tags = nextTags;
	task.updatedAt = updatedAt;
	if (Object.keys(changes).length > 0) {
		await logAudit('task', id, 'updated', `Updated task "${task.title}"`, changes);
	}
}

export async function moveTask(taskId: string, status: TaskStatus, index?: number): Promise<void> {
	const database = requireDb();
	const task = tasks.find((t) => t.id === taskId);
	if (!task) return;
	const previous = task.status;
	const updatedAt = nowIso();
	const project = projects.find((p) => p.id === task.projectId);
	const workStart = project?.workStart ?? 540;
	const workEnd = project?.workEnd ?? 1020;
	const workDays = project?.workDays ?? [1, 2, 3, 4, 5];

	// Target position within the column's current order (dropped at the end
	// when no explicit index is given).
	const byOrder = (a: Task, b: Task) => a.sortOrder - b.sortOrder;
	const columnTasks = tasks
		.filter((t) => t.projectId === task.projectId && t.status === status && t.id !== taskId)
		.sort(byOrder);
	const insertAt = Math.max(0, Math.min(index ?? columnTasks.length, columnTasks.length));
	if (previous === status) {
		const currentIndex = tasks
			.filter((t) => t.projectId === task.projectId && t.status === status)
			.sort(byOrder)
			.indexOf(task);
		if (currentIndex === insertAt) return; // dropped where it already sits
	}
	columnTasks.splice(insertAt, 0, task);

	// When work actually starts, re-base the due time on the real current moment
	// plus the remaining estimate, counted across the project's working hours and
	// workdays. The pre-recalc due is remembered so moving back can restore it.
	const beforeDue = task.due;
	let due = beforeDue;
	let originalDue = task.originalDue;
	if (previous !== status) {
		if (status === 'in_progress' && task.estimate && task.estimate > 0) {
			originalDue = beforeDue;
			due = addWorkingHours(new Date(), task.estimate, workStart, workEnd, workDays).toISOString();
		} else if (status === 'todo' || status === 'backlog') {
			// Moving back out of progress resets the due date to the pre-recalc
			// value. Tasks that never recorded one (e.g. created before the
			// original_due column existed) reset to the project's target date.
			if (task.originalDue) {
				due = task.originalDue;
				originalDue = '';
			} else if (previous === 'in_progress' || previous === 'in_review') {
				due = project?.due || beforeDue;
				originalDue = '';
			}
		}
	}

	// Renumber the affected column(s) so the displayed order stays contiguous.
	const toRenumber: Task[] = [];
	if (previous === status) {
		toRenumber.push(...columnTasks);
	} else {
		const sourceColumn = tasks
			.filter((t) => t.projectId === task.projectId && t.status === previous)
			.sort(byOrder);
		toRenumber.push(...sourceColumn, ...columnTasks);
	}
	for (const [order, t] of toRenumber.entries()) {
		if (t.sortOrder === order) continue;
		await database.execute('UPDATE tasks SET sort_order = ? WHERE id = ?', [order, t.id]);
		t.sortOrder = order;
	}

	await database.execute(
		'UPDATE tasks SET status = ?, due = ?, original_due = ?, updated_at = ? WHERE id = ?',
		[status, due, originalDue, updatedAt, taskId]
	);
	task.status = status;
	task.due = due;
	task.originalDue = originalDue;
	task.updatedAt = updatedAt;
	await logAudit(
		'task',
		taskId,
		'moved',
		`Moved "${task.title}" from ${taskStatusStyles[previous].label} to ${taskStatusStyles[status].label}`,
		{
			status: { from: previous, to: status },
			...(due !== beforeDue ? { due: { from: beforeDue, to: due } } : {})
		}
	);
}

export async function toggleTaskDone(taskId: string): Promise<void> {
	const database = requireDb();
	const task = tasks.find((t) => t.id === taskId);
	if (!task) return;
	const wasDone = task.status === 'done';
	const next = wasDone ? 'todo' : 'done';
	const updatedAt = nowIso();
	await database.execute('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [
		next,
		updatedAt,
		taskId
	]);
	task.status = next as TaskStatus;
	task.updatedAt = updatedAt;
	await logAudit(
		'task',
		taskId,
		wasDone ? 'reopened' : 'completed',
		wasDone ? `Reopened "${task.title}"` : `Completed "${task.title}"`,
		{ status: { from: wasDone ? 'done' : 'todo', to: next } }
	);
}

export async function deleteTask(id: string): Promise<void> {
	const task = tasks.find((t) => t.id === id);
	if (!task) return;
	const database = requireDb();
	await database.execute('DELETE FROM tasks WHERE id = ?', [id]);
	tasks.splice(tasks.indexOf(task), 1);
	await logAudit('task', id, 'deleted', `Deleted task "${task.title}"`, {});
}

export async function runAutomations(): Promise<void> {
	try {
		if (!settings.autoEscalate) return;
		const database = requireDb();
		const now = Date.now();
		const escalations: { task: Task; from: TaskStatus; to: TaskStatus }[] = [];
		for (const task of tasks) {
			if (task.status === 'todo' && task.due && new Date(task.due).getTime() < now) {
				escalations.push({ task, from: task.status, to: 'in_progress' });
			}
		}
		for (const { task, from, to } of escalations) {
			const updatedAt = nowIso();
			await database.execute('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [
				to,
				updatedAt,
				task.id
			]);
			task.status = to;
			task.updatedAt = updatedAt;
			await logAudit(
				'task',
				task.id,
				'auto-moved',
				`Auto-moved "${task.title}" to ${taskStatusStyles[to].label} (overdue)`,
				{ status: { from, to } }
			);
		}
	} catch (err) {
		console.error('Automation run failed', err);
	}
}

/**
 * Persists an AI-generated draft: saves the spec/user stories on the project
 * and creates each generated task in the backlog. Returns the number of tasks
 * created. `assignments` maps member names to member ids.
 */
export async function publishAiDraft(
	projectId: string,
	draft: AiDraft,
	due: string,
	assignments: Record<string, string | null>
): Promise<number> {
	const project = projects.find((p) => p.id === projectId);
	if (!project) return 0;
	const database = requireDb();
	await database.execute('UPDATE projects SET spec = ?, user_stories = ? WHERE id = ?', [
		draft.spec,
		JSON.stringify(draft.userStories),
		projectId
	]);
	project.spec = draft.spec;
	project.userStories = draft.userStories;

	let count = 0;
	for (const [index, task] of draft.tasks.entries()) {
		if (!task.title.trim()) continue;
		await createTask({
			title: task.title,
			description: task.description,
			projectId,
			status: 'backlog',
			priority: task.priority,
			assigneeId: task.assignee ? (assignments[task.assignee] ?? null) : null,
			estimate: task.estimateHours ?? null,
			sortOrder: index,
			due,
			tags: task.tags
		});
		count++;
	}
	await logAudit(
		'project',
		projectId,
		'updated',
		`Published AI-generated plan for "${project.name}" (${count} task${count === 1 ? '' : 's'})`,
		{ ai: { from: null, to: `spec + ${draft.userStories.length} stories + ${count} tasks` } }
	);
	return count;
}

type AiDraftRow = {
	draft: string;
	desires: string;
	due: string;
	specialties: string;
	included: string;
	specialty: string;
};

/** Persists the in-progress AI draft so it can be resumed later. */
export async function saveAiDraft(projectId: string, data: SavedAiDraft): Promise<void> {
	const database = requireDb();
	await database.execute(
		'INSERT INTO ai_drafts (project_id, draft, desires, due, specialties, included, specialty, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET draft = excluded.draft, desires = excluded.desires, due = excluded.due, specialties = excluded.specialties, included = excluded.included, specialty = excluded.specialty, updated_at = excluded.updated_at',
		[
			projectId,
			JSON.stringify(data.draft),
			data.desires,
			data.due,
			JSON.stringify(data.specialties),
			JSON.stringify(data.included),
			JSON.stringify(data.specialty),
			nowIso()
		]
	);
}

/** Loads a saved draft for a project, or null when none exists. */
export async function loadAiDraft(projectId: string): Promise<SavedAiDraft | null> {
	const database = requireDb();
	const rows = await database.select<AiDraftRow[]>(
		'SELECT draft, desires, due, specialties, included, specialty FROM ai_drafts WHERE project_id = ?',
		[projectId]
	);
	const row = rows[0];
	if (!row) return null;
	try {
		return {
			draft: row.draft ? (JSON.parse(row.draft) as AiDraft) : null,
			desires: row.desires ?? '',
			due: row.due ?? '',
			specialties: JSON.parse(row.specialties || '[]') as string[],
			included: JSON.parse(row.included || '{}') as Record<string, boolean>,
			specialty: JSON.parse(row.specialty || '{}') as Record<string, string>
		};
	} catch {
		return null;
	}
}

/** Removes a saved draft (e.g. after publishing). */
export async function clearAiDraft(projectId: string): Promise<void> {
	const database = requireDb();
	await database.execute('DELETE FROM ai_drafts WHERE project_id = ?', [projectId]);
}

type TaskExplanationRow = {
	messages: string;
};

/** Persists a task's AI explanation conversation so it can be resumed later. */
export async function saveTaskExplanation(
	taskId: string,
	messages: TaskChatMessage[]
): Promise<void> {
	const database = requireDb();
	await database.execute(
		'INSERT INTO task_explanations (task_id, messages, updated_at) VALUES (?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at',
		[taskId, JSON.stringify(messages), nowIso()]
	);
}

/** Loads a saved explanation conversation for a task, or null when none exists. */
export async function loadTaskExplanation(taskId: string): Promise<TaskChatMessage[] | null> {
	const database = requireDb();
	const rows = await database.select<TaskExplanationRow[]>(
		'SELECT messages FROM task_explanations WHERE task_id = ?',
		[taskId]
	);
	const row = rows[0];
	if (!row) return null;
	try {
		const parsed: unknown = JSON.parse(row.messages);
		if (!Array.isArray(parsed)) return null;
		return parsed.filter(
			(m): m is TaskChatMessage =>
				typeof m === 'object' &&
				m !== null &&
				(m.role === 'user' || m.role === 'assistant') &&
				typeof m.content === 'string'
		);
	} catch {
		return null;
	}
}

/** Removes a task's saved explanation conversation (e.g. when starting fresh). */
export async function clearTaskExplanation(taskId: string): Promise<void> {
	const database = requireDb();
	await database.execute('DELETE FROM task_explanations WHERE task_id = ?', [taskId]);
}

/** Lists task ids in a project that already have a saved explanation. */
export async function loadTaskExplanationIds(projectId: string): Promise<string[]> {
	const database = requireDb();
	const rows = await database.select<{ task_id: string }[]>(
		'SELECT task_id FROM task_explanations WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)',
		[projectId]
	);
	return rows.map((r) => r.task_id);
}

type RepoIndexRow = {
	root: string;
	files: string;
	symbols: string;
};

/** Saves the scanned repo index (file list + symbol map) for a project. */
export async function saveRepoIndex(
	projectId: string,
	index: { root: string; files: RepoFile[]; symbols: { file: string; symbols: string[] }[] }
): Promise<void> {
	const database = requireDb();
	await database.execute(
		'INSERT INTO repo_index (project_id, root, files, symbols, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET root = excluded.root, files = excluded.files, symbols = excluded.symbols, updated_at = excluded.updated_at',
		[projectId, index.root, JSON.stringify(index.files), JSON.stringify(index.symbols), nowIso()]
	);
}

/** Loads a previously scanned repo index for a project, or null when absent. */
export async function loadRepoIndex(projectId: string): Promise<{
	root: string;
	files: RepoFile[];
	symbols: { file: string; symbols: string[] }[];
} | null> {
	const database = requireDb();
	const rows = await database.select<RepoIndexRow[]>(
		'SELECT root, files, symbols FROM repo_index WHERE project_id = ?',
		[projectId]
	);
	const row = rows[0];
	if (!row) return null;
	try {
		return {
			root: row.root,
			files: JSON.parse(row.files) as RepoFile[],
			symbols: JSON.parse(row.symbols) as { file: string; symbols: string[] }[]
		};
	} catch {
		return null;
	}
}
