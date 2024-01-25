<script lang="ts">
	import '../app.postcss';
	import { AppShell } from '@skeletonlabs/skeleton';
</script>

<AppShell>
	<div class="container h-full mx-auto flex justify-center items-center p-10">
		<!-- Page Route Content -->
		<slot />
	</div>
</AppShell>
