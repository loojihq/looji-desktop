import type { Priority, ProjectStatus, TaskStatus } from './types';

export type BadgeStyle = {
	label: string;
	dot: string;
	text: string;
	bg: string;
};

export const projectStatusStyles: Record<ProjectStatus, BadgeStyle> = {
	planning: {
		label: 'Planning',
		dot: 'bg-neutral-400',
		text: 'text-neutral-600',
		bg: 'bg-neutral-100'
	},
	active: { label: 'Active', dot: 'bg-indigo-500', text: 'text-indigo-700', bg: 'bg-indigo-50' },
	on_hold: { label: 'On hold', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
	completed: {
		label: 'Completed',
		dot: 'bg-emerald-500',
		text: 'text-emerald-700',
		bg: 'bg-emerald-50'
	}
};

export const taskStatusStyles: Record<TaskStatus, BadgeStyle> = {
	backlog: {
		label: 'Backlog',
		dot: 'bg-neutral-400',
		text: 'text-neutral-600',
		bg: 'bg-neutral-100'
	},
	todo: { label: 'To do', dot: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50' },
	in_progress: {
		label: 'In progress',
		dot: 'bg-indigo-500',
		text: 'text-indigo-700',
		bg: 'bg-indigo-50'
	},
	in_review: {
		label: 'In review',
		dot: 'bg-violet-500',
		text: 'text-violet-700',
		bg: 'bg-violet-50'
	},
	done: { label: 'Done', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' }
};

export const priorityStyles: Record<Priority, BadgeStyle> = {
	urgent: { label: 'Urgent', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
	high: { label: 'High', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
	medium: { label: 'Medium', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
	low: { label: 'Low', dot: 'bg-neutral-400', text: 'text-neutral-600', bg: 'bg-neutral-100' }
};

export const projectAccents: Record<string, { icon: string; bar: string; chip: string }> = {
	indigo: { icon: 'bg-indigo-100 text-indigo-600', bar: 'bg-indigo-500', chip: 'bg-indigo-500' },
	sky: { icon: 'bg-sky-100 text-sky-600', bar: 'bg-sky-500', chip: 'bg-sky-500' },
	emerald: {
		icon: 'bg-emerald-100 text-emerald-600',
		bar: 'bg-emerald-500',
		chip: 'bg-emerald-500'
	},
	amber: { icon: 'bg-amber-100 text-amber-600', bar: 'bg-amber-500', chip: 'bg-amber-500' },
	rose: { icon: 'bg-rose-100 text-rose-600', bar: 'bg-rose-500', chip: 'bg-rose-500' },
	violet: { icon: 'bg-violet-100 text-violet-600', bar: 'bg-violet-500', chip: 'bg-violet-500' }
};

export const avatarColors = [
	'bg-indigo-500',
	'bg-sky-500',
	'bg-emerald-500',
	'bg-amber-500',
	'bg-rose-500',
	'bg-violet-500',
	'bg-teal-500',
	'bg-orange-500'
];
