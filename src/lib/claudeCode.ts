import { Command, type Child, type TerminatedPayload } from '@tauri-apps/plugin-shell';

/**
 * Bridges to a local Claude Code CLI installation via the Agent Client
 * Protocol (ACP) - JSON-RPC 2.0 over stdio - so the app can use whatever
 * Claude Pro/Max subscription the user is already signed into with
 * `claude auth login`, instead of a separate pay-per-token API key.
 *
 * Requires, on the user's machine (checked by detectClaudeCode(), not
 * installed by this app): Node.js 20+, the Claude Code CLI
 * (`npm install -g @anthropic-ai/claude-code`), and a prior `claude auth
 * login`. The actual model calls and auth happen entirely inside the
 * spawned bridge process - this module only ever sees the streamed text it
 * writes back over stdout, never a credential.
 *
 * v1 scope: plain text prompt/response only. ACP's richer session updates
 * (tool calls, plans, file diffs, permission requests) aren't meaningful in
 * Looji's markdown chat UI and are ignored. There is no live model listing
 * over ACP, and no confirmed way to pass a --model override through the
 * bridge without guessing at undocumented protocol behavior, so this always
 * uses Claude Code's own default model.
 */

const BRIDGE_COMMAND_NAME = 'claude-code-acp-bridge';
const BRIDGE_ARGS = ['-y', '@agentclientprotocol/claude-agent-acp'];
const ACP_PROTOCOL_VERSION = 1;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type JsonRpcRequest = { jsonrpc: '2.0'; id: number; method: string; params?: unknown };
type JsonRpcResponse = {
	jsonrpc: '2.0';
	id: number;
	result?: unknown;
	error?: { code: number; message: string };
};
type JsonRpcNotification = { jsonrpc: '2.0'; method: string; params?: unknown };
type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification;

function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
	return 'id' in message && typeof message.id === 'number';
}

// ---------------------------------------------------------------------------
// Pure protocol helpers - no process/IO, independently testable.
// ---------------------------------------------------------------------------

/** Splits a stream of raw text chunks into complete NDJSON lines, carrying a
 *  partial trailing line forward across calls (same buffering pattern as the
 *  SSE line-splitting used for the HTTP providers in ai.ts). */
export function splitNdjson(buffer: string, chunk: string): { lines: string[]; remainder: string } {
	const combined = buffer + chunk;
	const parts = combined.split('\n');
	const remainder = parts.pop() ?? '';
	const lines = parts.map((l) => l.trim()).filter(Boolean);
	return { lines, remainder };
}

/** Parses NDJSON lines into JSON-RPC messages, silently skipping anything
 *  that isn't valid JSON (a stray log line on stdout, etc.). */
export function parseJsonRpcLines(lines: string[]): JsonRpcMessage[] {
	const messages: JsonRpcMessage[] = [];
	for (const line of lines) {
		try {
			messages.push(JSON.parse(line) as JsonRpcMessage);
		} catch {
			// not JSON - ignore
		}
	}
	return messages;
}

export function buildInitializeRequest(id: number): JsonRpcRequest {
	return {
		jsonrpc: '2.0',
		id,
		method: 'initialize',
		params: {
			protocolVersion: ACP_PROTOCOL_VERSION,
			// Decline filesystem capabilities: Looji wants conversational text
			// back, not Claude Code performing file operations through it.
			clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }
		}
	};
}

export function buildSessionNewRequest(id: number, cwd: string): JsonRpcRequest {
	return { jsonrpc: '2.0', id, method: 'session/new', params: { cwd, mcpServers: [] } };
}

/**
 * Flattens a full chat transcript into one prompt turn. Every call spawns a
 * fresh bridge process and session (see runClaudeCodeTurn) rather than
 * reusing a persistent session across calls, so - unlike a real interactive
 * Claude Code conversation - there's no session memory to lean on between
 * calls. The full context is resent each time, same as the HTTP providers.
 */
export function flattenMessagesToPromptText(messages: ChatMessage[]): string {
	return messages
		.map((m) =>
			m.role === 'system' ? m.content : `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
		)
		.join('\n\n');
}

export function buildSessionPromptRequest(id: number, sessionId: string, text: string): JsonRpcRequest {
	return {
		jsonrpc: '2.0',
		id,
		method: 'session/prompt',
		params: { sessionId, prompt: [{ type: 'text', text }] }
	};
}

/**
 * Extracts a text delta from a `session/update` notification, or null if
 * this update isn't a plain agent-message text chunk. Tool calls, plans and
 * other update kinds are out of scope for Looji's plain-text chat UI (v1)
 * and are ignored here rather than surfaced.
 *
 * NOTE: the exact `session/update` shape below is this module's best-effort
 * reading of the public ACP spec/examples, not something verified against a
 * live session in this environment (no way to spawn/authenticate a real
 * Claude Code process here). Worth confirming against real traffic - e.g. by
 * temporarily logging raw parsed messages - the first time this runs for
 * real, and adjusting the field names here if they don't match.
 */
export function extractUpdateText(message: JsonRpcMessage): string | null {
	if (isResponse(message) || message.method !== 'session/update') return null;
	const params = message.params as
		| { update?: { sessionUpdate?: string; content?: { type?: string; text?: unknown } } }
		| undefined;
	const update = params?.update;
	if (!update || update.sessionUpdate !== 'agent_message_chunk') return null;
	const text = update.content?.text;
	return typeof text === 'string' ? text : null;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export type ClaudeCodeDetection = {
	nodeAvailable: boolean;
	/** Only meaningful when nodeAvailable is true. */
	cliAvailable: boolean;
};

async function checkCommand(name: string, args: string[]): Promise<boolean> {
	try {
		const output = await Command.create(name, args).execute();
		return output.code === 0;
	} catch {
		return false;
	}
}

/**
 * Best-effort PATH checks for Node.js and the Claude Code CLI, for a fast
 * settings-page status. Not a guarantee the bridge will actually work (being
 * signed in isn't checked here - the real test is attempting a session via
 * testProviderConnection()).
 */
export async function detectClaudeCode(): Promise<ClaudeCodeDetection> {
	const nodeAvailable = await checkCommand('node-version-check', ['--version']);
	if (!nodeAvailable) return { nodeAvailable: false, cliAvailable: false };
	const cliAvailable = await checkCommand('claude-version-check', ['--version']);
	return { nodeAvailable: true, cliAvailable };
}

export class ClaudeCodeInstallError extends Error {}

/**
 * Installs the Claude Code CLI globally via npm, so the user doesn't have to
 * run that command themselves. Requires Node.js to already be present (not
 * checked here - call after detectClaudeCode() confirms nodeAvailable).
 * Signing in (`claude auth login`) still needs the user - it's an
 * interactive OAuth flow this app can't drive on their behalf.
 */
export async function installClaudeCodeCli(): Promise<void> {
	const output = await Command.create('install-claude-code-cli', [
		'install',
		'-g',
		'@anthropic-ai/claude-code'
	]).execute();
	if (output.code !== 0) {
		throw new ClaudeCodeInstallError(output.stderr.trim() || 'npm install failed.');
	}
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export class ClaudeCodeError extends Error {}

/**
 * Runs one full prompt turn: spawns the ACP bridge fresh, initializes,
 * creates a session, sends the whole flattened transcript as a single
 * prompt, streams the reply via onDelta, then tears the subprocess down.
 */
export async function runClaudeCodeTurn(
	messages: ChatMessage[],
	onDelta: (delta: string) => void,
	signal?: AbortSignal
): Promise<string> {
	const command = Command.create(BRIDGE_COMMAND_NAME, BRIDGE_ARGS);
	let buffer = '';
	let full = '';
	let nextId = 1;
	let lastStderr = '';
	const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

	function rejectAll(err: Error) {
		for (const waiter of pending.values()) waiter.reject(err);
		pending.clear();
	}

	command.stdout.on('data', (chunk) => {
		const { lines, remainder } = splitNdjson(buffer, chunk);
		buffer = remainder;
		for (const message of parseJsonRpcLines(lines)) {
			if (isResponse(message)) {
				const waiter = pending.get(message.id);
				if (!waiter) continue;
				pending.delete(message.id);
				if (message.error) waiter.reject(new ClaudeCodeError(message.error.message));
				else waiter.resolve(message.result);
			} else {
				const delta = extractUpdateText(message);
				if (delta) {
					full += delta;
					onDelta(delta);
				}
			}
		}
	});
	command.stderr.on('data', (chunk) => {
		const trimmed = chunk.trim();
		if (trimmed) lastStderr = trimmed;
	});
	command.on('error', (message) => {
		rejectAll(new ClaudeCodeError(message));
	});
	// If the process exits while a request is still pending (crash, npx
	// failing to resolve the package, killed externally, ...), that request
	// would otherwise hang forever - nothing else rejects it.
	command.on('close', (data: TerminatedPayload) => {
		if (pending.size === 0) return;
		rejectAll(
			new ClaudeCodeError(
				lastStderr || `The Claude Code bridge exited unexpectedly (code ${data.code ?? 'unknown'}).`
			)
		);
	});

	let child: Child;
	try {
		child = await command.spawn();
	} catch (err) {
		throw new ClaudeCodeError(
			`Could not start the Claude Code bridge (npx @agentclientprotocol/claude-agent-acp). Make sure Node.js is installed. ${err instanceof Error ? err.message : String(err)}`
		);
	}

	const onAbort = () => void child.kill();
	signal?.addEventListener('abort', onAbort);

	function send(request: JsonRpcRequest): Promise<unknown> {
		return new Promise((resolve, reject) => {
			pending.set(request.id, { resolve, reject });
			child.write(JSON.stringify(request) + '\n').catch(reject);
		});
	}

	try {
		await send(buildInitializeRequest(nextId++));
		const sessionResult = (await send(buildSessionNewRequest(nextId++, '.'))) as
			| { sessionId?: string }
			| undefined;
		const sessionId = sessionResult?.sessionId;
		if (!sessionId) {
			throw new ClaudeCodeError('The Claude Code bridge did not return a session id.');
		}
		const promptText = flattenMessagesToPromptText(messages);
		await send(buildSessionPromptRequest(nextId++, sessionId, promptText));
	} catch (err) {
		if (signal?.aborted) throw err;
		throw err instanceof ClaudeCodeError
			? err
			: new ClaudeCodeError(
					lastStderr ||
						(err instanceof Error ? err.message : String(err)) ||
						'Claude Code request failed. Make sure you are signed in with `claude auth login`.'
				);
	} finally {
		signal?.removeEventListener('abort', onAbort);
		await child.kill().catch(() => {});
	}

	if (!full.trim() && !signal?.aborted) {
		throw new ClaudeCodeError(
			lastStderr ||
				'Claude Code returned an empty response. Make sure you are signed in with `claude auth login`.'
		);
	}
	return full;
}
