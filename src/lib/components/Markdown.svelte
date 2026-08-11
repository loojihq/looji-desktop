<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	let { text }: { text: string } = $props();
	let container = $state<HTMLDivElement | null>(null);

	marked.setOptions({ gfm: true, breaks: false });

	// The model replies in markdown; render it (sanitized) with prose typography.
	// In an SSR build there is no DOM, so sanitization is skipped there (this
	// component only ever renders client-side anyway).
	const html = $derived(
		typeof window === 'undefined'
			? (marked.parse(text, { async: false }) as string)
			: DOMPurify.sanitize(marked.parse(text, { async: false }) as string)
	);

	const COPY_ICON =
		'<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
	const CHECK_ICON =
		'<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

	async function copyText(value: string): Promise<boolean> {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
				return true;
			}
		} catch {
			// fall through to the legacy path below
		}
		try {
			const helper = document.createElement('textarea');
			helper.value = value;
			helper.setAttribute('readonly', '');
			helper.style.position = 'fixed';
			helper.style.opacity = '0';
			document.body.appendChild(helper);
			helper.select();
			const ok = document.execCommand('copy');
			helper.remove();
			return ok;
		} catch {
			return false;
		}
	}

	// Each time the rendered HTML changes, give every fenced code block a copy
	// button (top-right, revealed on hover of the block).
	$effect(() => {
		void html;
		if (!container) return;
		container.querySelectorAll('pre').forEach((pre) => {
			if (pre.dataset.wmEnhanced === '1') return;
			pre.dataset.wmEnhanced = '1';
			const code = pre.querySelector('code');
			const codeText = code?.textContent ?? '';

			const wrapper = document.createElement('div');
			wrapper.className = 'wm-codeblock relative';
			pre.replaceWith(wrapper);
			wrapper.appendChild(pre);

			const button = document.createElement('button');
			button.type = 'button';
			button.title = 'Copy code';
			button.ariaLabel = 'Copy code';
			button.className =
				'wm-copy-btn absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white/80 text-neutral-500 opacity-0 transition-opacity hover:bg-white hover:text-indigo-600 focus-visible:opacity-100';
			button.innerHTML = COPY_ICON;
			button.addEventListener('click', async () => {
				const ok = await copyText(codeText);
				button.innerHTML = CHECK_ICON;
				button.title = ok ? 'Copied' : 'Copy failed';
				setTimeout(() => {
					button.innerHTML = COPY_ICON;
					button.title = 'Copy code';
				}, 1500);
			});
			wrapper.appendChild(button);
		});
	});
</script>

<div class="prose prose-sm max-w-none" bind:this={container}>{@html html}</div>
