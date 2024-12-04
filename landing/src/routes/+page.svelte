<!-- Landing page for the extension -->
<script lang="ts">
	let startVideo = false;

	console.log('Developed by Alberto García <alberto@garcialnk.com>');
</script>

<a href="https://github.com/GarciaLnk/aisknet">
	<img
		src="/images/github-mark-white.svg"
		alt="GitHub repository"
		class="fixed top-4 right-8 bg-transparent m-4 w-8 h-8"
	/>
</a>
<div class="space-y-10 text-center flex flex-col items-center">
	<h1 class="h1">AIskNet</h1>
	<h2 class="h3 w-72 md:w-[480px] lg:w-auto">
		Locally-run AI extension that answers questions from your current webpage
	</h2>

	<div
		class="card overflow-hidden rounded-md aspect-video w-full md:w-[490px] lg:w-[832px] transition-all duration-200 ease-in"
	>
		<div class="vimeo-embed w-full h-full bg-black aspect-video grid relative rounded-md">
			{#if !startVideo}
				<button
					class="w-full h-full absolute inset-0 border-0 bg-cover rounded-md"
					style="background-image: url('/images/thumbnail.webp');"
					aria-label="Play AIskNet Demo"
					on:click={() => (startVideo = true)}
					on:keydown={() => (startVideo = true)}
				>
				</button>
				<button
					class="bg-primary-500 h-8 w-14 border-0 rounded-lg grid opacity-90 absolute place-self-center transition-all duration-200 ease-in
					before:aspect-square before:bg-white before:h-4 before:place-self-center
					lg:h-12 lg:w-20 lg:before:h-6
					md:h-10 md:w-16 md:before:h-5"
					aria-label="Play"
					on:click={() => (startVideo = true)}
				>
				</button>
			{:else}
				<iframe
					class="w-full h-full absolute inset-0 border-0 object-cover rounded-md"
					src="https://player.vimeo.com/video/837254499?h=4b73a14e34&color=ec4899&title=0&byline=0&portrait=0&autoplay=1"
					title="AIskNet Demo"
					frameborder="0"
					allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer"
				>
				</iframe>
			{/if}
		</div>
	</div>

	<div
		class="flex flex-col items-center lg:flex-row lg:items-start justify-between space-y-4 lg:space-y-0 lg:space-x-4"
	>
		<a
			class="card card-hover overflow-hidden rounded-lg w-40 md:w-44 lg:w-auto lg:h-16"
			href="https://chrome.google.com/webstore/detail/aisknet/liibjfofhopeoojijndnphmgkgfpcfbm"
		>
			<img src="/images/chrome-badge.webp" class="w-full h-full object-cover object-center" alt="Chrome" />
		</a>
		<a
			class="card card-hover overflow-hidden rounded-lg w-40 md:w-44 lg:w-auto lg:h-16"
			href="https://addons.mozilla.org/en-US/firefox/addon/aisknet/"
		>
			<img src="/images/firefox-badge.svg" class="w-full h-full object-cover object-center" alt="Firefox" />
		</a>
		<a
			class="card card-hover overflow-hidden rounded-lg w-40 md:w-44 lg:w-auto lg:h-16"
			href="https://microsoftedge.microsoft.com/addons/detail/aisknet/ljpkncjbemlcgopfnaijpdfnkcdcnlpj"
		>
			<img src="/images/edge-badge.svg" class="w-full h-full object-cover object-center" alt="Edge" />
		</a>
		<!-- <a class="card card-hover overflow-hidden rounded-lg w-40 md:w-44 lg:w-auto lg:h-16" href="/">
			<img src="/images/opera-badge.webp" class="w-full h-full object-cover object-center" alt="Opera" />
		</a> -->
	</div>
</div>

<style>
	.vimeo-embed button::before {
		clip-path: polygon(20% 0%, 20% 100%, 100% 50%);
		content: '';
	}
</style>
