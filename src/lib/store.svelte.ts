import Database from '@tauri-apps/plugin-sql';
import { avatarColors, taskStatusStyles } from './badges';
import type { Activity, Member, Priority, Project, ProjectStatus, Task, TaskStatus } from './types';
import { daysFromNow } from './utils';

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
};

type ProjectMemberRow = { project_id: string; member_id: string };

type TaskRow = {
	id: string;
	title: string;
	project_id: string;
	assignee_id: string | null;
	status: string;
	priority: string;
	due: string;
	tags: string;
};

type ActivityRow = {
	id: string;
	member_id: string | null;
	action: string;
	target: string;
	time: string;
};

let db: Database | null = null;
let initPromise: Promise<void> | null = null;

export const members = $state<Member[]>([]);
export const projects = $state<Project[]>([]);
export const tasks = $state<Task[]>([]);
export const activities = $state<Activity[]>([]);
export const status = $state({ ready: false, error: null as string | null });

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

function projectFromRow(row: ProjectRow, memberIds: string[]): Project {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		status: row.status as ProjectStatus,
		progress: row.progress,
		due: row.due,
		color: row.color,
		memberIds
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
		projectId: row.project_id,
		assigneeId: row.assignee_id,
		status: row.status as TaskStatus,
		priority: row.priority as Priority,
		due: row.due,
		tags
	};
}

function activityFromRow(row: ActivityRow): Activity {
	return {
		id: row.id,
		memberId: row.member_id,
		action: row.action,
		target: row.target,
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

	const activityRows = await database.select<ActivityRow[]>(
		'SELECT * FROM activities ORDER BY rowid DESC'
	);
	activities.splice(0, activities.length, ...activityRows.map(activityFromRow));
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

export async function addMember(input: { name: string; email: string; role: string }): Promise<void> {
	const database = requireDb();
	const member: Member = {
		id: newId(),
		name: input.name,
		email: input.email,
		role: input.role,
		color: avatarColors[members.length % avatarColors.length],
		online: true
	};
	await database.execute(
		'INSERT INTO members (id, name, email, role, color, online) VALUES (?, ?, ?, ?, ?, 1)',
		[member.id, member.name, member.email, member.role, member.color]
	);
	members.push(member);
}

	export async function createProject(input: {
	name: string;
	description?: string;
	status?: ProjectStatus;
	due?: string;
}): Promise<void> {
	const database = requireDb();
	const project: Project = {
		id: newId(),
		slug: slugify(input.name),
		name: input.name,
		description: input.description ?? 'A new project on Workmaster.',
		status: input.status ?? 'planning',
		progress: 0,
		due: input.due ?? daysFromNow(30),
		color: 'indigo',
		memberIds: []
	};
	await database.execute(
		'INSERT INTO projects (id, slug, name, description, status, progress, due, color) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
		[project.id, project.slug, project.name, project.description, project.status, project.due, project.color]
	);
	projects.unshift(project);
	await addActivity('created', project.name);
}

export async function createTask(input: {
	title: string;
	projectId: string;
	status?: TaskStatus;
	priority?: Priority;
	assigneeId?: string | null;
	due?: string;
	tags?: string[];
}): Promise<void> {
	const database = requireDb();
	const task: Task = {
		id: newId(),
		title: input.title,
		projectId: input.projectId,
		assigneeId: input.assigneeId ?? null,
		status: input.status ?? 'backlog',
		priority: input.priority ?? 'medium',
		due: input.due ?? daysFromNow(7),
		tags: input.tags ?? []
	};
	await database.execute(
		'INSERT INTO tasks (id, title, project_id, assignee_id, status, priority, due, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		[
			task.id,
			task.title,
			task.projectId,
			task.assigneeId,
			task.status,
			task.priority,
			task.due,
			JSON.stringify(task.tags)
		]
	);
	tasks.unshift(task);
	await addActivity('created', task.title);
}

export async function moveTask(taskId: string, status: TaskStatus): Promise<void> {
	const database = requireDb();
	const task = tasks.find((t) => t.id === taskId);
	if (!task || task.status === status) return;
	const previous = task.status;
	await database.execute('UPDATE tasks SET status = ? WHERE id = ?', [status, taskId]);
	task.status = status;
	await addActivity(
		'moved',
		`${task.title} from ${taskStatusStyles[previous].label} to ${taskStatusStyles[status].label}`
	);
}

export async function toggleTaskDone(taskId: string): Promise<void> {
	const database = requireDb();
	const task = tasks.find((t) => t.id === taskId);
	if (!task) return;
	const wasDone = task.status === 'done';
	const next = wasDone ? 'todo' : 'done';
	await database.execute('UPDATE tasks SET status = ? WHERE id = ?', [next, taskId]);
	task.status = next as TaskStatus;
	await addActivity(wasDone ? 'reopened' : 'completed', task.title);
}

async function addActivity(action: string, target: string): Promise<void> {
	const database = requireDb();
	const activity: Activity = {
		id: newId(),
		memberId: null,
		action,
		target,
		time: nowIso()
	};
	await database.execute(
		'INSERT INTO activities (id, member_id, action, target, time) VALUES (?, NULL, ?, ?, ?)',
		[activity.id, action, target, activity.time]
	);
	activities.unshift(activity);
}

export async function updateProject(
	id: string,
	input: { name: string; description: string; status: ProjectStatus; due: string }
): Promise<void> {
	const project = projects.find((p) => p.id === id);
	if (!project) return;
	const database = requireDb();
	await database.execute(
		'UPDATE projects SET name = ?, description = ?, status = ?, due = ? WHERE id = ?',
		[input.name, input.description, input.status, input.due, id]
	);
	project.name = input.name;
	project.description = input.description;
	project.status = input.status;
	project.due = input.due;
	await addActivity('updated', project.name);
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
	await addActivity('deleted', project.name);
}

export async function updateTask(
	id: string,
	input: {
		title: string;
		projectId: string;
		assigneeId: string | null;
		status: TaskStatus;
		priority: Priority;
		due: string;
		tags: string[];
	}
): Promise<void> {
	const task = tasks.find((t) => t.id === id);
	if (!task) return;
	const database = requireDb();
	await database.execute(
		'UPDATE tasks SET title = ?, project_id = ?, assignee_id = ?, status = ?, priority = ?, due = ?, tags = ? WHERE id = ?',
		[
			input.title,
			input.projectId,
			input.assigneeId,
			input.status,
			input.priority,
			input.due,
			JSON.stringify(input.tags),
			id
		]
	);
	task.title = input.title;
	task.projectId = input.projectId;
	task.assigneeId = input.assigneeId;
	task.status = input.status;
	task.priority = input.priority;
	task.due = input.due;
	task.tags = input.tags;
	await addActivity('updated', task.title);
}

export async function deleteTask(id: string): Promise<void> {
	const task = tasks.find((t) => t.id === id);
	if (!task) return;
	const database = requireDb();
	await database.execute('DELETE FROM tasks WHERE id = ?', [id]);
	tasks.splice(tasks.indexOf(task), 1);
	await addActivity('deleted', task.title);
}

export async function updateMember(
	id: string,
	input: { name: string; email: string; role: string }
): Promise<void> {
	const member = members.find((m) => m.id === id);
	if (!member) return;
	const database = requireDb();
	await database.execute('UPDATE members SET name = ?, email = ?, role = ? WHERE id = ?', [
		input.name,
		input.email,
		input.role,
		id
	]);
	member.name = input.name;
	member.email = input.email;
	member.role = input.role;
	await addActivity('updated', member.name);
}

export async function deleteMember(id: string): Promise<void> {
	const member = members.find((m) => m.id === id);
	if (!member) return;
	const database = requireDb();
	await database.execute('UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?', [id]);
	await database.execute('DELETE FROM project_members WHERE member_id = ?', [id]);
	await database.execute('DELETE FROM members WHERE id = ?', [id]);
	for (const task of tasks) {
		if (task.assigneeId === id) task.assigneeId = null;
	}
	members.splice(members.indexOf(member), 1);
	await addActivity('removed', member.name);
}
