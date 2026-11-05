type Result<T> = { success: true; data: T } | { success: false }
type CachedGetter<T> = (() => Promise<Result<T>>) & {
  cache?: { clear?: () => void }
}

export declare function fetchPrivacySettingsFresh<TSettings, TConfig>(
  getSettings: CachedGetter<TSettings>,
  getConfig: () => Promise<Result<TConfig>>,
): Promise<
  | { success: true; settings: TSettings; config: TConfig }
  | { success: false }
>
