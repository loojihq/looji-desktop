<script lang="ts">
	import { Check, Trash2 } from '@lucide/svelte';
	import { settings, updateSetting } from '$lib/store.svelte';
	import type { PrimaryColor } from '$lib/types';

	let section = $state('Appearance');

	const sections = ['Appearance', 'Notifications', 'Workspace'];

	const themes = [
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'system', label: 'System' }
	] as const;

	const primaryColors: { value: PrimaryColor; label: string; swatch: string }[] = [
		{ value: 'indigo', label: 'Indigo', swatch: 'bg-indigo-500' },
		{ value: 'blue', label: 'Blue', swatch: 'bg-blue-500' },
		{ value: 'violet', label: 'Violet', swatch: 'bg-violet-500' },
		{ value: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500' },
		{ value: 'rose', label: 'Rose', swatch: 'bg-rose-500' },
		{ value: 'amber', label: 'Amber', swatch: 'bg-amber-500' }
	];
</script>

<svelte:head>
	<title>Settings · Workmaster</title>
</svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Settings</h1>
	<p class="mt-1 text-sm text-neutral-500">
		Appearance, notifications, and workspace settings.
	</p>
</div>

<div class="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
	<nav class="flex gap-2 overflow-x-auto lg:sticky lg:top-8 lg:flex-col lg:self-start lg:gap-1">
		{#each sections as item (item)}
			<button
				type="button"
				onclick={() => (section = item)}
				class="rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors {section ===
				item
					? 'bg-foreground text-background'
					: 'text-neutral-600 hover:bg-neutral-200/60'}"
			>
				{item}
			</button>
		{/each}
	</nav>

	<div class="space-y-6">
		{#if section === 'Appearance'}
			<section class="rounded-xl border border-neutral-200 bg-surface p-6 shadow-xs">
				<h2 class="font-semibold tracking-tight text-neutral-900">Appearance</h2>
				<p class="mt-1 text-sm text-neutral-500">Choose how Workmaster looks.</p>

				<div class="mt-6">
					<p class="text-xs font-medium text-neutral-600">Theme</p>
					<div class="mt-2 inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-1">
						{#each themes as theme (theme.value)}
							<button
								type="button"
								onclick={() => updateSetting('theme', theme.value)}
								class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {settings.theme ===
								theme.value
									? 'bg-surface text-neutral-900 shadow-sm'
									: 'text-neutral-500 hover:text-neutral-700'}"
							>
								{theme.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="mt-6">
					<p class="text-xs font-medium text-neutral-600">Primary color</p>
					<div class="mt-2 flex flex-wrap items-center gap-3">
						{#each primaryColors as color (color.value)}
							<button
								type="button"
								onclick={() => updateSetting('primary', color.value)}
								class="group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors {settings.primary ===
								color.value
									? 'border-neutral-300 bg-neutral-100'
									: 'border-neutral-200 bg-surface hover:bg-neutral-50'}"
								aria-label="Use {color.label} as primary color"
							>
								<span class="size-4 rounded-full {color.swatch}"></span>
								<span class="text-sm font-medium text-neutral-700">{color.label}</span>
								{#if settings.primary === color.value}
									<Check size={13} class="text-neutral-600" />
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<div class="mt-6 border-t border-neutral-100 pt-5">
					<div class="flex items-center justify-between gap-4">
						<div>
							<p class="text-sm font-medium text-neutral-800">Overdue escalation</p>
							<p class="mt-0.5 text-sm text-neutral-500">
								Automatically move overdue To-do tasks to In progress.
							</p>
						</div>
						{@render Switch(
							'Overdue escalation',
							settings.autoEscalate,
							(v) => updateSetting('autoEscalate', v)
						)}
					</div>
				</div>
			</section>
		{:else if section === 'Notifications'}
			<section class="rounded-xl border border-neutral-200 bg-surface shadow-xs">
				<header class="border-b border-neutral-200 px-6 py-4">
					<h2 class="font-semibold tracking-tight text-neutral-900">Notifications</h2>
					<p class="mt-1 text-sm text-neutral-500">Choose what gets sent to your inbox.</p>
				</header>
				<ul class="divide-y divide-neutral-100">
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div>
							<p class="text-sm font-medium text-neutral-800">Task assignments</p>
							<p class="mt-0.5 text-sm text-neutral-500">When someone assigns a task to you.</p>
						</div>
						{@render Switch(
							'Task assignments',
							settings.notifAssignments,
							(v) => updateSetting('notifAssignments', v)
						)}
					</li>
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div>
							<p class="text-sm font-medium text-neutral-800">Weekly digest</p>
							<p class="mt-0.5 text-sm text-neutral-500">A summary of progress every Monday.</p>
						</div>
						{@render Switch('Weekly digest', settings.notifDigest, (v) => updateSetting('notifDigest', v))}
					</li>
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div>
							<p class="text-sm font-medium text-neutral-800">Mentions</p>
							<p class="mt-0.5 text-sm text-neutral-500">When someone mentions you in a comment.</p>
						</div>
						{@render Switch('Mentions', settings.notifMentions, (v) => updateSetting('notifMentions', v))}
					</li>
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div>
							<p class="text-sm font-medium text-neutral-800">Product updates</p>
							<p class="mt-0.5 text-sm text-neutral-500">Occasional news about new features.</p>
						</div>
						{@render Switch('Product updates', settings.notifProduct, (v) => updateSetting('notifProduct', v))}
					</li>
				</ul>
			</section>
		{:else}
			<section class="rounded-xl border border-neutral-200 bg-surface p-6 shadow-xs">
				<h2 class="font-semibold tracking-tight text-neutral-900">Workspace</h2>
				<p class="mt-1 text-sm text-neutral-500">General settings for your workspace.</p>
				<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<label for="workspace-name" class="mb-1 block text-xs font-medium text-neutral-600">
							Workspace name
						</label>
						<input
							id="workspace-name"
							type="text"
							class="w-full rounded-lg border-neutral-300 bg-surface text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={settings.workspaceName}
							onchange={() => updateSetting('workspaceName', settings.workspaceName)}
						/>
					</div>
					<div>
						<label for="workspace-tz" class="mb-1 block text-xs font-medium text-neutral-600">
							Time zone
						</label>
						<select
							id="workspace-tz"
							class="w-full rounded-lg border-neutral-300 bg-surface text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={settings.timezone}
							onchange={() => updateSetting('timezone', settings.timezone)}
						>
							<option value="America/Los_Angeles">Pacific Time (US)</option>
							<option value="America/New_York">Eastern Time (US)</option>
							<option value="Europe/London">London</option>
							<option value="Europe/Berlin">Berlin</option>
							<option value="Asia/Tokyo">Tokyo</option>
						</select>
					</div>
				</div>
				<div class="mt-6 border-t border-neutral-100 pt-5">
					<p class="text-sm font-medium text-red-700">Danger zone</p>
					<p class="mt-0.5 text-sm text-neutral-500">
						Deleting the workspace removes all projects and tasks.
					</p>
					<button
						type="button"
						class="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
					>
						<Trash2 size={15} />
						Delete workspace
					</button>
				</div>
			</section>
		{/if}
	</div>
</div>

{#snippet Switch(label: string, value: boolean, onchange: (next: boolean) => void)}
	<button
		type="button"
		role="switch"
		aria-label={label}
		aria-checked={value}
		class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors {value ? 'bg-indigo-600' : 'bg-neutral-200'}"
		onclick={() => onchange(!value)}
	>
		<span
			class="switch-thumb inline-block size-5 rounded-full bg-white shadow transition-transform {value ? 'translate-x-5' : 'translate-x-0'}"
		></span>
	</button>
{/snippet}
