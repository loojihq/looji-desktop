import { taskStatusStyles } from './badges';
import type { Activity, Member, Priority, Project, ProjectStatus, Task, TaskStatus } from './types';
import { daysFromNow, hoursAgo } from './utils';

export const currentUserId = 'm1';

export const members = $state<Member[]>([
	{
		id: 'm1',
		name: 'Alex Morgan',
		email: 'alex@workmaster.dev',
		role: 'Product lead',
		color: 'bg-indigo-500',
		online: true
	},
	{
		id: 'm2',
		name: 'Priya Sharma',
		email: 'priya@workmaster.dev',
		role: 'Engineering',
		color: 'bg-sky-500',
		online: true
	},
	{
		id: 'm3',
		name: 'Marcus Chen',
		email: 'marcus@workmaster.dev',
		role: 'Design',
		color: 'bg-emerald-500',
		online: true
	},
	{
		id: 'm4',
		name: 'Sofia Reyes',
		email: 'sofia@workmaster.dev',
		role: 'Engineering',
		color: 'bg-rose-500',
		online: false
	},
	{
		id: 'm5',
		name: 'Jonas Weber',
		email: 'jonas@workmaster.dev',
		role: 'Marketing',
		color: 'bg-amber-500',
		online: true
	},
	{
		id: 'm6',
		name: 'Hana Sato',
		email: 'hana@workmaster.dev',
		role: 'Operations',
		color: 'bg-violet-500',
		online: false
	}
]);

export const projects = $state<Project[]>([
	{
		id: 'p1',
		slug: 'workmaster-web',
		name: 'Workmaster Web',
		description: 'The new marketing site and documentation for Workmaster.',
		status: 'active',
		progress: 72,
		due: daysFromNow(21),
		color: 'indigo',
		memberIds: ['m1', 'm2', 'm3']
	},
	{
		id: 'p2',
		slug: 'mobile-app',
		name: 'Mobile App',
		description: 'iOS and Android companion app, first public beta.',
		status: 'active',
		progress: 48,
		due: daysFromNow(45),
		color: 'sky',
		memberIds: ['m1', 'm2', 'm4']
	},
	{
		id: 'p3',
		slug: 'design-system',
		name: 'Design System',
		description: 'Shared tokens, components, and interface guidelines.',
		status: 'on_hold',
		progress: 84,
		due: daysFromNow(12),
		color: 'violet',
		memberIds: ['m3']
	},
	{
		id: 'p4',
		slug: 'billing-v2',
		name: 'Billing v2',
		description: 'Invoicing, seats, and usage based pricing.',
		status: 'planning',
		progress: 8,
		due: daysFromNow(60),
		color: 'amber',
		memberIds: ['m1', 'm6']
	},
	{
		id: 'p5',
		slug: 'analytics',
		name: 'Analytics Dashboard',
		description: 'Project level reports and team velocity charts.',
		status: 'active',
		progress: 35,
		due: daysFromNow(30),
		color: 'emerald',
		memberIds: ['m2', 'm4', 'm5']
	},
	{
		id: 'p6',
		slug: 'onboarding',
		name: 'Onboarding Flow',
		description: 'Guided setup for new workspaces and teammate invites.',
		status: 'completed',
		progress: 100,
		due: daysFromNow(-5),
		color: 'rose',
		memberIds: ['m1', 'm3', 'm5']
	}
]);

export const tasks = $state<Task[]>([
	// Workmaster Web
	{
		id: 't1',
		title: 'Finalize pricing page copy',
		projectId: 'p1',
		assigneeId: 'm1',
		status: 'in_progress',
		priority: 'urgent',
		due: daysFromNow(1),
		tags: ['marketing']
	},
	{
		id: 't2',
		title: 'Build changelog page',
		projectId: 'p1',
		assigneeId: 'm2',
		status: 'in_progress',
		priority: 'high',
		due: daysFromNow(3),
		tags: ['frontend']
	},
	{
		id: 't3',
		title: 'Fix mobile nav overlap',
		projectId: 'p1',
		assigneeId: 'm3',
		status: 'todo',
		priority: 'medium',
		due: daysFromNow(5),
		tags: ['bug']
	},
	{
		id: 't4',
		title: 'Add dark mode toggle',
		projectId: 'p1',
		assigneeId: 'm2',
		status: 'in_review',
		priority: 'medium',
		due: daysFromNow(2),
		tags: ['frontend']
	},
	{
		id: 't5',
		title: 'Audit lighthouse scores',
		projectId: 'p1',
		assigneeId: 'm4',
		status: 'backlog',
		priority: 'low',
		due: daysFromNow(10),
		tags: ['performance']
	},
	{
		id: 't6',
		title: 'Write getting started guide',
		projectId: 'p1',
		assigneeId: 'm5',
		status: 'done',
		priority: 'medium',
		due: daysFromNow(-2),
		tags: ['docs']
	},
	// Mobile App
	{
		id: 't7',
		title: 'Wire up push notifications',
		projectId: 'p2',
		assigneeId: 'm4',
		status: 'in_progress',
		priority: 'high',
		due: daysFromNow(4),
		tags: ['mobile']
	},
	{
		id: 't8',
		title: 'Offline sync for tasks',
		projectId: 'p2',
		assigneeId: 'm2',
		status: 'in_progress',
		priority: 'urgent',
		due: daysFromNow(2),
		tags: ['mobile', 'sync']
	},
	{
		id: 't9',
		title: 'Empty state illustrations',
		projectId: 'p2',
		assigneeId: 'm3',
		status: 'todo',
		priority: 'low',
		due: daysFromNow(14),
		tags: ['design']
	},
	{
		id: 't10',
		title: 'Beta invite flow',
		projectId: 'p2',
		assigneeId: 'm1',
		status: 'in_review',
		priority: 'high',
		due: daysFromNow(1),
		tags: ['growth']
	},
	{
		id: 't11',
		title: 'Crash reporting setup',
		projectId: 'p2',
		assigneeId: 'm4',
		status: 'backlog',
		priority: 'medium',
		due: daysFromNow(20),
		tags: ['infra']
	},
	{
		id: 't12',
		title: 'Splash screen polish',
		projectId: 'p2',
		assigneeId: 'm3',
		status: 'done',
		priority: 'low',
		due: daysFromNow(-6),
		tags: ['design']
	},
	// Design System
	{
		id: 't13',
		title: 'Publish color tokens v2',
		projectId: 'p3',
		assigneeId: 'm3',
		status: 'in_review',
		priority: 'high',
		due: daysFromNow(3),
		tags: ['tokens']
	},
	{
		id: 't14',
		title: 'Document focus states',
		projectId: 'p3',
		assigneeId: 'm3',
		status: 'backlog',
		priority: 'medium',
		due: daysFromNow(15),
		tags: ['a11y']
	},
	// Billing v2
	{
		id: 't15',
		title: 'Draft pricing tiers',
		projectId: 'p4',
		assigneeId: 'm1',
		status: 'todo',
		priority: 'high',
		due: daysFromNow(7),
		tags: ['pricing']
	},
	{
		id: 't16',
		title: 'Compare invoicing providers',
		projectId: 'p4',
		assigneeId: 'm6',
		status: 'todo',
		priority: 'medium',
		due: daysFromNow(9),
		tags: ['research']
	},
	// Analytics
	{
		id: 't17',
		title: 'Velocity chart query',
		projectId: 'p5',
		assigneeId: 'm2',
		status: 'in_progress',
		priority: 'high',
		due: daysFromNow(5),
		tags: ['backend']
	},
	{
		id: 't18',
		title: 'Filter by date range',
		projectId: 'p5',
		assigneeId: 'm4',
		status: 'todo',
		priority: 'medium',
		due: daysFromNow(8),
		tags: ['frontend']
	},
	{
		id: 't19',
		title: 'Export to CSV',
		projectId: 'p5',
		assigneeId: 'm5',
		status: 'backlog',
		priority: 'low',
		due: daysFromNow(25),
		tags: ['reports']
	},
	// Onboarding
	{
		id: 't20',
		title: 'Welcome checklist copy',
		projectId: 'p6',
		assigneeId: 'm5',
		status: 'done',
		priority: 'medium',
		due: daysFromNow(-8),
		tags: ['copy']
	},
	{
		id: 't21',
		title: 'Invite teammate flow',
		projectId: 'p6',
		assigneeId: 'm1',
		status: 'done',
		priority: 'high',
		due: daysFromNow(-3),
		tags: ['flow']
	}
]);

export const activities = $state<Activity[]>([
	{
		id: 'a1',
		memberId: 'm2',
		action: 'moved',
		target: 'Offline sync for tasks to In progress',
		time: hoursAgo(1)
	},
	{
		id: 'a2',
		memberId: 'm3',
		action: 'completed',
		target: 'Splash screen polish',
		time: hoursAgo(2)
	},
	{ id: 'a3', memberId: 'm1', action: 'created', target: 'Draft pricing tiers', time: hoursAgo(4) },
	{
		id: 'a4',
		memberId: 'm4',
		action: 'commented on',
		target: 'Push notifications',
		time: hoursAgo(6)
	},
	{
		id: 'a5',
		memberId: 'm5',
		action: 'published',
		target: 'Getting started guide',
		time: hoursAgo(9)
	},
	{
		id: 'a6',
		memberId: 'm2',
		action: 'moved',
		target: 'Velocity chart query to In review',
		time: hoursAgo(26)
	}
]);

export function getCurrentUser(): Member {
	return members.find((member) => member.id === currentUserId) ?? members[0];
}

export function memberById(id: string): Member {
	return members.find((member) => member.id === id) ?? members[0];
}

export function projectById(id: string): Project {
	return projects.find((project) => project.id === id) ?? projects[0];
}

function pushActivity(action: string, target: string): void {
	activities.unshift({
		id: `a-${Date.now()}`,
		memberId: currentUserId,
		action,
		target,
		time: new Date().toISOString()
	});
}

export function moveTask(taskId: string, status: TaskStatus): void {
	const task = tasks.find((t) => t.id === taskId);
	if (!task || task.status === status) return;
	const previous = task.status;
	task.status = status;
	pushActivity(
		'moved',
		`${task.title} from ${taskStatusStyles[previous].label} to ${taskStatusStyles[status].label}`
	);
}

export function toggleTaskDone(taskId: string): void {
	const task = tasks.find((t) => t.id === taskId);
	if (!task) return;
	const wasDone = task.status === 'done';
	task.status = wasDone ? 'todo' : 'done';
	pushActivity(wasDone ? 'reopened' : 'completed', task.title);
}

export function createTask(input: {
	title: string;
	projectId: string;
	status?: TaskStatus;
	priority?: Priority;
	assigneeId?: string;
	due?: string;
	tags?: string[];
}): void {
	const task: Task = {
		id: `t-${Date.now()}`,
		title: input.title,
		projectId: input.projectId,
		assigneeId: input.assigneeId ?? currentUserId,
		status: input.status ?? 'backlog',
		priority: input.priority ?? 'medium',
		due: input.due ?? daysFromNow(7),
		tags: input.tags ?? []
	};
	tasks.unshift(task);
	pushActivity('created', task.title);
}

export function createProject(input: {
	name: string;
	description?: string;
	status?: ProjectStatus;
	due?: string;
}): void {
	const slug = input.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
	const project: Project = {
		id: `p-${Date.now()}`,
		slug,
		name: input.name,
		description: input.description ?? 'A new project on Workmaster.',
		status: input.status ?? 'planning',
		progress: 0,
		due: input.due ?? daysFromNow(30),
		color: 'indigo',
		memberIds: [currentUserId]
	};
	projects.unshift(project);
	pushActivity('created', project.name);
}
