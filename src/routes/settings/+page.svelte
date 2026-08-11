<script lang="ts">
	import { Trash2 } from '@lucide/svelte';
	import Select from '$lib/components/Select.svelte';
	import { fetchDeepSeekModels, testDeepSeekConnection } from '$lib/ai';
	import { settings, updateSetting } from '$lib/store.svelte';

	let section = $state('Appearance');

	const sections = ['Appearance', 'AI', 'Notifications', 'Workspace'];

	let aiTesting = $state(false);
	let aiTestResult = $state<string | null>(null);
	let aiTestOk = $state(false);
	let aiModels = $state<string[]>([]);
	let aiModelsLoaded = $state(false);
	let aiLoadingModels = $state(false);
	let aiModelsError = $state('');

	async function loadModels() {
		if (!settings.aiApiKey) return;
		aiLoadingModels = true;
		aiModelsError = '';
		try {
			aiModels = await fetchDeepSeekModels(settings.aiApiKey);
			aiModelsLoaded = true;
			// Persist the list so the task-explanation modal can offer the same models.
			await updateSetting('aiModels', aiModels);
		} catch (err) {
			aiModelsError = err instanceof Error ? err.message : String(err);
		} finally {
			aiLoadingModels = false;
		}
	}

	$effect(() => {
		if (section === 'AI' && settings.aiApiKey && !aiModelsLoaded && !aiLoadingModels) {
			loadModels();
		}
	});

	async function testAi() {
		if (!settings.aiApiKey) return;
		aiTesting = true;
		aiTestResult = null;
		try {
			await testDeepSeekConnection(settings.aiApiKey, settings.aiModel);
			aiTestOk = true;
			aiTestResult = 'Connected — your DeepSeek key works.';
			await loadModels();
		} catch (err) {
			aiTestOk = false;
			aiTestResult = err instanceof Error ? err.message : String(err);
		} finally {
			aiTesting = false;
		}
	}

	function handleKeyChange() {
		updateSetting('aiApiKey', settings.aiApiKey);
		updateSetting('aiModels', []);
		aiModelsLoaded = false;
		aiModels = [];
		aiModelsError = '';
	}

	const themes = [
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'system', label: 'System' }
	] as const;
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
		{:else if section === 'AI'}
			<section class="rounded-xl border border-neutral-200 bg-surface p-6 shadow-xs">
				<h2 class="font-semibold tracking-tight text-neutral-900">AI assistant</h2>
				<p class="mt-1 text-sm text-neutral-500">
					Connect a DeepSeek API key to generate project plans, specs and tasks.
				</p>

				<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="sm:col-span-2">
						<label for="ai-key" class="mb-1 block text-xs font-medium text-neutral-600">
							DeepSeek API key
						</label>
						<input
							id="ai-key"
							type="password"
							autocomplete="off"
							placeholder="sk-…"
							class="w-full rounded-lg border-neutral-300 bg-surface text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={settings.aiApiKey}
							onchange={handleKeyChange}
						/>
						<p class="mt-1 text-xs text-neutral-400">
							Stored locally on this device and only used to talk to DeepSeek.
						</p>
					</div>
					<div>
						<label for="ai-model" class="mb-1 block text-xs font-medium text-neutral-600">Model</label>
						<Select
							id="ai-model"
							class="w-full"
							bind:value={settings.aiModel}
							onchange={(v) => updateSetting('aiModel', v)}
							options={
								aiModels.length > 0
									? aiModels.map((m) => ({ value: m, label: m }))
									: [
											{ value: 'deepseek-chat', label: 'deepseek-chat' },
											{ value: 'deepseek-reasoner', label: 'deepseek-reasoner' }
										]
							}
						/>
						<p class="mt-1 text-xs text-neutral-400">
							{aiLoadingModels
								? 'Loading available models…'
								: aiModelsLoaded
									? `${aiModels.length} model${aiModels.length === 1 ? '' : 's'} available`
									: aiModelsError || 'Available models load once the key is validated.'}
						</p>
					</div>
					<div class="flex items-end">
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-surface px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={testAi}
							disabled={aiTesting || !settings.aiApiKey}
						>
							{aiTesting ? 'Testing…' : 'Test connection'}
						</button>
					</div>
				</div>
				{#if aiTestResult !== null}
					<p
						class="mt-3 rounded-lg px-3 py-2 text-sm {aiTestOk
							? 'bg-emerald-50 text-emerald-700'
							: 'bg-red-50 text-red-700'}"
					>
						{aiTestResult}
					</p>
				{/if}
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
						<Select
							id="workspace-tz"
							class="w-full"
							bind:value={settings.timezone}
							onchange={(v) => updateSetting('timezone', v)}
							options={[
								{ value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
								{ value: 'America/New_York', label: 'Eastern Time (US)' },
								{ value: 'Europe/London', label: 'London' },
								{ value: 'Europe/Berlin', label: 'Berlin' },
								{ value: 'Asia/Tokyo', label: 'Tokyo' }
							]}
						/>
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
			class="switch-thumb absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-all {value ? 'left-[22px]' : 'left-0.5'}"
		></span>
	</button>
{/snippet}
