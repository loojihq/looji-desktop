<script lang="ts">
	import { Check, ChevronDown } from '@lucide/svelte';

	let {
		value = $bindable(),
		options = [],
		placeholder = 'Select…',
		disabled = false,
		compact = false,
		direction = 'auto',
		class: className = '',
		id,
		ariaLabel,
		name,
		onchange
	}: {
		value?: string;
		options: { value: string; label: string }[];
		placeholder?: string;
		disabled?: boolean;
		compact?: boolean;
		direction?: 'auto' | 'up' | 'down';
		class?: string;
		id?: string;
		ariaLabel?: string;
		name?: string;
		onchange?: (value: string) => void;
	} = $props();

	let open = $state(false);
	let openUp = $state(false);
	let highlight = $state(-1);
	let root = $state<HTMLDivElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	const selected = $derived(options.find((o) => o.value === value) ?? null);

	/** Where should the popup open? 'auto' flips upward when the trigger sits
	 *  too close to the bottom of the viewport (e.g. selects in modal footers). */
	function shouldOpenUp(): boolean {
		if (direction === 'up') return true;
		if (direction === 'down') return false;
		const rect = root?.getBoundingClientRect();
		return rect ? rect.bottom + 280 > window.innerHeight : false;
	}

	function openPopup() {
		open = true;
		openUp = shouldOpenUp();
		highlight = currentIndex();
	}

	function currentIndex(): number {
		if (!selected) return 0;
		const i = options.findIndex((o) => o.value === selected.value);
		return i >= 0 ? i : 0;
	}

	function toggle() {
		if (disabled) return;
		if (open) {
			open = false;
		} else {
			openPopup();
		}
	}

	function choose(option: { value: string; label: string }) {
		value = option.value;
		open = false;
		onchange?.(option.value);
	}

	function onKeydown(event: KeyboardEvent) {
		if (disabled) return;
		if (!open) {
			if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
				event.preventDefault();
				openPopup();
			}
			return;
		}
		if (event.key === 'Escape' || event.key === 'Tab') {
			open = false;
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlight = Math.min(options.length - 1, highlight + 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlight = Math.max(0, highlight - 1);
		} else if (event.key === 'Home') {
			event.preventDefault();
			highlight = 0;
		} else if (event.key === 'End') {
			event.preventDefault();
			highlight = options.length - 1;
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			const option = options[highlight];
			if (option) choose(option);
		}
	}

	// Close when clicking outside the control.
	$effect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent) => {
			if (root && !root.contains(event.target as Node)) open = false;
		};
		document.addEventListener('pointerdown', onPointer);
		return () => document.removeEventListener('pointerdown', onPointer);
	});

	// Keep the highlighted option in view while navigating with the keyboard.
	$effect(() => {
		if (!open || highlight < 0 || !listEl) return;
		const el = listEl.querySelector(`[data-index="${highlight}"]`) as HTMLElement | null;
		el?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="relative {className}" bind:this={root}>
	<button
		type="button"
		{id}
		{name}
		aria-label={ariaLabel}
		aria-haspopup="listbox"
		aria-expanded={open}
		disabled={disabled}
		onclick={toggle}
		onkeydown={onKeydown}
		class="flex w-full items-center justify-between gap-2 rounded-lg border bg-surface text-sm font-medium select-none transition-colors {compact
			? 'h-8 px-2.5'
			: 'h-10 px-3'} {open
			? 'border-indigo-500 shadow-[0_0_0_3px_var(--color-indigo-100)]'
			: 'border-neutral-200 hover:border-neutral-300'} disabled:cursor-not-allowed disabled:opacity-60"
	>
		<span class="truncate {selected ? 'text-neutral-700' : 'text-neutral-400'}">
			{selected?.label ?? placeholder}
		</span>
		<span
			class="flex shrink-0 items-center justify-center rounded-full transition-colors {compact ? 'size-4' : 'size-5'} {open
				? 'bg-indigo-100 text-indigo-600'
				: 'bg-neutral-100 text-neutral-500'}"
		>
			<ChevronDown size={13} />
		</span>
	</button>

	{#if open}
		<div
			class="absolute inset-x-0 z-50 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-xl {openUp
				? 'bottom-full mb-1.5'
				: 'top-full mt-1.5'}"
			role="listbox"
			bind:this={listEl}
		>
			{#each options as option, i (option.value)}
				<button
					type="button"
					role="option"
					aria-selected={option.value === value}
					data-index={i}
					onclick={() => choose(option)}
					onpointerenter={() => (highlight = i)}
					class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm {option.value ===
					value
						? 'font-medium text-indigo-700'
						: 'text-neutral-600'} {highlight === i ? 'bg-indigo-50' : ''}"
				>
					<span class="truncate">{option.label}</span>
					{#if option.value === value}
						<Check size={14} class="shrink-0 text-indigo-600" />
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
