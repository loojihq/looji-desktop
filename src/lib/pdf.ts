import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import PoppinsRegular from './fonts/Poppins-Regular.ttf?inline';
import PoppinsMedium from './fonts/Poppins-Medium.ttf?inline';
import PoppinsBold from './fonts/Poppins-Bold.ttf?inline';
import { priorityStyles, taskStatusStyles } from './badges';
import type { Priority, TaskStatus } from './types';
import { dueLabel, formatDate, formatEstimate } from './utils';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = 280;
const LINE_H = 4.6;

type RGB = [number, number, number];

const INK: RGB = [24, 24, 27];
const BODY: RGB = [63, 63, 70];
const MUTED: RGB = [113, 113, 122];
const FAINT: RGB = [250, 250, 250];
const HAIRLINE: RGB = [228, 228, 231];
const INDIGO: RGB = [79, 70, 229];
const INDIGO_DEEP: RGB = [49, 46, 129];
const INDIGO_SOFT: RGB = [238, 242, 255];
const INDIGO_BORDER: RGB = [199, 210, 254];
const INDIGO_LIGHT: RGB = [165, 180, 252];
const WHITE: RGB = [255, 255, 255];

const STATUS_COLORS: Record<TaskStatus, RGB> = {
	backlog: [107, 114, 128],
	todo: [14, 165, 233],
	in_progress: [99, 102, 241],
	in_review: [139, 92, 246],
	done: [16, 185, 129]
};

const PRIORITY_COLORS: Record<Priority, RGB> = {
	urgent: [239, 68, 68],
	high: [249, 115, 22],
	medium: [245, 158, 11],
	low: [107, 114, 128]
};

export type PdfTask = {
	title: string;
	description: string;
	priority: Priority;
	estimate: number | null;
	due: string;
	assignee: string;
	status?: TaskStatus;
};

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

function toBase64(dataUri: string): string {
	return dataUri.split(',')[1] ?? '';
}

function registerFonts(doc: jsPDF): void {
	doc.addFileToVFS('Poppins-Regular.ttf', toBase64(PoppinsRegular));
	doc.addFileToVFS('Poppins-Medium.ttf', toBase64(PoppinsMedium));
	doc.addFileToVFS('Poppins-Bold.ttf', toBase64(PoppinsBold));
	doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
	doc.addFont('Poppins-Regular.ttf', 'Poppins', 'italic');
	doc.addFont('Poppins-Medium.ttf', 'PoppinsMedium', 'normal');
	doc.addFont('Poppins-Medium.ttf', 'PoppinsMedium', 'italic');
	doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');
	doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bolditalic');
	doc.addFont('Poppins-Bold.ttf', 'PoppinsMedium', 'bold');
	doc.addFont('Poppins-Bold.ttf', 'PoppinsMedium', 'bolditalic');
}

function verticalGradient(doc: jsPDF, x: number, y: number, w: number, h: number, top: RGB, bottom: RGB): void {
	const steps = 42;
	for (let i = 0; i < steps; i++) {
		const t = i / (steps - 1);
		const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
		const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
		const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
		doc.setFillColor(r, g, b);
		doc.rect(x, y + (h * i) / steps, w, h / steps + 0.6, 'F');
	}
}

function pill(doc: jsPDF, x: number, y: number, text: string): number {
	doc.setFont('PoppinsMedium', 'normal');
	doc.setFontSize(7.5);
	const w = doc.getTextWidth(text) + 9;
	doc.setFillColor(...INDIGO_LIGHT);
	doc.roundedRect(x, y, w, 6, 3, 3, 'F');
	doc.setTextColor(...INDIGO_DEEP);
	doc.text(text, x + w / 2, y + 4.1, { align: 'center' });
	return x + w + 4.5;
}

function baseDoc(projectName: string, kind: string, pillsText: string[]): jsPDF {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
	registerFonts(doc);

	// Gradient header band
	verticalGradient(doc, 0, 0, PAGE_W, 52, [99, 102, 241], [49, 46, 129]);
	doc.setFillColor(...INDIGO_DEEP);
	doc.rect(0, 51.4, PAGE_W, 0.6, 'F');

	// Eyebrow
	doc.setFont('PoppinsMedium', 'normal');
	doc.setFontSize(7.5);
	doc.setTextColor(...INDIGO_LIGHT);
	doc.text(`LOOJI  ·  ${kind.toUpperCase()}`, MARGIN, 14);
	doc.text(`GENERATED ${formatDate(new Date().toISOString()).toUpperCase()}`, PAGE_W - MARGIN, 14, {
		align: 'right'
	});

	// Title
	doc.setFont('Poppins', 'bold');
	doc.setFontSize(24);
	doc.setTextColor(...WHITE);
	const titleLines = doc.splitTextToSize(projectName, CONTENT_W);
	const multiLine = titleLines.length > 1;
	doc.text(titleLines, MARGIN, multiLine ? 23 : 27);

	// Accent bar
	doc.setFillColor(...WHITE);
	doc.roundedRect(MARGIN, multiLine ? 39.5 : 34.6, 30, 1.3, 0.65, 0.65, 'F');

	// Meta pills
	let px = MARGIN;
	for (const text of pillsText) {
		px = pill(doc, px, multiLine ? 45 : 40, text);
	}
	return doc;
}

function ensure(doc: jsPDF, y: number, needed: number): number {
	if (y + needed > BOTTOM_LIMIT) {
		doc.addPage();
		return MARGIN + 6;
	}
	return y;
}

function sectionTitle(doc: jsPDF, y: number, text: string): number {
	y = ensure(doc, y, 16);
	const label = text.toUpperCase();
	doc.setFont('Poppins', 'bold');
	doc.setFontSize(10.5);
	const w = doc.getTextWidth(label) + 11;
	doc.setFillColor(...INDIGO_SOFT);
	doc.roundedRect(MARGIN, y - 3.6, w, 7.2, 3.6, 3.6, 'F');
	doc.setTextColor(...INDIGO_DEEP);
	doc.text(label, MARGIN + 5.5, y + 1.2);
	return y + 10;
}

function statCards(doc: jsPDF, y: number, stats: { label: string; value: string }[]): number {
	const gap = 4;
	const cardW = (CONTENT_W - gap * (stats.length - 1)) / stats.length;
	const h = 21;
	y = ensure(doc, y, h + 10);
	stats.forEach((stat, i) => {
		const x = MARGIN + i * (cardW + gap);
		doc.setFillColor(...WHITE);
		doc.roundedRect(x, y, cardW, h, 2.5, 2.5, 'F');
		doc.setDrawColor(...HAIRLINE);
		doc.setLineWidth(0.25);
		doc.roundedRect(x, y, cardW, h, 2.5, 2.5, 'S');
		doc.setFillColor(...INDIGO);
		doc.roundedRect(x + 3, y + 3.5, 1.2, h - 7, 0.6, 0.6, 'F');
		doc.setFont('Poppins', 'bold');
		doc.setFontSize(12.5);
		doc.setTextColor(...INK);
		doc.text(doc.splitTextToSize(stat.value, cardW - 11), x + 7, y + 10);
		doc.setFont('PoppinsMedium', 'normal');
		doc.setFontSize(7);
		doc.setTextColor(...MUTED);
		doc.text(stat.label.toUpperCase(), x + 7, y + 15.5);
	});
	return y + h + 12;
}

function paragraph(doc: jsPDF, y: number, text: string, size = 9.5): number {
	const lines = doc.splitTextToSize(text, CONTENT_W);
	y = ensure(doc, y, lines.length * LINE_H + 4);
	doc.setFont('Poppins', 'normal');
	doc.setFontSize(size);
	doc.setTextColor(...BODY);
	doc.text(lines, MARGIN, y + 3.2);
	return y + lines.length * LINE_H + 7;
}

function specBlock(doc: jsPDF, y: number, text: string): number {
	const lines = doc.splitTextToSize(text, CONTENT_W - 14);
	const blockH = lines.length * LINE_H + 13;
	y = ensure(doc, y, blockH + 10);
	doc.setFillColor(...INDIGO_SOFT);
	doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 3, 3, 'F');
	doc.setDrawColor(...INDIGO_BORDER);
	doc.setLineWidth(0.3);
	doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 3, 3, 'S');
	doc.setFont('Poppins', 'normal');
	doc.setFontSize(9.5);
	doc.setTextColor(...INDIGO_DEEP);
	doc.text(lines, MARGIN + 7, y + 9);
	return y + blockH + 12;
}

function storiesBlock(doc: jsPDF, y: number, stories: string[]): number {
	y = ensure(doc, y, 10);
	stories.forEach((story, index) => {
		const lines = doc.splitTextToSize(story, CONTENT_W - 13);
		const blockH = lines.length * LINE_H + 2;
		y = ensure(doc, y, blockH + 6);
		doc.setFillColor(...INDIGO);
		doc.circle(MARGIN + 2.3, y + 1.8, 2.5, 'F');
		doc.setTextColor(...WHITE);
		doc.setFont('Poppins', 'bold');
		doc.setFontSize(7.5);
		doc.text(String(index + 1), MARGIN + 2.3, y + 2.3, { align: 'center' });
		doc.setFont('Poppins', 'normal');
		doc.setFontSize(9.5);
		doc.setTextColor(...BODY);
		doc.text(lines, MARGIN + 8.5, y + 3.4);
		y += blockH + 4.5;
	});
	return y;
}

function taskBlock(doc: jsPDF, y: number, task: PdfTask): number {
	const priorityLabel = priorityStyles[task.priority].label.toUpperCase();
	const priorityColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium;
	const estimate = formatEstimate(task.estimate);

	doc.setFont('Poppins', 'bold');
	doc.setFontSize(10.5);
	const titleMaxW = CONTENT_W - 14 - (estimate ? 30 : 0);
	const titleLines = doc.splitTextToSize(task.title, titleMaxW);
	const descLines = task.description ? doc.splitTextToSize(task.description, CONTENT_W - 14) : [];
	const blockH = 16 + (titleLines.length - 1) * 5 + descLines.length * (LINE_H - 0.4);
	y = ensure(doc, y, blockH + 6);

	// Card
	doc.setFillColor(...WHITE);
	doc.roundedRect(MARGIN, y, CONTENT_W, blockH - 1.5, 2.5, 2.5, 'F');
	doc.setDrawColor(...HAIRLINE);
	doc.setLineWidth(0.25);
	doc.roundedRect(MARGIN, y, CONTENT_W, blockH - 1.5, 2.5, 2.5, 'S');

	// Priority accent bar
	doc.setFillColor(...priorityColor);
	doc.roundedRect(MARGIN, y + 3.2, 1.4, blockH - 8, 0.7, 0.7, 'F');

	// Title
	doc.setTextColor(...INK);
	doc.setFont('Poppins', 'bold');
	doc.setFontSize(10.5);
	doc.text(titleLines, MARGIN + 5.5, y + 6.8);

	// Estimate chip
	if (estimate) {
		doc.setFont('PoppinsMedium', 'normal');
		doc.setFontSize(7.5);
		const estW = doc.getTextWidth(estimate) + 8;
		doc.setFillColor(...INDIGO_SOFT);
		doc.roundedRect(PAGE_W - MARGIN - 3.5 - estW, y + 3.4, estW, 5.4, 2.7, 2.7, 'F');
		doc.setTextColor(...INDIGO_DEEP);
		doc.text(estimate, PAGE_W - MARGIN - 3.5 - estW / 2, y + 7, { align: 'center' });
	}

	// Meta row
	const metaY = y + 12.4 + (titleLines.length - 1) * 5;
	doc.setFont('PoppinsMedium', 'normal');
	doc.setFontSize(7.5);
	doc.setTextColor(...MUTED);
	doc.text(
		`ASSIGNEE  ${task.assignee || 'Unassigned'}    ·    DUE  ${dueLabel(task.due)}`,
		MARGIN + 5.5,
		metaY
	);

	// Description
	if (descLines.length > 0) {
		doc.setFont('Poppins', 'normal');
		doc.setFontSize(8.6);
		doc.setTextColor(...BODY);
		doc.text(descLines, MARGIN + 5.5, metaY + 5);
	}

	return y + blockH + 3.5;
}

function statusSection(doc: jsPDF, y: number, status: TaskStatus, tasks: PdfTask[]): number {
	const label = taskStatusStyles[status].label;
	const color = STATUS_COLORS[status];
	y = ensure(doc, y, 20);

	// Status dot + label
	doc.setFillColor(...color);
	doc.circle(MARGIN + 1.4, y - 1.4, 1.5, 'F');
	doc.setTextColor(...INK);
	doc.setFont('Poppins', 'bold');
	doc.setFontSize(13);
	doc.text(label, MARGIN + 5.5, y);

	// Count pill
	const countText = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
	doc.setFont('PoppinsMedium', 'normal');
	doc.setFontSize(7.5);
	const cw = doc.getTextWidth(countText) + 9;
	doc.setFillColor(...FAINT);
	doc.roundedRect(PAGE_W - MARGIN - cw, y - 4, cw, 6, 3, 3, 'F');
	doc.setDrawColor(...HAIRLINE);
	doc.setLineWidth(0.25);
	doc.roundedRect(PAGE_W - MARGIN - cw, y - 4, cw, 6, 3, 3, 'S');
	doc.setTextColor(...MUTED);
	doc.text(countText, PAGE_W - MARGIN - cw / 2, y - 0.4, { align: 'center' });

	// Hairline
	doc.setDrawColor(...HAIRLINE);
	doc.setLineWidth(0.25);
	doc.line(MARGIN, y + 2.6, PAGE_W - MARGIN, y + 2.6);
	y += 8.5;

	for (const task of tasks) {
		y = taskBlock(doc, y, task);
	}
	return y;
}

function addFooter(doc: jsPDF, projectName: string): void {
	const pages = doc.getNumberOfPages();
	for (let i = 1; i <= pages; i++) {
		doc.setPage(i);
		doc.setDrawColor(...HAIRLINE);
		doc.setLineWidth(0.25);
		doc.line(MARGIN, 287, PAGE_W - MARGIN, 287);
		doc.setFont('PoppinsMedium', 'normal');
		doc.setFontSize(7.5);
		doc.setTextColor(...MUTED);
		doc.text(`LOOJI  ·  ${projectName}`, MARGIN, 291.5);
		doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, 291.5, { align: 'right' });
	}
}

async function savePdf(doc: jsPDF, defaultName: string): Promise<void> {
	const path = await save({
		title: 'Export PDF',
		defaultPath: defaultName,
		filters: [{ name: 'PDF document', extensions: ['pdf'] }]
	});
	if (!path) return;
	const bytes = doc.output('arraybuffer');
	await writeFile(path, new Uint8Array(bytes));
}

function totalEstimate(tasks: PdfTask[]): string {
	const total = tasks.reduce((sum, t) => sum + (t.estimate ?? 0), 0);
	return formatEstimate(total) || '—';
}

/** Exports the current AI draft as a styled PDF. */
export async function exportDraftPdf(input: {
	projectName: string;
	projectDue: string;
	desires: string;
	spec: string;
	userStories: string[];
	tasks: PdfTask[];
}): Promise<void> {
	const doc = baseDoc(input.projectName, 'Draft plan', [
		'DRAFT',
		`TARGET ${formatDate(input.projectDue).toUpperCase()}`,
		`${input.tasks.length} TASKS`
	]);
	let y = 58;
	y = statCards(doc, y, [
		{ label: 'Tasks', value: String(input.tasks.length) },
		{ label: 'Estimate', value: totalEstimate(input.tasks) },
		{ label: 'Target date', value: formatDate(input.projectDue) },
		{ label: 'Plan type', value: 'Draft' }
	]);
	if (input.desires.trim()) {
		y = sectionTitle(doc, y, 'Desires');
		y = paragraph(doc, y, input.desires);
	}
	if (input.spec) {
		y = sectionTitle(doc, y, 'Project spec');
		y = specBlock(doc, y, input.spec);
	}
	if (input.userStories.length > 0) {
		y = sectionTitle(doc, y, 'User stories');
		y = storiesBlock(doc, y, input.userStories);
	}
	y = sectionTitle(doc, y, 'Tasks');
	for (const task of input.tasks) {
		y = taskBlock(doc, y, task);
	}
	addFooter(doc, input.projectName);
	await savePdf(doc, `looji-${slugify(input.projectName)}-draft.pdf`);
}

/** Exports the full project report, grouped by task status. */
export async function exportProjectPdf(input: {
	projectName: string;
	projectStatus: string;
	projectDue: string;
	description: string;
	spec: string;
	userStories: string[];
	tasks: PdfTask[];
}): Promise<void> {
	const doc = baseDoc(input.projectName, 'Project report', [
		input.projectStatus.toUpperCase(),
		`TARGET ${formatDate(input.projectDue).toUpperCase()}`,
		`${input.tasks.length} TASKS`
	]);
	let y = 58;
	y = statCards(doc, y, [
		{ label: 'Status', value: input.projectStatus },
		{ label: 'Tasks', value: String(input.tasks.length) },
		{ label: 'Estimate', value: totalEstimate(input.tasks) },
		{ label: 'Target date', value: formatDate(input.projectDue) }
	]);
	if (input.description.trim()) {
		y = sectionTitle(doc, y, 'Overview');
		y = paragraph(doc, y, input.description);
	}
	if (input.spec) {
		y = sectionTitle(doc, y, 'Project spec');
		y = specBlock(doc, y, input.spec);
	}
	if (input.userStories.length > 0) {
		y = sectionTitle(doc, y, 'User stories');
		y = storiesBlock(doc, y, input.userStories);
	}
	y = sectionTitle(doc, y, 'Tasks');
	const order: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
	for (const status of order) {
		const group = input.tasks.filter((task) => task.status === status);
		if (group.length === 0) continue;
		y = statusSection(doc, y, status, group);
	}
	addFooter(doc, input.projectName);
	await savePdf(doc, `looji-${slugify(input.projectName)}-report.pdf`);
}
