/**
 * Host loader entry for the browser-only process-console plugin.
 *
 * DSH resolves a plugin row's name on the host first, even for a row whose
 * behaviour is entirely in the browser: it imports this module, then reads the
 * package's `dsh.client` declaration to decide what to serve the page. So the
 * row must name the package root, and the root must be Node-importable.
 * Nothing belongs here: the tab, its data source and its dictionaries all
 * live in `./client`.
 * @module @softspark/dsh-process-console
 */

/** Host plugin body. The browser half owns all behaviour. */
export function apply(): void {}

export default apply
