import { describe, expect, it } from 'vitest';
import {
	buildInitializeRequest,
	buildSessionNewRequest,
	buildSessionPromptRequest,
	extractUpdateText,
	flattenMessagesToPromptText,
	parseJsonRpcLines,
	splitNdjson
} from './claudeCode';

describe('splitNdjson', () => {
	it('splits complete lines and carries a partial trailing line forward', () => {
		const first = splitNdjson('', '{"a":1}\n{"b":2}\n{"c"');
		expect(first.lines).toEqual(['{"a":1}', '{"b":2}']);
		expect(first.remainder).toBe('{"c"');

		// A later chunk completes the carried-over partial line.
		const second = splitNdjson(first.remainder, ':3}\n');
		expect(second.lines).toEqual(['{"c":3}']);
		expect(second.remainder).toBe('');
	});

	it('handles a message that arrives split across many small chunks', () => {
		let buffer = '';
		const chunks = ['{"jso', 'nrpc":"2.0"', ',"id":1,"result"', ':{}}\n'];
		const collected: string[] = [];
		for (const chunk of chunks) {
			const { lines, remainder } = splitNdjson(buffer, chunk);
			buffer = remainder;
			collected.push(...lines);
		}
		expect(collected).toEqual(['{"jsonrpc":"2.0","id":1,"result":{}}']);
		expect(buffer).toBe('');
	});

	it('ignores blank lines', () => {
		const { lines } = splitNdjson('', '\n{"a":1}\n\n');
		expect(lines).toEqual(['{"a":1}']);
	});
});

describe('parseJsonRpcLines', () => {
	it('parses valid JSON lines and skips malformed ones', () => {
		const messages = parseJsonRpcLines([
			'{"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
			'not json at all',
			'{"jsonrpc":"2.0","method":"session/update","params":{}}'
		]);
		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
		expect(messages[1]).toEqual({ jsonrpc: '2.0', method: 'session/update', params: {} });
	});
});

describe('request builders', () => {
	it('buildInitializeRequest declines filesystem capabilities', () => {
		const req = buildInitializeRequest(1);
		expect(req).toEqual({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: 1,
				clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }
			}
		});
	});

	it('buildSessionNewRequest carries the given cwd and no MCP servers', () => {
		const req = buildSessionNewRequest(2, '.');
		expect(req).toEqual({
			jsonrpc: '2.0',
			id: 2,
			method: 'session/new',
			params: { cwd: '.', mcpServers: [] }
		});
	});

	it('buildSessionPromptRequest wraps the text as a single content block', () => {
		const req = buildSessionPromptRequest(3, 'sess-1', 'hello');
		expect(req).toEqual({
			jsonrpc: '2.0',
			id: 3,
			method: 'session/prompt',
			params: { sessionId: 'sess-1', prompt: [{ type: 'text', text: 'hello' }] }
		});
	});

	it('each request uses the id it was given, independent of call order', () => {
		expect(buildInitializeRequest(5).id).toBe(5);
		expect(buildSessionNewRequest(9, '.').id).toBe(9);
		expect(buildSessionPromptRequest(2, 's', 't').id).toBe(2);
	});
});

describe('flattenMessagesToPromptText', () => {
	it('keeps system content bare and prefixes user/assistant turns with their role', () => {
		const text = flattenMessagesToPromptText([
			{ role: 'system', content: 'You are a helpful assistant.' },
			{ role: 'user', content: 'What is 2+2?' },
			{ role: 'assistant', content: '4' },
			{ role: 'user', content: 'And 3+3?' }
		]);
		expect(text).toBe(
			'You are a helpful assistant.\n\nUser: What is 2+2?\n\nAssistant: 4\n\nUser: And 3+3?'
		);
	});

	it('handles a single message', () => {
		expect(flattenMessagesToPromptText([{ role: 'user', content: 'hi' }])).toBe('User: hi');
	});
});

describe('extractUpdateText', () => {
	it('extracts text from an agent_message_chunk update', () => {
		const message = {
			jsonrpc: '2.0' as const,
			method: 'session/update',
			params: {
				update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello' } }
			}
		};
		expect(extractUpdateText(message)).toBe('Hello');
	});

	it('returns null for a JSON-RPC response (has an id), not a notification', () => {
		const response = { jsonrpc: '2.0' as const, id: 1, result: {} };
		expect(extractUpdateText(response)).toBeNull();
	});

	it('returns null for a non-session/update notification', () => {
		const message = { jsonrpc: '2.0' as const, method: 'session/other', params: {} };
		expect(extractUpdateText(message)).toBeNull();
	});

	it('returns null for a session/update that is not an agent_message_chunk (e.g. a tool call)', () => {
		const message = {
			jsonrpc: '2.0' as const,
			method: 'session/update',
			params: { update: { sessionUpdate: 'tool_call', content: { type: 'text', text: 'ignored' } } }
		};
		expect(extractUpdateText(message)).toBeNull();
	});

	it('returns null when the content has no text field', () => {
		const message = {
			jsonrpc: '2.0' as const,
			method: 'session/update',
			params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'image' } } }
		};
		expect(extractUpdateText(message)).toBeNull();
	});
});
