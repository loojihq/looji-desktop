<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Activity,
		FolderKanban,
		Layers,
		LayoutDashboard,
		ListTodo,
		Settings,
		Users
	} from '@lucide/svelte';
	import { projectAccents } from '$lib/badges';
	import { projects } from '$lib/store.svelte';

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
</script>

<aside class="flex h-full w-full flex-col bg-white">
	<div class="flex items-center px-5 pt-5 pb-4">
		<a href={resolve('/')} class="flex items-center gap-2.5" onclick={onNavigate}>
			<span class="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
				<Layers size={18} strokeWidth={2.25} />
			</span>
			<span class="text-lg font-semibold tracking-tight text-neutral-900">Workmaster</span>
		</a>
	</div>

	<nav class="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
		<div class="space-y-1">
			<p class="px-3 pb-1.5 text-xs font-semibold tracking-wider text-neutral-400 uppercase">
				Workspace
			</p>
			{#each navItems as item (item.href)}
				<a
					href={resolve(item.href)}
					onclick={onNavigate}
					class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors {isActive(
						item.href
					)
						? 'bg-indigo-50 text-indigo-700'
						: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}"
				>
					<item.icon
						size={18}
						strokeWidth={2}
						class={isActive(item.href) ? 'text-indigo-600' : 'text-neutral-400'}
					/>
					{item.label}
				</a>
			{/each}
		</div>

		<div class="space-y-1">
			<div class="flex items-center justify-between px-3 pb-1.5">
				<p class="text-xs font-semibold tracking-wider text-neutral-400 uppercase">Projects</p>
				<a
					href={resolve('/projects')}
					onclick={onNavigate}
					class="text-xs font-medium text-indigo-600 hover:text-indigo-700"
				>
					View all
				</a>
			</div>
			{#each quickProjects as project (project.id)}
				<a
					href={resolve(`/projects/${project.slug}`)}
					onclick={onNavigate}
					class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
				>
					<span
						class="size-2 shrink-0 rounded-full {projectAccents[project.color]?.chip ??
							'bg-neutral-400'}"
					></span>
					<span class="truncate">{project.name}</span>
				</a>
			{/each}
		</div>
	</nav>
</aside>
