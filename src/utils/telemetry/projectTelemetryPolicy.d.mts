/** Privacy boundary for telemetry variables sourced from settings files. */
export declare function isPrivilegedTelemetrySetting(
  name: string,
  value: string,
): boolean

export declare function resolveProjectTelemetryEnv(
  mergedEnv: Record<string, string>,
  trustedEnv: Record<string, string>,
): Record<string, string>
