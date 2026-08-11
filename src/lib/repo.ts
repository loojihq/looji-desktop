import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

export type RepoFile = { path: string };

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

const CODE_EXTS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
	'.cs', '.php', '.vue', '.svelte', '.html', '.css', '.scss', '.sql', '.sh', '.yaml', '.yml', '.json',
	'.md', '.toml', '.ini', '.proto', '.graphql'
]);

/**
 * Picks the files most likely relevant to a task: name/keyword matches first,
 * then key project files, capped and biased toward code files.
 */
export function pickRelevantFiles(files: RepoFile[], keywords: string[], max = 8): RepoFile[] {
	const normalized = keywords
		.map((k) => k.toLowerCase())
		.filter((k) => k.length > 2 && !STOPWORDS.has(k));

	const scored: { file: RepoFile; score: number; isCode: boolean }[] = [];
	for (const file of files) {
		const lower = file.path.toLowerCase();
		const isCode = CODE_EXTS.has(lower.slice(lower.lastIndexOf('.')));
		let score = 0;
		for (const keyword of normalized) {
			if (lower.includes(keyword)) score += isCode ? 3 : 1;
		}
		if (score > 0 || isKeyFile(file.path)) {
			scored.push({ file, score, isCode });
		}
	}
	scored.sort((a, b) => b.score - a.score || (b.isCode ? 1 : 0) - (a.isCode ? 1 : 0));
	return scored.slice(0, max).map((s) => s.file);
}

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
