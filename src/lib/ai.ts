import { fetch } from '@tauri-apps/plugin-http';
import { runClaudeCodeTurn } from './claudeCode';
import type { AiDraft, AiDraftTask, AiProvider, AiProviderKind, Priority } from './types';

const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];
const ANTHROPIC_VERSION = '2023-06-01';
// Anthropic requires an explicit cap; this is comfortably within every
// current Claude model's default output limit. Draft generation already
// tolerates a cut-off response via its continuation-call loop below.
const ANTHROPIC_MAX_TOKENS = 8192;

/**
 * Sensible starting point when adding a new provider of a given kind.
 * Deliberately has no default `model` - model lineups change over time, and
 * a hardcoded guess would go stale. The actual model list is always fetched
 * live from the provider once enough of the form is filled in (except
 * 'claude-code', which has no base URL/key at all - see claudeCode.ts).
 */
export const PROVIDER_PRESETS: Record<
	AiProviderKind,
	{ label: string; baseUrl: string; needsKey: boolean }
> = {
	openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true },
	anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', needsKey: true },
	ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', needsKey: false },
	'openai-compatible': {
		label: 'Custom (OpenAI-compatible)',
		baseUrl: 'https://api.deepseek.com',
		needsKey: true
	},
	'claude-code': { label: 'Claude Code (local CLI)', baseUrl: '', needsKey: false }
};

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type ChatResult = { content: string; finishReason: string };

/** Live progress reported while the AI plan is being generated. */
export type AiDraftStatus = {
	stage: 'analyzing' | 'spec' | 'stories' | 'tasks' | 'continuing' | 'done';
	message: string;
	tasks?: number;
};

function apiError(providerLabel: string, status: number, detail: string): Error {
	return new Error(`${providerLabel} API error (${status}): ${detail.slice(0, 400)}`);
}

async function readErrorDetail(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return '';
	}
}

// ---------------------------------------------------------------------------
// OpenAI-compatible family: openai, ollama, openai-compatible (incl. DeepSeek).
// All three speak the same /chat/completions request/response shape.
// ---------------------------------------------------------------------------

function openAiHeaders(provider: AiProvider): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
	return headers;
}

async function chatOpenAI(
	provider: AiProvider,
	messages: ChatMessage[],
	json: boolean
): Promise<ChatResult> {
	const url = `${provider.baseUrl}/chat/completions`;
	const makeRequest = (useJsonMode: boolean) =>
		fetch(url, {
			method: 'POST',
			headers: openAiHeaders(provider),
			body: JSON.stringify({
				model: provider.model,
				messages,
				temperature: 0.7,
				...(useJsonMode ? { response_format: { type: 'json_object' } } : {})
			})
		});

	let lastFinishReason = 'unknown';
	for (let attempt = 0; attempt < 2; attempt++) {
		let response = await makeRequest(json);
		// Some models (e.g. deepseek-reasoner) reject response_format; retry without it.
		if (!response.ok && json && response.status === 400) {
			response = await makeRequest(false);
		}
		if (!response.ok) {
			throw apiError(provider.label, response.status, await readErrorDetail(response));
		}
		const data = await response.json();
		const choice = data?.choices?.[0];
		const content: unknown = choice?.message?.content;
		const finishReason: unknown = choice?.finish_reason;
		lastFinishReason = typeof finishReason === 'string' ? finishReason : 'unknown';
		if (typeof content === 'string' && content.trim()) {
			return { content, finishReason: lastFinishReason };
		}
	}
	throw new Error(
		`${provider.label} returned an empty response (finish_reason: ${lastFinishReason}). Try again.`
	);
}

async function streamChatOpenAI(
	provider: AiProvider,
	messages: ChatMessage[],
	onDelta: (delta: string) => void,
	signal?: AbortSignal
): Promise<ChatResult> {
	const url = `${provider.baseUrl}/chat/completions`;
	const response = await fetch(url, {
		method: 'POST',
		headers: openAiHeaders(provider),
		signal,
		body: JSON.stringify({
			model: provider.model,
			messages,
			temperature: 0.7,
			stream: true
		})
	});
	if (!response.ok) {
		throw apiError(provider.label, response.status, await readErrorDetail(response));
	}
	if (!response.body) {
		throw new Error(`${provider.label} returned no stream body.`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let full = '';
	let finishReason = 'unknown';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) continue;
			const payload = trimmed.slice(5).trim();
			if (payload === '[DONE]') continue;
			try {
				const parsed = JSON.parse(payload) as {
					choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[];
				};
				const choice = parsed.choices?.[0];
				const delta = choice?.delta?.content;
				const reason = choice?.finish_reason;
				if (typeof reason === 'string' && reason) finishReason = reason;
				if (typeof delta === 'string' && delta) {
					full += delta;
					onDelta(delta);
				}
			} catch {
				// skip malformed keep-alive/comment lines
			}
		}
	}
	if (!full.trim()) {
		throw new Error(
			`${provider.label} returned an empty response (finish_reason: ${finishReason}). Try again.`
		);
	}
	return { content: full, finishReason };
}

// ---------------------------------------------------------------------------
// Anthropic: different endpoint, auth header, message shape (system is a
// top-level field, not a message) and streaming event format.
// ---------------------------------------------------------------------------

function anthropicHeaders(provider: AiProvider): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		'x-api-key': provider.apiKey,
		'anthropic-version': ANTHROPIC_VERSION,
		// The Tauri webview looks like a browser origin to Anthropic's CORS
		// layer, which otherwise rejects direct browser-originated requests
		// with a 401 (a deliberate guard against shipping API keys in
		// client-side web apps). This app already stores the key locally on
		// the user's own device rather than in a public web page, so that
		// guard doesn't apply here - this header is the documented opt-out.
		'anthropic-dangerous-direct-browser-access': 'true'
	};
}

/** Anthropic takes the system prompt as a top-level field, not a message. */
function splitAnthropicMessages(messages: ChatMessage[]): {
	system: string;
	rest: { role: 'user' | 'assistant'; content: string }[];
} {
	const systemParts: string[] = [];
	const rest: { role: 'user' | 'assistant'; content: string }[] = [];
	for (const m of messages) {
		if (m.role === 'system') systemParts.push(m.content);
		else rest.push({ role: m.role, content: m.content });
	}
	return { system: systemParts.join('\n\n'), rest };
}

async function chatAnthropic(provider: AiProvider, messages: ChatMessage[]): Promise<ChatResult> {
	const { system, rest } = splitAnthropicMessages(messages);
	const response = await fetch(`${provider.baseUrl}/messages`, {
		method: 'POST',
		headers: anthropicHeaders(provider),
		body: JSON.stringify({
			model: provider.model,
			max_tokens: ANTHROPIC_MAX_TOKENS,
			...(system ? { system } : {}),
			messages: rest
		})
	});
	if (!response.ok) {
		throw apiError(provider.label, response.status, await readErrorDetail(response));
	}
	const data = await response.json();
	const blocks: unknown = data?.content;
	const textBlock = Array.isArray(blocks)
		? blocks.find((b): b is { type: string; text?: unknown } => b?.type === 'text')
		: null;
	const content: unknown = textBlock?.text;
	const finishReason = typeof data?.stop_reason === 'string' ? data.stop_reason : 'unknown';
	if (typeof content === 'string' && content.trim()) {
		return { content, finishReason };
	}
	throw new Error(
		`${provider.label} returned an empty response (finish_reason: ${finishReason}). Try again.`
	);
}

async function streamChatAnthropic(
	provider: AiProvider,
	messages: ChatMessage[],
	onDelta: (delta: string) => void,
	signal?: AbortSignal
): Promise<ChatResult> {
	const { system, rest } = splitAnthropicMessages(messages);
	const response = await fetch(`${provider.baseUrl}/messages`, {
		method: 'POST',
		headers: anthropicHeaders(provider),
		signal,
		body: JSON.stringify({
			model: provider.model,
			max_tokens: ANTHROPIC_MAX_TOKENS,
			...(system ? { system } : {}),
			messages: rest,
			stream: true
		})
	});
	if (!response.ok) {
		throw apiError(provider.label, response.status, await readErrorDetail(response));
	}
	if (!response.body) {
		throw new Error(`${provider.label} returned no stream body.`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let full = '';
	let finishReason = 'unknown';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) continue;
			const payload = trimmed.slice(5).trim();
			if (!payload) continue;
			try {
				const parsed = JSON.parse(payload) as {
					type?: string;
					delta?: { type?: string; text?: unknown; stop_reason?: unknown };
				};
				if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
					const text = parsed.delta.text;
					if (typeof text === 'string' && text) {
						full += text;
						onDelta(text);
					}
				} else if (parsed.type === 'message_delta' && typeof parsed.delta?.stop_reason === 'string') {
					finishReason = parsed.delta.stop_reason;
				}
			} catch {
				// skip malformed keep-alive/comment lines
			}
		}
	}
	if (!full.trim()) {
		throw new Error(
			`${provider.label} returned an empty response (finish_reason: ${finishReason}). Try again.`
		);
	}
	return { content: full, finishReason };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function chat(provider: AiProvider, messages: ChatMessage[], json: boolean): Promise<ChatResult> {
	if (provider.kind === 'claude-code') {
		// No distinct non-streaming path - Claude Code always streams over
		// ACP; just discard the deltas and return the assembled text.
		const content = await runClaudeCodeTurn(messages, () => {});
		return { content, finishReason: 'stop' };
	}
	if (provider.kind === 'anthropic') return chatAnthropic(provider, messages);
	return chatOpenAI(provider, messages, json);
}

async function streamChat(
	provider: AiProvider,
	messages: ChatMessage[],
	onDelta: (delta: string) => void,
	signal?: AbortSignal
): Promise<ChatResult> {
	if (provider.kind === 'claude-code') {
		const content = await runClaudeCodeTurn(messages, onDelta, signal);
		return { content, finishReason: 'stop' };
	}
	if (provider.kind === 'anthropic') return streamChatAnthropic(provider, messages, onDelta, signal);
	return streamChatOpenAI(provider, messages, onDelta, signal);
}

/** Parses a model reply, tolerating markdown code fences around the JSON. */
function extractJson(text: string): unknown {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	return JSON.parse(fenced ? fenced[1] : trimmed);
}

/**
 * Asks the model which specialties/roles are relevant for a project,
 * based on its name and description. Returns concise role labels.
 */
export async function suggestSpecialties(
	projectName: string,
	description: string,
	provider: AiProvider
): Promise<string[]> {
	const { content } = await chat(
		provider,
		[
			{
				role: 'system',
				content:
					'You are a project planning assistant. You reply only with valid JSON and nothing else.'
			},
			{
				role: 'user',
				content: `Based on the following project, suggest 3-6 concise specialty/role names (e.g. "Frontend", "Backend", "Design", "QA") that team members would need to work on it.

Project: ${projectName}
Description: ${description || '(none)'}

Respond with JSON only: {"specialties": ["Frontend", "Backend"]}`
			}
		],
		true
	);
	const parsed = extractJson(content) as { specialties?: unknown };
	const list = Array.isArray(parsed?.specialties) ? parsed.specialties : [];
	return list
		.filter((s): s is string => typeof s === 'string')
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, 8);
}

/** Parses an estimate that the model may return as a number or a string like "4", "2.5h", "1-2 days". */
function parseEstimate(value: unknown): number | null {
	if (typeof value === 'number' && isFinite(value) && value > 0) {
		return Math.round(value * 10) / 10;
	}
	if (typeof value === 'string') {
		const match = value.match(/\d+(?:\.\d+)?/);
		if (match) {
			const parsed = parseFloat(match[0]);
			if (isFinite(parsed) && parsed > 0) return Math.round(parsed * 10) / 10;
		}
	}
	return null;
}

// Fallback hours by priority when the model omits an estimate entirely.
const DEFAULT_ESTIMATE: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

/**
 * Generates a draft (spec, user stories and tasks) for a project from the
 * user's free-form desires, due date and selected team members/specialties.
 */
export async function generateAiDraft(input: {
	projectName: string;
	projectDescription: string;
	desires: string;
	dueDate: string;
	members: { name: string; specialty: string }[];
	existingTitles: string[];
	provider: AiProvider;
	currentDraft?: AiDraft;
	repo?: RepoContext;
	onStatus?: (status: AiDraftStatus) => void;
	signal?: AbortSignal;
}): Promise<AiDraft> {
	const memberLines =
		input.members.length > 0
			? input.members
					.map((m) => `- ${m.name} (specialty: ${m.specialty.trim() || 'generalist'})`)
					.join('\n')
			: '- none selected';
	const existing =
		input.existingTitles.length > 0 ? input.existingTitles.map((t) => `- ${t}`).join('\n') : '- none';
	const revising = input.currentDraft !== undefined;

	const schema = `{
  "spec": "A concise but complete project specification covering scope, approach and acceptance criteria.",
  "userStories": ["As a <role>, I want <goal>, so that <benefit>."],
  "tasks": [
    {
      "title": "Short imperative task title",
      "description": "2-4 detailed sentences covering what to do, how to verify it, and any edge cases",
      "priority": "urgent | high | medium | low",
      "tags": ["one or two tags"],
      "estimate_hours": "plain number of hours, e.g. 1, 2.5 or 8 (no units, no quotes)",
      "assignee": "exact member name from the provided list, or null"
    }
  ]
}`;

	const rules = `- Produce as many tasks as the project genuinely requires — there is no fixed cap. A small scope might need 8-15 tasks; a large or long project can need 50, 100 or more. Keep adding tasks until the described scope is fully covered; do not pad with filler.
- Prefer focused, actionable tasks over big vague ones.
- Size the total honestly: the combined estimate_hours across all tasks should match the project's scope, team size and target date — not more, not less.
- Keep each task's description tight (2-3 sentences: what to do, how to verify, edge cases) so the backlog stays efficient.
- Every task MUST include estimate_hours as a plain JSON number (e.g. 3, 2.5, 8) — never a string like "3h" or "1-2 days".
	- Only assign tasks to member names from the provided team list; otherwise null.
	- Use only the allowed priority values.
	- Do not duplicate any existing task titles.
	- When local repository context is provided, ground the plan in it: prefer tasks that build on the existing files and structure shown, and do not propose re-implementing what already exists in the repo.`;

	const systemPrompt = revising
		? `You are a senior product manager and technical lead. The user has manually edited a previously generated plan. Revise it: preserve every manual edit, keep the plan internally consistent, fill gaps, resolve contradictions and improve the backlog where it makes sense. Return the COMPLETE revised plan. You reply only with valid JSON and nothing else.

JSON schema:
${schema}

Rules:
- Keep the user's manual changes exactly as given.
${rules}`
		: `You are a senior product manager and technical lead. You plan projects into a detailed specification, user stories, and a granular task backlog. You reply only with valid JSON and nothing else.

JSON schema:
${schema}

Rules:
${rules}`;

	/** Normalizes a parsed tasks array into draft tasks. */
	function parseDraftTasks(parsed: { tasks?: unknown }): AiDraftTask[] {
		if (!Array.isArray(parsed.tasks)) return [];
		return parsed.tasks
			.filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
			.filter((t) => typeof t.title === 'string' && String(t.title).trim())
			.map((t) => {
				const priority = PRIORITIES.includes(t.priority as Priority)
					? (t.priority as Priority)
					: 'medium';
				const estimate = parseEstimate(
					t.estimate_hours ?? t.estimateHours ?? t.estimate ?? t.hours
				);
				return {
					title: String(t.title).trim(),
					description:
						typeof t.description === 'string' ? t.description.trim() : '',
					priority,
					tags: Array.isArray(t.tags)
						? t.tags.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
						: [],
					assignee: typeof t.assignee === 'string' ? t.assignee : undefined,
					estimateHours: estimate ?? DEFAULT_ESTIMATE[priority]
				};
			});
	}

	const baseUserContent = `Project: ${input.projectName}
Project description: ${input.projectDescription || '(none)'}

Desires / requirements:
${input.desires}

Target due date: ${input.dueDate}

Team members:
${memberLines}

Existing task titles (do not duplicate):
${existing}${input.repo ? repoPromptText(input.repo) : ''}`;

	const continuationPrompt = (usedTitles: string[]) =>
		`You were cut off while generating the plan. Continue from where you stopped and produce MORE tasks following the same schema (title, description, priority, tags, estimate_hours, assignee).

Respond with JSON only: {"tasks": [ ... ]}

Do NOT repeat any of these existing task titles:
${
			usedTitles.length > 0
				? usedTitles.map((t) => `- ${t}`).join('\n')
				: '- none'
		}`;

	const MAX_CALLS = 4;
	const spec: string[] = [];
	const userStories: string[] = [];
	const tasks: AiDraftTask[] = [];
	const seenTitles = new Set(
		input.existingTitles.map((t) => t.trim().toLowerCase()).filter(Boolean)
	);

	let lastError: unknown = null;
	for (let call = 0; call < MAX_CALLS; call++) {
		const isContinuation = call > 0;
		input.onStatus?.({
			stage: isContinuation ? 'continuing' : 'analyzing',
			message: isContinuation
				? `The plan was cut off — extending it (round ${call + 1} of ${MAX_CALLS})…`
				: revising
					? 'Analyzing your edits and refining the plan…'
					: 'Analyzing your requirements and the repository…',
			tasks: tasks.length
		});
		const userContent = isContinuation
			? `${baseUserContent}\n\n${continuationPrompt([...seenTitles])}`
			: revising
				? `${baseUserContent}\n\nCurrent draft with the user's manual edits (preserve them and improve):\n${JSON.stringify(
						input.currentDraft
					)}\n\nReturn the complete revised JSON following the schema.`
				: `${baseUserContent}\n\nRespond with JSON only following the schema.`;

		let content = '';
		let finishReason = '';
		try {
			// Stream the response so the UI can show live progress (e.g. the
			// task count ticking up as each task object streams in).
			let streamBuffer = '';
			let lastReported = -1;
			const streamResult = await streamChat(
				input.provider,
				[
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userContent }
				],
				(delta) => {
					streamBuffer += delta;
					const count = (streamBuffer.match(/"title"\s*:/g) || []).length;
					if (count !== lastReported) {
						lastReported = count;
						input.onStatus?.({
							stage: 'tasks',
							message:
								count > 0
									? `Writing the task backlog — ${count} task${count === 1 ? '' : 's'} so far…`
									: 'Writing the task backlog…',
							tasks: tasks.length + count
						});
					}
				},
				input.signal
			);
			content = streamResult.content;
			finishReason = streamResult.finishReason;
		} catch (err) {
			// A deliberate cancel must stop the whole draft, not retry into more
			// (immediately-aborting) calls until MAX_CALLS is exhausted.
			if (input.signal?.aborted) throw err;
			lastError = err;
			continue; // a single failed call shouldn't abort the whole draft
		}

		let parsed: { spec?: unknown; userStories?: unknown; tasks?: unknown } | null = null;
		try {
			parsed = extractJson(content) as {
				spec?: unknown;
				userStories?: unknown;
				tasks?: unknown;
			};
		} catch {
			parsed = null;
		}

		if (parsed) {
			if (call === 0) {
				if (typeof parsed.spec === 'string' && parsed.spec.trim()) {
					spec.push(parsed.spec.trim());
					input.onStatus?.({ stage: 'spec', message: 'Specification written.', tasks: tasks.length });
				}
				if (Array.isArray(parsed.userStories)) {
					userStories.push(
						...parsed.userStories
							.filter((s): s is string => typeof s === 'string')
							.map((s) => s.trim())
							.filter(Boolean)
					);
					if (userStories.length > 0) {
						input.onStatus?.({
							stage: 'stories',
							message: `${userStories.length} user stor${userStories.length === 1 ? 'y' : 'ies'} written.`,
							tasks: tasks.length
						});
					}
				}
			}
			for (const task of parseDraftTasks(parsed)) {
				const key = task.title.toLowerCase();
				if (seenTitles.has(key)) continue;
				seenTitles.add(key);
				tasks.push(task);
			}
		}

		// Stop when the model finished naturally; keep going when it was cut off.
		if (parsed && finishReason !== 'length') break;
	}

	if (tasks.length === 0 && spec.length === 0 && userStories.length === 0) {
		if (lastError) throw lastError;
		throw new Error(
			'The AI response could not be parsed (it may have been cut off). Try again, or describe a smaller slice of the project and refine iteratively.'
		);
	}

	input.onStatus?.({
		stage: 'done',
		message: `Plan complete — ${tasks.length} task${tasks.length === 1 ? '' : 's'}, ${userStories.length} user stor${userStories.length === 1 ? 'y' : 'ies'}.`,
		tasks: tasks.length
	});

	return { spec: spec[0] ?? '', userStories, tasks };
}

/** Verifies the provider's credentials/endpoint by making a minimal request. Throws on failure. */
export async function testProviderConnection(provider: AiProvider): Promise<void> {
	await chat(provider, [{ role: 'user', content: 'Reply with exactly: ok' }], false);
}

/** Context describing a task and the project it lives in. */
export type RepoContext = {
	root: string;
	tree: string;
	map: string;
	contents: { path: string; content: string }[];
};

export type TaskContext = {
	projectName: string;
	projectDescription: string;
	task: {
		title: string;
		description: string;
		priority: string;
		estimate: number | null;
		tags: string[];
		assignee: string;
		assigneeRole: string;
	};
	otherTasks: { title: string; status: string; assignee: string }[];
	repo?: RepoContext;
};

/** A single exchange in a task conversation (user question / assistant answer). */
export type TaskChatMessage = { role: 'user' | 'assistant'; content: string };

const TASK_SYSTEM_PROMPT =
	'You are a senior software engineer and mentor. You explain tasks clearly and practically in plain text, using short paragraphs and bullet points. Be specific and actionable.';

// Follow-up chat uses a different system prompt: the model must answer the
// exact question asked and not re-explain the task or restate the context.
const TASK_CHAT_SYSTEM_PROMPT =
	'You are a senior software engineer and mentor having a focused conversation about one task in a project. The context above and the earlier exchange describe the project, the task, related tasks, and what has already been discussed. Answer the user\'s latest question directly and specifically. Do not re-explain the task, restate the project, repeat the context, or recap earlier answers unless the question explicitly asks for it. Be practical, specific, and concise.';

/** Renders the repository context block (tree + symbol map + snippets) into a prompt. */
function repoPromptText(repo: RepoContext): string {
	let block = `\n\nLocal repository at: ${repo.root}\nFile tree:\n${repo.tree}\n\nSymbol map (file: functions/classes/types):\n${repo.map}`;
	if (repo.contents.length > 0) {
		block += `\n\nRelevant file snippets (paths are absolute on the machine):\n${repo.contents
			.map((f) => `### ${f.path}\n${f.content}`)
			.join('\n\n')}`;
	}
	return block;
}

/** Builds the context message describing the project, the task and its neighbours. */
function buildTaskContext(context: TaskContext): string {
	const taskLines = [
		`- Title: ${context.task.title}`,
		`- Description: ${context.task.description || '(none)'}`,
		`- Priority: ${context.task.priority}`,
		`- Estimate: ${context.task.estimate ? `${context.task.estimate}h` : 'not set'}`,
		`- Tags: ${context.task.tags.join(', ') || 'none'}`,
		`- Assigned to: ${context.task.assignee || 'Unassigned'}${
			context.task.assigneeRole ? ` (${context.task.assigneeRole})` : ''
		}`
	].join('\n');
	const others =
		context.otherTasks.length > 0
			? context.otherTasks
					.map((t) => `- ${t.title} — ${t.status}${t.assignee ? ` — ${t.assignee}` : ''}`)
					.join('\n')
			: '- none';
	return `Project: ${context.projectName}
Project description: ${context.projectDescription || '(none)'}

The task to explain:
${taskLines}

Other tasks in this project (title — status — assignee):
${others}${context.repo ? repoPromptText(context.repo) : ''}`;
}

/**
 * Explains a task for the person doing it: what it needs, how to implement it,
 * how it relates to the rest of the project, and who is involved.
 */
export async function explainTask(input: TaskContext & {
	provider: AiProvider;
	onDelta?: (delta: string) => void;
	signal?: AbortSignal;
}): Promise<string> {
	const result = await streamChat(
		input.provider,
		[
			{ role: 'system', content: TASK_SYSTEM_PROMPT },
			{
				role: 'user',
				content: `${buildTaskContext(input)}

Explain the task for the person doing it:
1. What this task actually requires, in plain language.
2. How to implement it — a step-by-step approach with specific techniques, tools or patterns, and how to verify it works.
3. Context & dependencies: which other tasks it depends on, which tasks depend on it, and who is working on them.
4. Any risks, edge cases, or gotchas to watch for.`
			}
		],
		input.onDelta ?? (() => {}),
		input.signal
	);
	return result.content.trim();
}

/**
 * Answers a follow-up question about a task, keeping the full context:
 * the project, the task, every related task, and the previous exchanges.
 */
export async function taskChatFollowUp(input: {
	context: TaskContext;
	history: TaskChatMessage[];
	question: string;
	provider: AiProvider;
	onDelta?: (delta: string) => void;
	signal?: AbortSignal;
}): Promise<string> {
	const messages: ChatMessage[] = [
		{ role: 'system', content: TASK_CHAT_SYSTEM_PROMPT },
		{ role: 'user', content: buildTaskContext(input.context) },
		...input.history.map((m) => ({ role: m.role, content: m.content })),
		{
			role: 'user',
			content: `${input.question}\n\nAnswer only this question — do not re-explain the task or project.`
		}
	];
	const result = await streamChat(
		input.provider,
		messages,
		input.onDelta ?? (() => {}),
		input.signal
	);
	return result.content.trim();
}

const REPO_CHECK_SYSTEM_PROMPT =
	'You are a senior software engineer performing an implementation review against a local repository. You are given a task and the repository\'s file tree plus the contents of files most likely related to the task. Inspect the evidence carefully and report what is actually implemented in the code — do not assume anything is done just because the task says so. Reply in markdown with short sections.';

/**
 * Checks a task against the connected local repository: whether it looks
 * implemented, where, what is missing, and review notes for the reviewer.
 */
export async function checkTaskAgainstRepo(input: {
	context: TaskContext & { repo: RepoContext };
	provider: AiProvider;
	onDelta?: (delta: string) => void;
	signal?: AbortSignal;
}): Promise<string> {
	const result = await streamChat(
		input.provider,
		[
			{ role: 'system', content: REPO_CHECK_SYSTEM_PROMPT },
			{
				role: 'user',
				content: `${buildTaskContext(input.context)}

Review this task against the local code and report:
1. Implementation status — is it implemented, partially implemented, or not started? Be specific and honest.
2. Evidence — which files/functions/lines actually implement it (cite file paths).
3. What is missing or incomplete, if anything.
4. Review notes — risks, edge cases, test coverage, and a short recommendation for the reviewer (approve, needs work, or needs discussion).

Base your assessment ONLY on the file tree, symbol map and snippets provided above. Do not assume implementation exists outside that evidence.`
			}
		],
		input.onDelta ?? (() => {}),
		input.signal
	);
	return result.content.trim();
}

/** Parses an OpenAI/Anthropic-shaped models list response ({ data: [{ id }] }). */
function parseModelsList(data: unknown): string[] {
	const list: unknown = (data as { data?: unknown } | null)?.data;
	if (!Array.isArray(list)) return [];
	return list
		.filter((m): m is { id?: unknown } => typeof m === 'object' && m !== null)
		.map((m) => (typeof m.id === 'string' ? m.id : ''))
		.filter(Boolean)
		.sort();
}

/** Lists the models available to the given provider. */
export async function fetchProviderModels(provider: AiProvider): Promise<string[]> {
	// No live model listing over ACP (see claudeCode.ts) - Claude Code always
	// uses its own default model for now.
	if (provider.kind === 'claude-code') return [];
	const isAnthropic = provider.kind === 'anthropic';
	const response = await fetch(`${provider.baseUrl}/models`, {
		method: 'GET',
		headers: isAnthropic ? anthropicHeaders(provider) : openAiHeaders(provider)
	});
	if (!response.ok) {
		throw apiError(provider.label, response.status, await readErrorDetail(response));
	}
	return parseModelsList(await response.json());
}
