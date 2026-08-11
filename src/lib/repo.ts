import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

export type RepoFile = { path: string };

export type RepoIndex = {
	root: string;
	files: RepoFile[];
	symbols: { file: string; symbols: string[] }[];
};

export type RepoScan = {
	root: string;
	files: RepoFile[];
	truncated: boolean;
	error: string | null;
};

const IGNORE_DIRS = new Set([
	'.git',
	'node_modules',
	'target',
	'dist',
	'build',
	'.svelte-kit',
	'.next',
	'.nuxt',
	'.output',
	'.cache',
	'vendor',
	'.venv',
	'venv',
	'__pycache__',
	'.idea',
	'.vscode',
	'.turbo',
	'coverage',
	'.parcel-cache',
	'.yarn',
	'bin',
	'obj',
	'.gradle',
	'Pods',
	'.dart_tool',
	'out',
	'.vercel',
	'.netlify',
	'.history'
]);

const IGNORE_EXT = new Set([
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.bmp',
	'.ico',
	'.svg',
	'.avif',
	'.woff',
	'.woff2',
	'.ttf',
	'.eot',
	'.otf',
	'.pdf',
	'.zip',
	'.tar',
	'.gz',
	'.bz2',
	'.7z',
	'.rar',
	'.exe',
	'.dll',
	'.so',
	'.dylib',
	'.wasm',
	'.map',
	'.lock',
	'.class',
	'.pyc',
	'.o',
	'.a',
	'.obj',
	'.min.js',
	'.min.css'
]);

const MAX_FILES = 600;

function joinPath(dir: string, name: string): string {
	return dir.endsWith('\\') || dir.endsWith('/') ? dir + name : dir + '\\' + name;
}

/** Recursively lists a repository's source files, skipping common noise. */
export async function scanRepo(root: string): Promise<RepoScan> {
	const files: RepoFile[] = [];
	let truncated = false;

	async function walk(dir: string): Promise<void> {
		if (files.length >= MAX_FILES) {
			truncated = true;
			return;
		}
		let entries;
		try {
			entries = await readDir(dir);
		} catch {
			return; // unreadable directory (permissions, broken link, etc.)
		}
		for (const entry of entries) {
			if (files.length >= MAX_FILES) {
				truncated = true;
				return;
			}
			const name = entry.name;
			if (entry.isDirectory) {
				if (IGNORE_DIRS.has(name)) continue;
				await walk(joinPath(dir, name));
			} else if (entry.isFile) {
				if (name.startsWith('.')) continue;
				const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
				if (IGNORE_EXT.has(ext)) continue;
				files.push({ path: joinPath(dir, name) });
			}
		}
	}

	try {
		await walk(root);
		return { root, files, truncated, error: null };
	} catch (err) {
		return {
			root,
			files: [],
			truncated: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

/** Path relative to the repo root, using forward slashes. */
export function relativePath(root: string, absolute: string): string {
	let rel = absolute;
	if (rel.startsWith(root)) rel = rel.slice(root.length);
	rel = rel.replace(/^[\\/]+/, '');
	return rel.replace(/\\/g, '/');
}

/**
 * Reads up to `maxChars` of text across the given files, skipping anything
 * unreadable (binary, missing, permission denied). Best effort for AI context.
 */
export async function readRepoFiles(
	files: RepoFile[],
	maxChars = 140_000
): Promise<{ path: string; content: string }[]> {
	const out: { path: string; content: string }[] = [];
	let budget = maxChars;
	for (const file of files) {
		if (budget <= 0) break;
		let content: string;
		try {
			content = await readTextFile(file.path);
		} catch {
			continue;
		}
		if (content.length > 500_000) continue; // skip huge single files
		const take = Math.min(content.length, budget);
		out.push({ path: file.path, content: content.slice(0, take) });
		budget -= take;
	}
	return out;
}

/** Always-read "orientation" files that describe the project itself. */
const KEY_FILES = ['README', 'readme', 'README.md', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'composer.json', 'docker-compose.yml', 'Dockerfile', '.env.example', 'vite.config.ts', 'vite.config.js', 'svelte.config.js', 'tsconfig.json', 'requirements.txt'];

const STOPWORDS = new Set([
	'a', 'an', 'the', 'of', 'for', 'in', 'on', 'with', 'and', 'or', 'to', 'is', 'are', 'it', 'this',
	'task', 'should', 'be', 'make', 'implement', 'implementing', 'add', 'create', 'fix', 'update',
	'we', 'our', 'your', 'all', 'as', 'at', 'by', 'from', 'into', 'that', 'using', 'use', 'when', 'via'
]);

function isKeyFile(path: string): boolean {
	const base = path.slice(path.lastIndexOf('\\') + 1).toLowerCase();
	return KEY_FILES.some((k) => base === k.toLowerCase());
}
export { isKeyFile };

/** A compact, token-conscious summary of the repo for the AI: the file tree. */
export function repoTreeText(files: RepoFile[], maxFiles = 220): string {
	const lines = files
		.slice(0, maxFiles)
		.map((f) => '- ' + f.path)
		.join('\n');
	return files.length > maxFiles ? `${lines}\n… (${files.length - maxFiles} more files)` : lines;
}

/** A compact symbol map (file → its functions/classes/consts). This is the
 *  "repo map" trick: the model learns where things live without reading the
 *  files, which keeps the context tiny for huge codebases. */
export function repoMapText(symbols: { file: string; symbols: string[] }[], maxFiles = 180): string {
	const lines = symbols
		.slice(0, maxFiles)
		.map((s) => `${s.file}: ${s.symbols.join(', ')}`);
	return lines.length > 0 ? lines.join('\n') : '(no symbols extracted)';
}

const SYMBOL_PATTERNS: [string, RegExp][] = [
	// TypeScript / JavaScript / Svelte / Vue
	['fn', /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g],
	['fn', /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g],
	['fn', /\b(?:export\s+)?function\s+([A-Za-z_$][\w$]*)/g],
	['cls', /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g],
	['typ', /\b(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g],
	// Python
	['fn', /\bdef\s+([a-zA-Z_]\w*)/g],
	['cls', /\bclass\s+([a-zA-Z_]\w*)/g],
	// Rust
	['fn', /\b(?:pub(?:\s*\([^)]*\))?\s+)?fn\s+([a-zA-Z_]\w*)/g],
	// Go
	['fn', /\bfunc\s+(?:\([^)]*\)\s+)?([a-zA-Z_]\w*)/g],
	// Java / C# / Kotlin / Swift
	['fn', /\b(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?[A-Za-z_][\w<>\[\], ?]*\s+([a-zA-Z_]\w*)\s*\(/g],
	['cls', /\b(?:public|private|protected|internal)?\s*(?:abstract\s+|final\s+|sealed\s+|static\s+)?(?:class|interface|struct|enum)\s+([A-Za-z_][\w$]*)/g]
];

/**
 * Extracts top-level-ish symbols (functions, classes, types, consts) per file
 * using cheap regexes. Reads at most ~220 files under 400KB so first indexing
 * stays bounded; results are cached in the database afterwards.
 */
export async function extractSymbols(root: string, files: RepoFile[]): Promise<{ file: string; symbols: string[] }[]> {
	const out: { file: string; symbols: string[] }[] = [];
	let reads = 0;
	for (const file of files) {
		if (out.length >= 220 || reads >= 240) break;
		let text: string;
		try {
			text = await readTextFile(file.path);
			reads++;
		} catch {
			continue;
		}
		if (text.length > 400_000) continue;
		const names: string[] = [];
		for (const [, re] of SYMBOL_PATTERNS) {
			re.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = re.exec(text)) !== null) {
				const name = match[1];
				if (!name || name === 'function' || name === 'if' || name === 'for' || name === 'return' || name === 'export' || name === 'async' || name === 'const' || name === 'await') continue;
				if (!names.includes(name)) names.push(name);
				if (names.length >= 40) break;
			}
		}
		if (names.length > 0) {
			out.push({ file: relativePath(root, file.path), symbols: names });
		}
	}
	return out;
}

/** Entry-point file bases that are always worth a look (main.rs, index.ts…). */
const ENTRY_BASE = new Set([
	'main', 'lib', 'index', 'app', 'mod', 'cli', 'server', 'router', 'store', 'db', 'config'
]);

/**
 * Fully local retrieval for a task (no model call):
 * 1. Score every file by path tokens + symbol-map names, always keeping
 *    entry-point files (main.rs, index.ts, …) in the candidate pool.
 * 2. Read the top candidates and score them against the task's keywords in
 *    their actual contents.
 * 3. Return hunks (matched line ranges + context) for the best files, with a
 *    short preview for strong candidates that had no literal keyword hits.
 */
export async function readRelevantHunks(
	root: string,
	files: RepoFile[],
	symbols: { file: string; symbols: string[] }[],
	keywords: string[],
	maxFiles = 8,
	contextLines = 6,
	maxChars = 70_000
): Promise<{ path: string; content: string }[]> {
	const terms = keywords
		.map((k) => k.toLowerCase())
		.filter((k) => k.length > 2 && !STOPWORDS.has(k));
	if (terms.length === 0) return [];

	const symbolMap: Record<string, Set<string>> = {};
	for (const s of symbols) {
		symbolMap[s.file.toLowerCase()] = new Set(s.symbols.map((x) => x.toLowerCase()));
	}

	// 1) Candidate pool from path + symbol matches, entry files always included.
	const pool: { file: RepoFile; score: number; isEntry: boolean }[] = [];
	const seen = new Set<string>();
	const addCandidate = (file: RepoFile, score: number, isEntry: boolean) => {
		if (seen.has(file.path)) return;
		seen.add(file.path);
		pool.push({ file, score, isEntry });
	};
	for (const file of files) {
		const lower = file.path.toLowerCase();
		const rel = relativePath(root, file.path).toLowerCase();
		const base = lower.slice(lower.lastIndexOf('\\') + 1);
		const baseName = base.slice(0, base.lastIndexOf('.')).toLowerCase();
		const isEntry = ENTRY_BASE.has(baseName) || /^(main|lib|index|mod|app)\./.test(base);
		const syms = symbolMap[rel];
		let score = 0;
		for (const t of terms) {
			if (lower.includes(t)) score += 2;
			if (syms?.has(t)) score += 3;
		}
		if (score > 0 || isEntry) addCandidate(file, score, isEntry);
	}
	pool.sort((a, b) => b.score - a.score || (b.isEntry ? 1 : 0) - (a.isEntry ? 1 : 0));
	const candidates = pool.slice(0, 16);
	const entries = pool.filter((c) => c.isEntry).slice(0, 3);
	for (const e of entries) {
		if (!candidates.includes(e)) candidates.push(e);
	}

	// 2) Read candidates, count content hits, keep the best.
	const ranked: { file: RepoFile; hits: number[]; lines: string[] }[] = [];
	for (const { file } of candidates.slice(0, 20)) {
		let text: string;
		try {
			text = await readTextFile(file.path);
		} catch {
			continue;
		}
		if (text.length > 900_000) continue;
		const lines = text.split('\n');
		const hits: number[] = [];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].toLowerCase();
			if (terms.some((t) => line.includes(t))) hits.push(i);
		}
		ranked.push({ file, hits, lines });
	}
	ranked.sort((a, b) => b.hits.length - a.hits.length || a.file.path.length - b.file.path.length);
	const chosen = ranked.slice(0, maxFiles);

	// 3) Hunks around matches; preview fallback for strong candidates.
	const out: { path: string; content: string }[] = [];
	let budget = maxChars;
	for (const { file, hits, lines } of chosen) {
		if (budget <= 0) break;
		let block: string;
		if (hits.length > 0) {
			const ranges: [number, number][] = [];
			for (const h of hits.slice(0, 6)) {
				const start = Math.max(0, h - contextLines);
				const end = Math.min(lines.length - 1, h + contextLines);
				const last = ranges[ranges.length - 1];
				if (last && start <= last[1] + 1) {
					last[1] = end;
				} else {
					ranges.push([start, end]);
				}
			}
			block = '';
			for (const [start, end] of ranges) {
				if (start > 0) block += '…\n';
				block += lines.slice(start, end + 1).join('\n') + '\n';
				if (end < lines.length - 1) block += '…\n';
			}
		} else {
			// No literal keyword hits, but the file is a strong candidate (e.g.
			// the entry point). Show its head so the model can still look.
			block = lines.slice(0, 40).join('\n') + (lines.length > 40 ? '\n…' : '');
		}
		const trimmed = block.trim();
		if (!trimmed) continue;
		const take = Math.min(trimmed.length, budget);
		out.push({ path: file.path, content: trimmed.slice(0, take) });
		budget -= take;
	}
	return out;
}
