export type Member = {
	id: string;
	name: string;
	email: string;
	role: string;
	color: string;
	online: boolean;
};

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';

export type Project = {
	id: string;
	slug: string;
	name: string;
	description: string;
	status: ProjectStatus;
	progress: number;
	due: string;
	color: string;
	memberIds: string[];
};

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';

export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export type Task = {
	id: string;
	title: string;
	projectId: string;
	assigneeId: string;
	status: TaskStatus;
	priority: Priority;
	due: string;
	tags: string[];
};

export type Activity = {
	id: string;
	memberId: string;
	action: string;
	target: string;
	time: string;
};

export const taskStatuses: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

export const priorities: Priority[] = ['urgent', 'high', 'medium', 'low'];

export const projectStatuses: ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed'];
