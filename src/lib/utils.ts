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
	if (diff === 0) return 'Due today';
	if (diff === 1) return 'Due tomorrow';
	return `Due ${formatDate(iso)}`;
}

export function formatEstimate(hours: number | null | undefined): string {
	if (hours == null || hours <= 0) return '';
	const rounded = Math.round(hours * 10) / 10;
	if (rounded >= 8 && rounded % 8 === 0) return `${rounded / 8}d`;
	if (rounded < 1) return `${Math.round(rounded * 60)}m`;
	return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}h`;
}
