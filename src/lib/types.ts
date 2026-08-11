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
	spec: string;
	userStories: string[];
	workStart: number;
	workEnd: number;
};

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';

export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export type Task = {
	id: string;
	title: string;
	description: string;
	projectId: string;
	assigneeId: string | null;
	status: TaskStatus;
	priority: Priority;
	estimate: number | null;
	sortOrder: number;
	due: string;
	tags: string[];
	updatedAt: string;
};

export type AuditEntry = {
	id: string;
	entityType: string;
	entityId: string;
	action: string;
	summary: string;
	details: Record<string, { from: unknown; to: unknown }>;
	time: string;
};

export type Settings = {
	theme: 'light' | 'dark' | 'system';
	autoEscalate: boolean;
	notifAssignments: boolean;
	notifDigest: boolean;
	notifMentions: boolean;
	notifProduct: boolean;
	workspaceName: string;
	timezone: string;
	aiApiKey: string;
	aiModel: string;
	boardStatuses: TaskStatus[];
};

export type AiDraftTask = {
	title: string;
	description: string;
	priority: Priority;
	tags: string[];
	assignee?: string;
	estimateHours: number | null;
};

export type AiDraft = {
	spec: string;
	userStories: string[];
	tasks: AiDraftTask[];
};

export type SavedAiDraft = {
	draft: AiDraft | null;
	desires: string;
	due: string;
	specialties: string[];
	included: Record<string, boolean>;
	specialty: Record<string, string>;
};

export type EntityType = 'project' | 'task' | 'member' | 'settings' | 'activity';

export type Activity = {
	id: string;
	memberId: string | null;
	action: string;
	target: string;
	time: string;
};

export const taskStatuses: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

export const priorities: Priority[] = ['urgent', 'high', 'medium', 'low'];

export const projectStatuses: ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed'];
