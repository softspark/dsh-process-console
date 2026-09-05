/**
 * Dictionaries for the Processes tab.
 * @module @softspark/dsh-process-console/client/locales
 */

/** Locale namespace owned by this package. */
export const NS = 'process-console'

/** Every key this package translates. */
export type ProcessConsoleKey =
  | 'view.processes'
  | 'tree.title'
  | 'tree.main'
  | 'tree.running'
  | 'tree.idle'
  | 'console.follow'
  | 'console.filter'
  | 'console.raw'
  | 'console.loadOlder'
  | 'console.loadingOlder'
  | 'console.empty'
  | 'console.cold'
  | 'console.loading'
  | 'console.error'
  | 'console.unavailable'
  | 'console.copy'
  | 'console.copied'
  | 'console.showMore'
  | 'console.showLess'
  | 'console.openError'
  | 'line.user'
  | 'line.context'
  | 'line.steer'
  | 'line.assistant'
  | 'line.reasoning'
  | 'line.request'
  | 'line.response'
  | 'line.running'
  | 'line.system'
  | 'line.pending'
  | 'line.partial'
  | 'line.error'

/** English dictionary. */
export const en: Record<ProcessConsoleKey, string> = {
  'view.processes': 'Processes',
  'tree.title': 'Processes',
  'tree.main': 'main',
  'tree.running': 'running',
  'tree.idle': 'idle',
  'console.follow': 'Follow',
  'console.filter': 'Filter lines…',
  'console.raw': 'Raw',
  'console.loadOlder': 'Load older',
  'console.loadingOlder': 'Loading…',
  'console.empty': 'No events yet',
  'console.cold': 'Opening window…',
  'console.loading': 'Loading history…',
  'console.error': 'The session window could not be opened',
  'console.unavailable': 'This process is not reachable from the current session',
  'console.copy': 'Copy',
  'console.copied': 'Copied',
  'console.showMore': 'Show more',
  'console.showLess': 'Show less',
  'console.openError': 'Error',
  'line.user': 'USER',
  'line.context': 'CTX',
  'line.steer': 'STEER',
  'line.assistant': 'ASSIST',
  'line.reasoning': 'THINK',
  'line.request': 'CALL',
  'line.response': 'RESULT',
  'line.running': 'RUNNING',
  'line.system': 'SYS',
  'line.pending': 'WAIT',
  'line.partial': 'STREAM',
  'line.error': 'ERROR',
}

/**
 * Chinese dictionary.
 *
 * `zh` and `en` are the locales the harness's dictionary type admits; a third
 * language would typecheck nowhere and render nowhere.
 */
export const zh: Record<ProcessConsoleKey, string> = {
  'view.processes': '进程',
  'tree.title': '进程',
  'tree.main': '主进程',
  'tree.running': '运行中',
  'tree.idle': '空闲',
  'console.follow': '跟随',
  'console.filter': '筛选行…',
  'console.raw': '原始',
  'console.loadOlder': '加载更早',
  'console.loadingOlder': '加载中…',
  'console.empty': '暂无事件',
  'console.cold': '正在打开窗口…',
  'console.loading': '正在加载历史…',
  'console.error': '无法打开会话窗口',
  'console.unavailable': '当前会话无法访问该进程',
  'console.copy': '复制',
  'console.copied': '已复制',
  'console.showMore': '展开',
  'console.showLess': '收起',
  'console.openError': '错误',
  'line.user': 'USER',
  'line.context': 'CTX',
  'line.steer': 'STEER',
  'line.assistant': 'ASSIST',
  'line.reasoning': 'THINK',
  'line.request': 'CALL',
  'line.response': 'RESULT',
  'line.running': 'RUNNING',
  'line.system': 'SYS',
  'line.pending': 'WAIT',
  'line.partial': 'STREAM',
  'line.error': 'ERROR',
}

/** The namespace type the slots service merges into its locale map. */
export type NS = typeof NS
