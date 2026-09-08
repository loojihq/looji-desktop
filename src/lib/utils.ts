export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

/**
 * Slugifies `name` and disambiguates it against `taken` (e.g. "api-v2",
 * "api-v2-2", …) so two differently-punctuated names that collapse to the
 * same slug don't leave one project unreachable at its own URL.
 */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
	const base = slugify(name) || 'project';
	const used = new Set(taken);
	if (!used.has(base)) return base;
	let n = 2;
	while (used.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

/**
 * Real task statuses that share a single board column when `displayStatus`'s
 * neighbour is hidden from `boardStatuses` (e.g. Backlog folds into "To do"
 * when the Backlog column is off).
 */
export function foldedBoardGroup(
	displayStatus: string,
	boardStatuses: string[]
): string[] {
	if (displayStatus === 'todo' && !boardStatuses.includes('backlog')) {
		return ['todo', 'backlog'];
	}
	if (displayStatus === 'in_progress' && !boardStatuses.includes('in_review')) {
		return ['in_progress', 'in_review'];
	}
	return [displayStatus];
}

/**
 * Translates a visual drop position into the index moveTask expects.
 *
 * `items` is the full, ordered list the UI renders for the target column,
 * *including* the dragged item at its own (dimmed) slot - the same list a
 * `{#each items as item, i}` loop would index. `visualIndex` is that same
 * inclusive index (or negative to mean "append at the end"). The result
 * excludes the dragged item and counts only items that will end up sharing
 * `targetStatus`, matching the exclusive, per-status list the store's
 * `moveTask` builds internally.
 */
export function resolveVisualDropIndex<T extends { id: string; status: string }>(
	items: T[],
	draggedId: string,
	targetStatus: string,
	visualIndex: number
): number {
	const clamped = visualIndex < 0 ? items.length : Math.min(visualIndex, items.length);
	return items.slice(0, clamped).filter((t) => t.id !== draggedId && t.status === targetStatus)
		.length;
}

export function initials(name: string): string {
	return name
		.split(' ')
		.map((part) => part.charAt(0))
		.slice(0, 2)
		.join('')
		.toUpperCase();
}

export function formatDate(iso: string): string {
	const date = new Date(iso);
	const sameYear = date.getFullYear() === new Date().getFullYear();
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' as const })
	});
}

export function formatDateLong(date: Date): string {
	return date.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
}

export function daysFromNow(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return date.toISOString();
}

export function hoursAgo(hours: number): string {
	return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function relativeTime(iso: string): string {
	const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return formatDate(iso);
}

export function isOverdue(iso: string): boolean {
	return new Date(iso).getTime() < Date.now();
}

export function dueLabel(iso: string): string {
	const due = new Date(iso);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const dueDay = new Date(due);
	dueDay.setHours(0, 0, 0, 0);
	const diff = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
	if (diff < 0) return `Overdue: ${formatDate(iso)}`;
	if (diff === 0) {
		const time = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		return `Due today, ${time}`;
	}
	if (diff === 1) {
		const time = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		return `Due tomorrow, ${time}`;
	}
	return `Due ${formatDate(iso)}`;
}

export function formatEstimate(hours: number | null | undefined): string {
	if (hours == null || hours <= 0) return '';
	const totalMinutes = Math.round(hours * 60);
	const days = Math.floor(totalMinutes / 480); // 1 day = 8 working hours
	const remaining = totalMinutes % 480;
	const hrs = Math.floor(remaining / 60);
	const mins = remaining % 60;
	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hrs > 0) parts.push(`${hrs}h`);
	if (mins > 0) parts.push(`${mins}m`);
	if (parts.length === 0) parts.push(`${totalMinutes}m`);
	return parts.join(' ');
}

export function minutesToTime(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number {
	const [h, m] = value.split(':').map(Number);
	if (!Number.isFinite(h)) return 540;
	return h * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Adds `hours` of effort to `start`, counting only the working hours of each
 * weekday (Mon-Fri) between workStartMin and workEndMin (minutes from midnight).
 * When the day's window runs out, counting resumes at the next workday's start.
 */
export function addWorkingHours(
	start: Date,
	hours: number,
	workStartMin = 540,
	workEndMin = 1020,
	workDays: number[] = [1, 2, 3, 4, 5]
): Date {
	if (hours <= 0 || workEndMin <= workStartMin) {
		return new Date(start.getTime() + hours * 3600000);
	}
	let remainingMs = hours * 3600000;
	let current = new Date(start);
	while (remainingMs > 0) {
		const dayStart = new Date(current);
		dayStart.setHours(0, 0, 0, 0);
		const dow = current.getDay();
		if (!workDays.includes(dow)) {
			current = new Date(dayStart.getTime() + 86400000);
			continue;
		}
		const windowStart = new Date(dayStart.getTime() + workStartMin * 60000);
		const windowEnd = new Date(dayStart.getTime() + workEndMin * 60000);
		if (current < windowStart) current = windowStart;
		if (current >= windowEnd) {
			current = new Date(dayStart.getTime() + 86400000);
			continue;
		}
		const available = windowEnd.getTime() - current.getTime();
		if (available >= remainingMs) {
			current = new Date(current.getTime() + remainingMs);
			remainingMs = 0;
		} else {
			remainingMs -= available;
			current = new Date(dayStart.getTime() + 86400000);
		}
	}
	return current;
}
