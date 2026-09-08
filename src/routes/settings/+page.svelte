<script lang="ts">
	import { Pencil, Plus, Trash2 } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Select from '$lib/components/Select.svelte';
	import { PROVIDER_PRESETS, fetchProviderModels, testProviderConnection } from '$lib/ai';
	import { settings, updateSetting } from '$lib/store.svelte';
	import type { AiProvider, AiProviderKind } from '$lib/types';

	let section = $state('Appearance');

	const sections = ['Appearance', 'AI', 'General'];

	const KIND_LABELS: Record<AiProviderKind, string> = {
		openai: 'OpenAI',
		anthropic: 'Anthropic',
		ollama: 'Ollama',
		'openai-compatible': 'Custom (OpenAI-compatible)'
	};
	const KIND_OPTIONS = (Object.keys(KIND_LABELS) as AiProviderKind[]).map((k) => ({
		value: k,
		label: KIND_LABELS[k]
	}));

	let providerFormOpen = $state(false);
	let editingId = $state<string | null>(null);
	let formKind = $state<AiProviderKind>('openai');
	let formLabel = $state('');
	let formBaseUrl = $state('');
	let formApiKey = $state('');
	let formModel = $state('');
	let formModels = $state<string[]>([]);
	let formError = $state('');
	let formTesting = $state(false);
	let formTestResult = $state<{ ok: boolean; message: string } | null>(null);
	let formLoadingModels = $state(false);
	let deleteTarget = $state<AiProvider | null>(null);
	let deleteError = $state('');

	// The current model is always selectable, even if it's no longer in the
	// fetched list.
	const modelOptions = $derived(
		Array.from(new Set([...(formModel ? [formModel] : []), ...formModels])).map((m) => ({
			value: m,
			label: m
		}))
	);

	function applyPreset(kind: AiProviderKind) {
		const preset = PROVIDER_PRESETS[kind];
		formLabel = preset.label;
		formBaseUrl = preset.baseUrl;
		formModel = '';
		formModels = [];
		formTestResult = null;
		modelsFetchedFor = '';
	}

	function openAddProvider() {
		editingId = null;
		formKind = 'openai';
		applyPreset('openai');
		formApiKey = '';
		formError = '';
		providerFormOpen = true;
	}

	function openEditProvider(provider: AiProvider) {
		editingId = provider.id;
		formKind = provider.kind;
		formLabel = provider.label;
		formBaseUrl = provider.baseUrl;
		formApiKey = provider.apiKey;
		formModel = provider.model;
		formModels = provider.models;
		formError = '';
		formTestResult = null;
		// Already has a cached model list for this exact config - don't
		// immediately re-fetch until something actually changes.
		modelsFetchedFor = draftFingerprint();
		providerFormOpen = true;
	}

	function closeProviderForm() {
		providerFormOpen = false;
		editingId = null;
		formError = '';
	}

	function draftProvider(): AiProvider {
		return {
			id: editingId ?? crypto.randomUUID(),
			kind: formKind,
			label: formLabel.trim() || KIND_LABELS[formKind],
			baseUrl: formBaseUrl.trim().replace(/\/+$/, ''),
			apiKey: formApiKey.trim(),
			model: formModel.trim(),
			models: formModels
		};
	}

	async function testDraft() {
		formTesting = true;
		formTestResult = null;
		try {
			await testProviderConnection(draftProvider());
			formTestResult = { ok: true, message: 'Connected successfully.' };
		} catch (err) {
			formTestResult = { ok: false, message: err instanceof Error ? err.message : String(err) };
		} finally {
			formTesting = false;
		}
	}

	async function fetchModelsForDraft() {
		formLoadingModels = true;
		formError = '';
		try {
			formModels = await fetchProviderModels(draftProvider());
			if (!formModel && formModels[0]) formModel = formModels[0];
		} catch (err) {
			formError = err instanceof Error ? err.message : String(err);
		} finally {
			formLoadingModels = false;
		}
	}

	/** Identifies the (kind, base URL, key) combination models were last
	 *  fetched for, so the auto-fetch below only re-runs when one of them
	 *  actually changes. */
	function draftFingerprint(): string {
		return `${formKind} ${formBaseUrl.trim()} ${formApiKey.trim()}`;
	}
	let modelsFetchedFor = $state('');

	// Auto-load the model list once the form has enough to ask with (a base
	// URL, and a key when the provider needs one) - no manual "fetch" step.
	// Debounced so typing out an API key doesn't fire a request per keystroke.
	$effect(() => {
		if (!providerFormOpen) return;
		const fp = draftFingerprint();
		if (fp === modelsFetchedFor) return;
		const ready = formBaseUrl.trim() && (!PROVIDER_PRESETS[formKind].needsKey || formApiKey.trim());
		if (!ready) return;
		const timer = setTimeout(() => {
			modelsFetchedFor = fp;
			fetchModelsForDraft();
		}, 500);
		return () => clearTimeout(timer);
	});

	async function saveProvider() {
		if (!formBaseUrl.trim()) {
			formError = 'Base URL is required.';
			return;
		}
		if (PROVIDER_PRESETS[formKind].needsKey && !formApiKey.trim()) {
			formError = 'An API key is required for this provider.';
			return;
		}
		if (!formModel.trim()) {
			formError = 'Choose or enter a model.';
			return;
		}
		formError = '';
		const provider = draftProvider();
		const next = editingId
			? settings.aiProviders.map((p) => (p.id === editingId ? provider : p))
			: [...settings.aiProviders, provider];
		await updateSetting('aiProviders', next);
		if (!settings.activeAiProviderId) {
			await updateSetting('activeAiProviderId', provider.id);
		}
		closeProviderForm();
	}

	async function setActive(id: string) {
		await updateSetting('activeAiProviderId', id);
	}

	async function handleDeleteProvider() {
		if (!deleteTarget) return;
		try {
			const id = deleteTarget.id;
			const next = settings.aiProviders.filter((p) => p.id !== id);
			await updateSetting('aiProviders', next);
			if (settings.activeAiProviderId === id) {
				await updateSetting('activeAiProviderId', next[0]?.id ?? '');
			}
			deleteTarget = null;
		} catch (err) {
			deleteError = err instanceof Error ? err.message : String(err);
		}
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
	<p class="mt-1 text-sm text-neutral-500">Appearance, AI and general settings.</p>
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
			</section>
		{:else if section === 'AI'}
			<section class="rounded-xl border border-neutral-200 bg-surface p-6 shadow-xs">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="font-semibold tracking-tight text-neutral-900">AI providers</h2>
						<p class="mt-1 text-sm text-neutral-500">
							Connect an OpenAI, Anthropic, Ollama or any OpenAI-compatible provider (DeepSeek,
							Groq, OpenRouter, …) to generate project plans, explain tasks and chat about them.
						</p>
					</div>
					{#if !providerFormOpen}
						<button
							type="button"
							onclick={openAddProvider}
							class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
						>
							<Plus size={15} />
							Add provider
						</button>
					{/if}
				</div>

				{#if settings.aiProviders.length === 0 && !providerFormOpen}
					<div
						class="mt-6 rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center"
					>
						<p class="text-sm font-medium text-neutral-600">No AI provider connected</p>
						<p class="mt-1 text-sm text-neutral-400">
							Add one to generate plans, explain tasks and chat about them.
						</p>
					</div>
				{:else if settings.aiProviders.length > 0}
					<ul class="mt-6 space-y-2">
						{#each settings.aiProviders as provider (provider.id)}
							{@const active = provider.id === settings.activeAiProviderId}
							<li
								class="flex items-center gap-3 rounded-lg border px-3 py-2.5 {active
									? 'border-indigo-300 bg-indigo-50/50'
									: 'border-neutral-200'}"
							>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-1.5">
										<span class="text-sm font-semibold text-neutral-900">{provider.label}</span>
										<span
											class="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500"
										>
											{KIND_LABELS[provider.kind]}
										</span>
										{#if active}
											<span
												class="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
											>
												Active
											</span>
										{/if}
									</div>
									<p class="mt-0.5 truncate text-xs text-neutral-400">
										{provider.baseUrl} · {provider.model}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-1">
									{#if !active}
										<button
											type="button"
											onclick={() => setActive(provider.id)}
											class="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
										>
											Set active
										</button>
									{/if}
									<button
										type="button"
										aria-label="Edit {provider.label}"
										onclick={() => openEditProvider(provider)}
										class="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
									>
										<Pencil size={14} />
									</button>
									<button
										type="button"
										aria-label="Delete {provider.label}"
										onclick={() => {
											deleteTarget = provider;
											deleteError = '';
										}}
										class="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
									>
										<Trash2 size={14} />
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}

				{#if providerFormOpen}
					<form
						onsubmit={(event) => {
							event.preventDefault();
							saveProvider();
						}}
						autocomplete="off"
						class="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4"
					>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="provider-kind" class="mb-1 block text-xs font-medium text-neutral-600">
									Provider type
								</label>
								<Select
									id="provider-kind"
									class="w-full"
									bind:value={formKind}
									onchange={(v) => applyPreset(v as AiProviderKind)}
									options={KIND_OPTIONS}
								/>
							</div>
							<div>
								<label for="provider-label" class="mb-1 block text-xs font-medium text-neutral-600">
									Name
								</label>
								<input
									id="provider-label"
									type="text"
									autocomplete="off"
									placeholder={KIND_LABELS[formKind]}
									class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
									bind:value={formLabel}
								/>
							</div>
							<div class="sm:col-span-2">
								<label
									for="provider-base-url"
									class="mb-1 block text-xs font-medium text-neutral-600"
								>
									Base URL
								</label>
								<input
									id="provider-base-url"
									type="text"
									autocomplete="off"
									placeholder="https://…"
									class="w-full rounded-lg border-neutral-300 bg-white font-mono text-xs focus:border-indigo-500 focus:ring-indigo-500"
									bind:value={formBaseUrl}
								/>
							</div>
							<div>
								<label for="provider-key" class="mb-1 block text-xs font-medium text-neutral-600">
									API key
									{#if !PROVIDER_PRESETS[formKind].needsKey}
										<span class="font-normal text-neutral-400">(optional)</span>
									{/if}
								</label>
								<input
									id="provider-key"
									type="password"
									autocomplete="off"
									placeholder={PROVIDER_PRESETS[formKind].needsKey ? 'sk-…' : 'Not required for local Ollama'}
									class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
									bind:value={formApiKey}
								/>
							</div>
							<div>
								<label for="provider-model" class="mb-1 block text-xs font-medium text-neutral-600">
									Model
								</label>
								<Select
									id="provider-model"
									class="w-full"
									bind:value={formModel}
									options={modelOptions}
									placeholder={formLoadingModels
										? 'Loading available models…'
										: PROVIDER_PRESETS[formKind].needsKey && !formApiKey.trim()
											? 'Add an API key to load models'
											: 'Select a model'}
								/>
							</div>
						</div>
						{#if formError}
							<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
						{/if}
						{#if formTestResult}
							<p
								class="mt-3 rounded-lg px-3 py-2 text-sm {formTestResult.ok
									? 'bg-emerald-50 text-emerald-700'
									: 'bg-red-50 text-red-700'}"
							>
								{formTestResult.message}
							</p>
						{/if}
						<div class="mt-4 flex items-center gap-2">
							<button
								type="submit"
								class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
							>
								{editingId ? 'Save changes' : 'Add provider'}
							</button>
							<button
								type="button"
								onclick={testDraft}
								disabled={formTesting}
								class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{formTesting ? 'Testing…' : 'Test connection'}
							</button>
							<button
								type="button"
								class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
								onclick={closeProviderForm}
							>
								Cancel
							</button>
						</div>
					</form>
				{/if}
			</section>
		{:else}
			<section class="rounded-xl border border-neutral-200 bg-surface p-6 shadow-xs">
				<h2 class="font-semibold tracking-tight text-neutral-900">General</h2>
				<p class="mt-1 text-sm text-neutral-500">Automation preferences.</p>

				<div class="mt-6">
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
		{/if}
	</div>
</div>

<ConfirmDialog
	open={deleteTarget !== null}
	title="Delete provider?"
	message={`This removes "${deleteTarget?.label ?? ''}" and its saved API key from this device.`}
	confirmLabel="Delete provider"
	error={deleteError}
	onConfirm={handleDeleteProvider}
	onCancel={() => {
		deleteTarget = null;
		deleteError = '';
	}}
/>

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
