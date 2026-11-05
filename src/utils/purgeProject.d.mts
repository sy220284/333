export type PurgeItem = { path: string; kind: 'dir' | 'file' | 'config-key' | 'history-lines' | 'history-siblings'; reason?: string; matchPaths?: string[] }
export function planPurge(home: string, project?: string, options?: { all?: boolean; projectKeys?: string[]; configAliases?: string[] }): Promise<{ items: PurgeItem[]; warnings: string[] }>
export function executePurgeItem(item: PurgeItem, options?: { removeProject?: (key: string) => Promise<void> }): Promise<void>
