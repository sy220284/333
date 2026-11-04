/**
 * Retrying a file append after mkdir is appropriate only when the parent
 * directory is absent. ENOSPC, EDQUOT, access errors and I/O failures must
 * be reported rather than masked by a second filesystem write.
 */
export function shouldRetrySessionAppendAfterMkdir(code) : boolean {
  return code === 'ENOENT'
}

/** Filesystem failures for which an unlocked config-write retry is unsafe. */
export function isUnrecoverableConfigWriteError(code) : boolean {
  return code === 'ENOSPC' || code === 'EDQUOT' || code === 'EROFS' ||
    code === 'EIO' || code === 'EACCES' || code === 'EPERM'
}
