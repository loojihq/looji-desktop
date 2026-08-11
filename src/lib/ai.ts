import { fetch } from '@tauri-apps/plugin-http';
import type { AiDraft, AiDraftTask, Priority } from './types';

const DEEPSEEK_BASE = 'https://api.deepseek.com';
const DEEPSEEK_URL = `${DEEPSEEK_BASE}/chat/completions`;
const DEFAULT_MODEL = 'deepseek-chat';
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type ChatResult = { content: string; finishReason: string };

async function chat(
	apiKey: string,
	model: string,
	messages: ChatMessage[],
	json: boolean
): Promise<ChatResult> {
	const makeRequest = (useJsonMode: boolean) =>
		fetch(DEEPSEEK_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: model || DEFAULT_MODEL,
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
			let detail = '';
			try {
				detail = await response.text();
			} catch {
				// ignore body read errors
			}
			throw new Error(`DeepSeek API error (${response.status}): ${detail.slice(0, 400)}`);
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
		`DeepSeek returned an empty response (finish_reason: ${lastFinishReason}). Try again.`
	);
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
	apiKey: string,
	model: string
): Promise<string[]> {
	const { content } = await chat(
		apiKey,
		model,
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
	apiKey: string;
	model: string;
	currentDraft?: AiDraft;
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
- Do not duplicate any existing task titles.`;

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
${existing}`;

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
			const result = await chat(
				input.apiKey,
				input.model,
				[
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userContent }
				],
				true
			);
			content = result.content;
			finishReason = result.finishReason;
		} catch (err) {
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
				}
				if (Array.isArray(parsed.userStories)) {
					userStories.push(
						...parsed.userStories
							.filter((s): s is string => typeof s === 'string')
							.map((s) => s.trim())
							.filter(Boolean)
					);
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

	return { spec: spec[0] ?? '', userStories, tasks };
}

/** Verifies the API key by making a minimal request. Throws on failure. */
export async function testDeepSeekConnection(apiKey: string, model: string): Promise<void> {
	await chat(
		apiKey,
		model,
		[{ role: 'user', content: 'Reply with exactly: ok' }],
		false
	);
}

/** Lists the models available to the given API key (OpenAI-compatible /models endpoint). */
export async function fetchDeepSeekModels(apiKey: string): Promise<string[]> {
	const response = await fetch(`${DEEPSEEK_BASE}/models`, {
		method: 'GET',
		headers: { Authorization: `Bearer ${apiKey}` }
	});
	if (!response.ok) {
		let detail = '';
		try {
			detail = await response.text();
		} catch {
			// ignore body read errors
		}
		throw new Error(`DeepSeek API error (${response.status}): ${detail.slice(0, 400)}`);
	}
	const data = await response.json();
	const list: unknown = data?.data;
	if (!Array.isArray(list)) return [];
	return list
		.filter((m): m is { id?: unknown } => typeof m === 'object' && m !== null)
		.map((m) => (typeof m.id === 'string' ? m.id : ''))
		.filter(Boolean)
		.sort();
}
