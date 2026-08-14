<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Activity,
		Check,
		ChevronsUpDown,
		FolderKanban,
		Layers,
		LayoutDashboard,
		ListTodo,
		Pencil,
		Plus,
		Settings,
		Trash2,
		Upload,
		Users,
		X
	} from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import UpdateStatus from '$lib/components/UpdateStatus.svelte';
	import WorkspaceTile from '$lib/components/WorkspaceTile.svelte';
	import { projectAccents } from '$lib/badges';
	import {
		createWorkspace,
		currentWorkspaceState,
		deleteWorkspace,
		projects,
		switchWorkspace,
		tasks,
		updateWorkspace,
		workspaces
	} from '$lib/store.svelte';
	import { pickWorkspaceImage } from '$lib/workspaces';
	import type { Workspace } from '$lib/types';

	let { onNavigate = () => {} }: { onNavigate?: () => void } = $props();

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/projects', label: 'Projects', icon: FolderKanban },
		{ href: '/tasks', label: 'Tasks', icon: ListTodo },
		{ href: '/activity', label: 'Activity', icon: Activity },
		{ href: '/team', label: 'Team', icon: Users },
		{ href: '/settings', label: 'Settings', icon: Settings }
	] as const;

	const isActive = $derived((href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)
	);

	const quickProjects = $derived(
		projects.filter((project) => project.status !== 'completed').slice(0, 4)
	);

	const openTaskCount = $derived(tasks.filter((t) => t.status !== 'done').length);
	const activeProjectCount = $derived(projects.filter((p) => p.status !== 'completed').length);

	function openTasksFor(projectId: string): number {
		return tasks.filter((t) => t.projectId === projectId && t.status !== 'done').length;
	}

	const currentWorkspace = $derived(
		workspaces.find((w) => w.id === currentWorkspaceState.id) ?? workspaces[0]
	);

	// ---- Workspace switcher state & CRUD ----
	let switcherOpen = $state(false);
	let wsError = $state('');
	let creating = $state(false);
	let newName = $state('');
	let newIcon = $state('');
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let renameIcon = $state('');
	let deleteTarget = $state<Workspace | null>(null);
	let switchBusy = $state(false);
	let createInput = $state<HTMLInputElement | null>(null);
	let renameInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (creating) createInput?.focus();
	});
	$effect(() => {
		if (renamingId) renameInput?.focus();
	});

	$effect(() => {
		if (!switcherOpen) return;
		const onPointer = (event: PointerEvent) => {
			if (switcherEl && !switcherEl.contains(event.target as Node)) switcherOpen = false;
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') switcherOpen = false;
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	});

	let switcherEl = $state<HTMLDivElement | null>(null);

	function openSwitcher() {
		switcherOpen = true;
		wsError = '';
	}

	function beginCreate() {
		creating = true;
		renamingId = null;
		newName = '';
		newIcon = '';
		wsError = '';
	}

	async function saveCreate() {
		try {
			await createWorkspace(newName, { icon: newIcon });
			creating = false;
			newName = '';
			switcherOpen = false;
		} catch (err) {
			wsError = err instanceof Error ? err.message : String(err);
		}
	}

	function beginRename(workspace: Workspace) {
		renamingId = workspace.id;
		renameValue = workspace.name;
		renameIcon = workspace.icon;
		creating = false;
		wsError = '';
	}

	async function saveRename() {
		if (!renamingId) return;
		try {
			await updateWorkspace(renamingId, renameValue, {
				icon: renameIcon
			});
			renamingId = null;
			wsError = '';
		} catch (err) {
			wsError = err instanceof Error ? err.message : String(err);
		}
	}

	async function uploadIcon(kind: 'create' | 'rename') {
		try {
			const dataUrl = await pickWorkspaceImage();
			if (dataUrl) {
				if (kind === 'create') newIcon = dataUrl;
				else renameIcon = dataUrl;
			}
		} catch (err) {
			wsError = err instanceof Error ? err.message : String(err);
		}
	}

	async function doSwitch(id: string) {
		if (id === currentWorkspaceState.id) {
			switcherOpen = false;
			return;
		}
		switchBusy = true;
		try {
			await switchWorkspace(id);
			switcherOpen = false;
			// Land on the dashboard: it is workspace-scoped and always valid,
			// while a project-detail page may not exist in the new workspace.
			await goto('/');
		} catch (err) {
			wsError = err instanceof Error ? err.message : String(err);
		} finally {
			switchBusy = false;
		}
	}

	async function doDelete() {
		if (!deleteTarget) return;
		try {
			await deleteWorkspace(deleteTarget.id);
			deleteTarget = null;
			switcherOpen = false;
		} catch (err) {
			wsError = err instanceof Error ? err.message : String(err);
			deleteTarget = null;
		}
	}
</script>

<aside class="flex h-full w-full flex-col bg-white">
	<!-- Workspace switcher -->
	<div class="px-3 pt-5 pb-4" bind:this={switcherEl}>
		<div class="relative">
			<button
				type="button"
				onclick={() => (switcherOpen ? (switcherOpen = false) : openSwitcher())}
				class="flex w-full items-center gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-left transition-colors hover:bg-neutral-100"
				aria-haspopup="menu"
				aria-expanded={switcherOpen}
			>
				<WorkspaceTile
					icon={currentWorkspace?.icon ?? ''}
					name={currentWorkspace?.name ?? 'W'}
					class="size-9"
				/>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm font-semibold text-neutral-900">
						{currentWorkspace?.name ?? 'Workspace'}
					</span>
					<span class="block text-[10px] tracking-wide text-neutral-400 uppercase">
						{workspaces.length} {workspaces.length === 1 ? 'workspace' : 'workspaces'}
					</span>
				</span>
				<ChevronsUpDown size={15} class="shrink-0 text-neutral-400" />
			</button>

			{#if switcherOpen}
				<div
					class="absolute inset-x-0 top-full z-50 mt-1.5 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl"
					role="menu"
				>
					<p
						class="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-widest text-neutral-400 uppercase"
					>
						Switch workspace
					</p>

					<div class="max-h-64 space-y-0.5 overflow-y-auto">
						{#each workspaces as workspace (workspace.id)}
							{@const active = workspace.id === currentWorkspaceState.id}
							{#if renamingId === workspace.id}
								<div class="px-1.5 py-1">
									<div class="flex items-center gap-1.5">
										<WorkspaceTile
											icon={renameIcon}
											name={renameValue || ' '}
											class="size-8"
										/>
										<input
											type="text"
											bind:this={renameInput}
											autocomplete="off"
											placeholder="Workspace name"
											class="h-8 min-w-0 flex-1 rounded-lg border-neutral-300 bg-surface px-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
											bind:value={renameValue}
											onkeydown={(event) => {
												if (event.key === 'Enter') {
													event.preventDefault();
													saveRename();
												}
												if (event.key === 'Escape') renamingId = null;
											}}
										/>
										<button
											type="button"
											class="shrink-0 rounded-md bg-indigo-600 p-1.5 text-white transition-colors hover:bg-indigo-500"
											aria-label="Save changes"
											onclick={saveRename}
										>
											<Check size={13} />
										</button>
										<button
											type="button"
											class="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
											aria-label="Cancel"
											onclick={() => (renamingId = null)}
										>
											<X size={13} />
										</button>
									</div>
									<div class="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1.5">
										<input
											type="text"
											autocomplete="off"
											placeholder="Image URL…"
											class="h-7 w-36 rounded-lg border-neutral-300 bg-surface px-2 text-xs focus:border-indigo-500 focus:ring-indigo-500"
											bind:value={renameIcon}
										/>
										<button
											type="button"
											class="inline-flex h-7 items-center gap-1 rounded-lg border border-neutral-200 bg-surface px-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
											onclick={() => uploadIcon('rename')}
										>
											<Upload size={12} />
											Upload
										</button>
										{#if renameIcon}
											<button
												type="button"
												class="h-7 rounded-lg px-2 text-xs font-medium text-neutral-400 transition-colors hover:text-red-600"
												onclick={() => (renameIcon = '')}
											>
												Clear
											</button>
										{/if}
									</div>
								</div>
							{:else}
								<div
									class="group flex items-center gap-1 rounded-lg px-1.5 {active
										? 'bg-indigo-50'
										: 'hover:bg-neutral-50'}"
								>
									<button
										type="button"
										class="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-2 text-left"
										onclick={() => doSwitch(workspace.id)}
										disabled={switchBusy}
									>
										<WorkspaceTile
											icon={workspace.icon}
											name={workspace.name}
											class="size-7"
										/>
										<span
											class="min-w-0 flex-1 truncate text-sm {active
												? 'font-semibold text-indigo-700'
												: 'text-neutral-700'}"
										>
											{workspace.name}
										</span>
										{#if active}
											<Check size={14} class="shrink-0 text-indigo-600" />
										{/if}
									</button>
									{#if workspaces.length > 1}
										<button
											type="button"
											class="shrink-0 rounded-md p-1 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-100 hover:text-neutral-600 focus-visible:opacity-100"
											aria-label="Edit {workspace.name}"
											onclick={() => beginRename(workspace)}
										>
											<Pencil size={13} />
										</button>
										<button
											type="button"
											class="shrink-0 rounded-md p-1 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100"
											aria-label="Delete {workspace.name}"
											onclick={() => (deleteTarget = workspace)}
										>
											<Trash2 size={13} />
										</button>
									{/if}
								</div>
							{/if}
						{/each}

						{#if creating}
							<div class="px-1.5 py-1">
								<div class="flex items-center gap-1.5">
									<WorkspaceTile
										icon={newIcon}
										name={newName || ' '}
										class="size-8"
									/>
									<input
										type="text"
										bind:this={createInput}
										autocomplete="off"
										placeholder="Workspace name"
										class="h-8 min-w-0 flex-1 rounded-lg border-neutral-300 bg-surface px-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
										bind:value={newName}
										onkeydown={(event) => {
											if (event.key === 'Enter') {
												event.preventDefault();
												saveCreate();
											}
											if (event.key === 'Escape') creating = false;
										}}
									/>
									<button
										type="button"
										class="shrink-0 rounded-md bg-indigo-600 p-1.5 text-white transition-colors hover:bg-indigo-500"
										aria-label="Create workspace"
										onclick={saveCreate}
									>
										<Check size={13} />
									</button>
									<button
										type="button"
										class="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
										aria-label="Cancel"
										onclick={() => (creating = false)}
									>
										<X size={13} />
									</button>
								</div>
								<div class="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1.5">
									<input
										type="text"
										autocomplete="off"
										placeholder="Image URL…"
										class="h-7 w-36 rounded-lg border-neutral-300 bg-surface px-2 text-xs focus:border-indigo-500 focus:ring-indigo-500"
										bind:value={newIcon}
									/>
									<button
										type="button"
										class="inline-flex h-7 items-center gap-1 rounded-lg border border-neutral-200 bg-surface px-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
										onclick={() => uploadIcon('create')}
									>
										<Upload size={12} />
										Upload
									</button>
									{#if newIcon}
										<button
											type="button"
											class="h-7 rounded-lg px-2 text-xs font-medium text-neutral-400 transition-colors hover:text-red-600"
											onclick={() => (newIcon = '')}
										>
											Clear
										</button>
									{/if}
								</div>
							</div>
						{:else}
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
								onclick={beginCreate}
							>
								<Plus size={14} />
								New workspace
							</button>
						{/if}
					</div>

					{#if wsError}
						<p class="px-2.5 pt-1.5 text-xs text-red-600">{wsError}</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<nav class="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
		<div class="space-y-0.5">
			<p class="px-3 pb-1.5 text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
				Workspace
			</p>
			{#each navItems as item (item.href)}
				{@const active = isActive(item.href)}
				<a
					href={resolve(item.href)}
					onclick={onNavigate}
					class="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors {active
						? 'bg-indigo-50 text-indigo-700'
						: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}"
				>
					{#if active}
						<span
							class="absolute inset-y-1.5 -left-3 w-0.5 rounded-full bg-indigo-600"
						></span>
					{/if}
					<span
						class="flex size-5 shrink-0 items-center justify-center {active
							? 'text-indigo-600'
							: 'text-neutral-400 transition-colors group-hover:text-neutral-600'}"
					>
						<item.icon size={17} strokeWidth={2} />
					</span>
					<span class="min-w-0 flex-1 truncate">{item.label}</span>
					{#if item.href === '/tasks' && openTaskCount > 0}
						<span
							class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {active
								? 'bg-indigo-100 text-indigo-700'
								: 'bg-neutral-100 text-neutral-500'}"
						>
							{openTaskCount}
						</span>
					{:else if item.href === '/projects' && activeProjectCount > 0}
						<span
							class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {active
								? 'bg-indigo-100 text-indigo-700'
								: 'bg-neutral-100 text-neutral-500'}"
						>
							{activeProjectCount}
						</span>
					{/if}
				</a>
			{/each}
		</div>

		<div class="space-y-0.5">
			<div class="flex items-center justify-between px-3 pb-1.5">
				<p class="text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
					Projects
				</p>
				<a
					href={resolve('/projects')}
					onclick={onNavigate}
					class="text-[11px] font-medium text-indigo-600 transition-colors hover:text-indigo-700"
				>
					View all
				</a>
			</div>
			{#each quickProjects as project (project.id)}
				{@const open = openTasksFor(project.id)}
				<a
					href={resolve(`/projects/${project.slug}`)}
					onclick={onNavigate}
					class="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
				>
					<span
						class="size-2 shrink-0 rounded-full {projectAccents[project.color]?.chip ??
						'bg-neutral-400'}"
					></span>
					<span class="min-w-0 flex-1 truncate">{project.name}</span>
					{#if open > 0}
						<span class="shrink-0 text-[10px] font-medium text-neutral-400">
							{open} open
						</span>
					{/if}
				</a>
			{:else}
				<a
					href={resolve('/projects')}
					onclick={onNavigate}
					class="block rounded-lg border border-dashed border-neutral-200 px-3 py-2.5 text-xs text-neutral-400 transition-colors hover:border-indigo-300 hover:text-indigo-600"
				>
					Create a project
				</a>
			{/each}
		</div>
	</nav>

	<UpdateStatus />
</aside>

<ConfirmDialog
	open={deleteTarget !== null}
	title="Delete workspace?"
	message={`This permanently deletes "${deleteTarget?.name ?? ''}" and everything in it — all projects, tasks and members.`}
	confirmLabel="Delete workspace"
	onConfirm={doDelete}
	onCancel={() => (deleteTarget = null)}
/>
