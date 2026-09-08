import { describe, expect, it } from 'vitest';
import { addWorkingHours, slugify, uniqueSlug } from './utils';

// Monday 2024-01-01 09:00 local time. Working hours: 09:00-17:00 (540-1020),
// Mon-Fri (1-5), matching the app's defaults.
const MON_9AM = new Date(2024, 0, 1, 9, 0, 0, 0);
const WORK_START = 9 * 60;
const WORK_END = 17 * 60;
const WORK_DAYS = [1, 2, 3, 4, 5];

function at(y: number, m: number, d: number, h: number, min = 0): Date {
	return new Date(y, m, d, h, min, 0, 0);
}

describe('addWorkingHours', () => {
	it('returns the start time unchanged for zero hours, and falls back to raw elapsed time for negative hours', () => {
		// The function only special-cases hours <= 0 as "skip the working-hours
		// math"; it doesn't clamp negative input, it just adds raw milliseconds.
		expect(addWorkingHours(MON_9AM, 0, WORK_START, WORK_END, WORK_DAYS).getTime()).toBe(
			MON_9AM.getTime()
		);
		expect(addWorkingHours(MON_9AM, -3, WORK_START, WORK_END, WORK_DAYS).getTime()).toBe(
			MON_9AM.getTime() - 3 * 3600000
		);
	});

	it('adds hours within the same working day', () => {
		const result = addWorkingHours(MON_9AM, 3, WORK_START, WORK_END, WORK_DAYS);
		expect(result.getTime()).toBe(at(2024, 0, 1, 12, 0).getTime());
	});

	it('rolls over to the next working day when the window runs out', () => {
		// Monday 9am + 10 hours: 8h fills the rest of Monday (9-17), 2h left ->
		// Tuesday 9-11.
		const result = addWorkingHours(MON_9AM, 10, WORK_START, WORK_END, WORK_DAYS);
		expect(result.getTime()).toBe(at(2024, 0, 2, 11, 0).getTime());
	});

	it('skips non-working days (weekend) when rolling over', () => {
		// Friday 2024-01-05, 16:00 + 3h: 1h fills Friday to 17:00, 2h left ->
		// skips Sat/Sun -> Monday 9-11.
		const friday4pm = at(2024, 0, 5, 16, 0);
		const result = addWorkingHours(friday4pm, 3, WORK_START, WORK_END, WORK_DAYS);
		expect(result.getTime()).toBe(at(2024, 0, 8, 11, 0).getTime());
	});

	it('rolls forward when the start time is before the working window', () => {
		// Monday 6am (before 9am start) + 1h should count from 9am, landing at 10am.
		const earlyMonday = at(2024, 0, 1, 6, 0);
		const result = addWorkingHours(earlyMonday, 1, WORK_START, WORK_END, WORK_DAYS);
		expect(result.getTime()).toBe(at(2024, 0, 1, 10, 0).getTime());
	});

	it('rolls forward when the start time is after the working window', () => {
		// Monday 8pm (after 5pm end) + 1h should count from Tuesday 9am.
		const lateMonday = at(2024, 0, 1, 20, 0);
		const result = addWorkingHours(lateMonday, 1, WORK_START, WORK_END, WORK_DAYS);
		expect(result.getTime()).toBe(at(2024, 0, 2, 10, 0).getTime());
	});

	it('spans multiple full working days', () => {
		// Monday 9am + 24h at 8h/working-day = exactly 3 full working days
		// (Mon+Tue+Wed), landing at the close of Wednesday's window.
		const result = addWorkingHours(MON_9AM, 24, WORK_START, WORK_END, WORK_DAYS);
		expect(result.getTime()).toBe(at(2024, 0, 3, 17, 0).getTime());
	});

	it('falls back to plain elapsed time when the working window is invalid', () => {
		const result = addWorkingHours(MON_9AM, 2, WORK_START, WORK_START, WORK_DAYS);
		expect(result.getTime()).toBe(MON_9AM.getTime() + 2 * 3600000);
	});

	it('respects a custom set of working days', () => {
		// Only Tue/Thu (2, 4) are working days. Monday 9am + 1h should jump to
		// Tuesday 9-10am.
		const result = addWorkingHours(MON_9AM, 1, WORK_START, WORK_END, [2, 4]);
		expect(result.getTime()).toBe(at(2024, 0, 2, 10, 0).getTime());
	});
});

describe('uniqueSlug', () => {
	it('returns the plain slug when it is not taken', () => {
		expect(uniqueSlug('Website Redesign', [])).toBe('website-redesign');
	});

	it('appends -2, -3, … until it finds a free slug', () => {
		expect(uniqueSlug('API v2', ['api-v2'])).toBe('api-v2-2');
		expect(uniqueSlug('API v2', ['api-v2', 'api-v2-2'])).toBe('api-v2-3');
	});

	it('disambiguates two differently-punctuated names that slugify identically', () => {
		const first = uniqueSlug('API v2', []);
		const second = uniqueSlug('API, v2', [first]);
		expect(first).toBe('api-v2');
		expect(second).not.toBe(first);
		expect(second).toBe('api-v2-2');
	});

	it('falls back to "project" for a name with no sluggable characters', () => {
		expect(uniqueSlug('***', [])).toBe('project');
		expect(uniqueSlug('***', ['project'])).toBe('project-2');
	});
});

describe('slugify', () => {
	it('lowercases and hyphenates, trimming leading/trailing separators', () => {
		expect(slugify('  Hello World!  ')).toBe('hello-world');
		expect(slugify('A/B Testing')).toBe('a-b-testing');
	});
});
