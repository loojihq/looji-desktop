export type Member = {
	id: string;
	name: string;
	email: string;
	role: string;
	color: string;
	online: boolean;
};

export type Workspace = {
	id: string;
	name: string;
	icon: string;
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
	repoPath: string;
	workStart: number;
	workEnd: number;
	workDays: number[];
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
	originalDue: string;
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

/**
 * `openai` and `anthropic` talk to the named vendor's hosted API.
 * `ollama` talks to a local (or LAN) Ollama server via its OpenAI-compatible
 * endpoint. `openai-compatible` is a free-form escape hatch for anything
 * else that speaks the OpenAI chat-completions format - DeepSeek, Groq,
 * OpenRouter, LM Studio, etc. - via a user-supplied base URL.
 */
export type AiProviderKind = 'openai' | 'anthropic' | 'ollama' | 'openai-compatible';

export type AiProvider = {
	id: string;
	kind: AiProviderKind;
	/** User-facing name, e.g. "Work OpenAI", "Local Ollama". */
	label: string;
	baseUrl: string;
	/** '' for providers that don't require one (typically Ollama). */
	apiKey: string;
	model: string;
	/** Cached result of the last "fetch models" call, for the picker. */
	models: string[];
};

export type Settings = {
	theme: 'light' | 'dark' | 'system';
	autoEscalate: boolean;
	workspaceName: string;
	aiProviders: AiProvider[];
	activeAiProviderId: string;
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

export type EntityType = 'project' | 'task' | 'member' | 'settings' | 'workspace' | 'activity';

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
