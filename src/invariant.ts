/**
 * Package-owned invariant companion.
 *
 * A broken invariant is a bug in this package, never a user error, so the
 * message names the package: a stack trace in someone else's harness should
 * say whose fault it is without further digging.
 * @module @softspark/dsh-process-console/invariant
 */

const PACKAGE_NAME = '@softspark/dsh-process-console'

/** Fail loudly when an assumption this package owns turns out to be false. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (condition) return
  throw new Error(`${PACKAGE_NAME}: ${message}`)
}
