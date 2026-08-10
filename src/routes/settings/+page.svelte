<script lang="ts">
	import { Check, Trash2 } from '@lucide/svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { getCurrentUser } from '$lib/store.svelte';

	const currentUser = $derived(getCurrentUser());

	let section = $state('Profile');

	const sections = ['Profile', 'Notifications', 'Workspace'];

	let name = $state(getCurrentUser().name);
	let email = $state(getCurrentUser().email);
	let role = $state(getCurrentUser().role);
	let saved = $state(false);

	let notifEmail = $state(true);
	let notifDigest = $state(true);
	let notifMentions = $state(true);
	let notifProduct = $state(false);

	let workspaceName = $state('Workmaster');
	let timezone = $state('America/Los_Angeles');

	function saveProfile() {
		currentUser.name = name;
		currentUser.email = email;
		currentUser.role = role;
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}
</script>

<svelte:head>
	<title>Settings · Workmaster</title>
</svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Settings</h1>
	<p class="mt-1 text-sm text-neutral-500">Manage your profile, notifications, and workspace.</p>
</div>

<div class="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
	<nav class="flex gap-2 overflow-x-auto lg:sticky lg:top-8 lg:flex-col lg:gap-1 lg:self-start">
		{#each sections as item (item)}
			<button
				type="button"
				onclick={() => (section = item)}
				class="rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors {section ===
				item
					? 'bg-neutral-900 text-white'
					: 'text-neutral-600 hover:bg-neutral-200/60'}"
			>
				{item}
			</button>
		{/each}
	</nav>

	<div class="space-y-6">
		{#if section === 'Profile'}
			<section class="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs">
				<h2 class="font-semibold tracking-tight text-neutral-900">Profile</h2>
				<p class="mt-1 text-sm text-neutral-500">This is how you appear across the workspace.</p>
				<form class="mt-6" onsubmit={saveProfile}>
					<div class="flex flex-wrap items-start gap-5">
						<Avatar member={currentUser} size="lg" />
						<div class="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label for="profile-name" class="mb-1 block text-xs font-medium text-neutral-600">
									Full name
								</label>
								<input
									id="profile-name"
									type="text"
									class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
									bind:value={name}
								/>
							</div>
							<div>
								<label for="profile-email" class="mb-1 block text-xs font-medium text-neutral-600">
									Email
								</label>
								<input
									id="profile-email"
									type="email"
									class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
									bind:value={email}
								/>
							</div>
							<div class="sm:col-span-2">
								<label for="profile-role" class="mb-1 block text-xs font-medium text-neutral-600">
									Role
								</label>
								<input
									id="profile-role"
									type="text"
									class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
									bind:value={role}
								/>
							</div>
						</div>
					</div>
					<div class="mt-6 flex items-center gap-3 border-t border-neutral-100 pt-4">
						<button
							type="submit"
							class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
						>
							{#if saved}
								<Check size={15} />
								Saved
							{:else}
								Save changes
							{/if}
						</button>
						<p class="text-xs text-neutral-400">Updates your avatar and name everywhere.</p>
					</div>
				</form>
			</section>
		{:else if section === 'Notifications'}
			<section class="rounded-xl border border-neutral-200 bg-white shadow-xs">
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
						{@render Switch('Task assignments', notifEmail, (v) => (notifEmail = v))}
					</li>
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div>
							<p class="text-sm font-medium text-neutral-800">Weekly digest</p>
							<p class="mt-0.5 text-sm text-neutral-500">A summary of progress every Monday.</p>
						</div>
						{@render Switch('Weekly digest', notifDigest, (v) => (notifDigest = v))}
					</li>
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div>
							<p class="text-sm font-medium text-neutral-800">Mentions</p>
							<p class="mt-0.5 text-sm text-neutral-500">When someone mentions you in a comment.</p>
						</div>
						{@render Switch('Mentions', notifMentions, (v) => (notifMentions = v))}
					</li>
					<li class="flex items-center justify-between gap-4 px-6 py-4">
						<div>
							<p class="text-sm font-medium text-neutral-800">Product updates</p>
							<p class="mt-0.5 text-sm text-neutral-500">Occasional news about new features.</p>
						</div>
						{@render Switch('Product updates', notifProduct, (v) => (notifProduct = v))}
					</li>
				</ul>
			</section>
		{:else}
			<section class="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs">
				<h2 class="font-semibold tracking-tight text-neutral-900">Workspace</h2>
				<p class="mt-1 text-sm text-neutral-500">General settings for your team workspace.</p>
				<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<label for="workspace-name" class="mb-1 block text-xs font-medium text-neutral-600">
							Workspace name
						</label>
						<input
							id="workspace-name"
							type="text"
							class="w-full rounded-lg border-neutral-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={workspaceName}
						/>
					</div>
					<div>
						<label for="workspace-tz" class="mb-1 block text-xs font-medium text-neutral-600">
							Time zone
						</label>
						<select
							id="workspace-tz"
							class="w-full rounded-lg border-neutral-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500"
							bind:value={timezone}
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
		class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors {value
			? 'bg-indigo-600'
			: 'bg-neutral-200'}"
		onclick={() => onchange(!value)}
	>
		<span
			class="inline-block size-5 rounded-full bg-white shadow transition-transform {value
				? 'translate-x-5'
				: 'translate-x-0'}"
		></span>
	</button>
{/snippet}
