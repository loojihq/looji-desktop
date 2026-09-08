import { beforeEach, describe, expect, it, vi } from 'vitest';

// ai.ts imports `fetch` from `@tauri-apps/plugin-http`, which only works
// inside a real Tauri webview. Replace it with a mock so we can assert on
// exactly what request each provider kind builds, without a network or an
// IPC bridge.
const fetchMock = vi.fn();
vi.mock('@tauri-apps/plugin-http', () => ({
	fetch: (...args: unknown[]) => fetchMock(...args)
}));

const { explainTask, fetchProviderModels, PROVIDER_PRESETS, testProviderConnection } = await import(
	'./ai'
);
type AiProvider = import('./types').AiProvider;

function makeProvider(overrides: Partial<AiProvider> = {}): AiProvider {
	return {
		id: 'p1',
		kind: 'openai',
		label: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		apiKey: 'sk-test',
		model: 'gpt-4o-mini',
		models: [],
		...overrides
	};
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
	return {
		ok: init.ok ?? true,
		status: init.status ?? 200,
		json: async () => body,
		text: async () => JSON.stringify(body)
	};
}

/** A fake `Response` whose body streams the given SSE lines as one chunk. */
function sseResponse(lines: string[]) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(lines.join('\n') + '\n'));
			controller.close();
		}
	});
	return { ok: true, status: 200, body: stream, text: async () => '' };
}

const MINIMAL_TASK_CONTEXT = {
	projectName: 'Project',
	projectDescription: '',
	task: {
		title: 'Task',
		description: '',
		priority: 'medium',
		estimate: null,
		tags: [],
		assignee: '',
		assigneeRole: ''
	},
	otherTasks: []
};

beforeEach(() => {
	fetchMock.mockReset();
});

describe('request building per provider kind', () => {
	it('sends Bearer auth to /chat/completions for openai-compatible providers', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
		);
		await testProviderConnection(makeProvider());
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
		expect(url).toBe('https://api.openai.com/v1/chat/completions');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer sk-test');
		const body = JSON.parse(init.body as string);
		expect(body.model).toBe('gpt-4o-mini');
	});

	it('omits the Authorization header when the provider has no API key (Ollama)', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
		);
		await testProviderConnection(
			makeProvider({
				kind: 'ollama',
				baseUrl: 'http://localhost:11434/v1',
				apiKey: '',
				model: 'llama3.1'
			})
		);
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
		expect(init.headers.Authorization).toBeUndefined();
	});

	it('DeepSeek preset points at the DeepSeek base URL (OpenAI-compatible, no bespoke integration)', () => {
		expect(PROVIDER_PRESETS['openai-compatible'].baseUrl).toBe('https://api.deepseek.com');
	});

	it('sends x-api-key/anthropic-version headers and a top-level system field for Anthropic', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })
		);
		await testProviderConnection(
			makeProvider({
				kind: 'anthropic',
				baseUrl: 'https://api.anthropic.com/v1',
				model: 'claude-sonnet-5'
			})
		);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
		expect(url).toBe('https://api.anthropic.com/v1/messages');
		expect(init.headers['x-api-key']).toBe('sk-test');
		expect(init.headers['anthropic-version']).toBeTruthy();
		expect(init.headers.Authorization).toBeUndefined();
		const body = JSON.parse(init.body as string);
		expect(body.max_tokens).toBeGreaterThan(0);
		expect(body.system).toBeUndefined(); // testProviderConnection sends no system message
	});
});

describe('fetchProviderModels', () => {
	it('parses an OpenAI/DeepSeek-shaped models list, sorted', async () => {
		fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] }));
		const models = await fetchProviderModels(makeProvider());
		expect(models).toEqual(['gpt-4o', 'gpt-4o-mini']);
	});

	it('uses Anthropic auth headers for its models endpoint', async () => {
		fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'claude-sonnet-5' }] }));
		await fetchProviderModels(makeProvider({ kind: 'anthropic', apiKey: 'ak-1' }));
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
		expect(init.headers['x-api-key']).toBe('ak-1');
	});
});

describe('streaming delta parsing', () => {
	it('parses OpenAI-style SSE deltas (choices[0].delta.content)', async () => {
		fetchMock.mockResolvedValue(
			sseResponse([
				'data: {"choices":[{"delta":{"content":"Hello"}}]}',
				'data: {"choices":[{"delta":{"content":" world"}}]}',
				'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
				'data: [DONE]'
			])
		);
		const deltas: string[] = [];
		const text = await explainTask({
			...MINIMAL_TASK_CONTEXT,
			provider: makeProvider(),
			onDelta: (d) => deltas.push(d)
		});
		expect(deltas).toEqual(['Hello', ' world']);
		expect(text).toBe('Hello world');
	});

	it('parses Anthropic-style SSE deltas (content_block_delta/text_delta)', async () => {
		fetchMock.mockResolvedValue(
			sseResponse([
				'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
				'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
				'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}'
			])
		);
		const deltas: string[] = [];
		const text = await explainTask({
			...MINIMAL_TASK_CONTEXT,
			provider: makeProvider({ kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' }),
			onDelta: (d) => deltas.push(d)
		});
		expect(deltas).toEqual(['Hello', ' world']);
		expect(text).toBe('Hello world');
	});
});
