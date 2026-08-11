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
