import { relative, resolve, sep } from 'node:path';

export function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function parseTypeScriptErrors(output) {
  const errors = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
    if (match) errors.push({ path: normalizePath(match[1]), line: Number(match[2]), column: Number(match[3]), code: match[4], message: match[5] });
  }
  return errors;
}

export function relativeFiles(root, files) {
  const prefix = resolve(root) + sep;
  return [...new Set(files.map(file => {
    const absolute = resolve(root, file);
    if (!absolute.startsWith(prefix)) throw new Error('拒绝仓库外路径: ' + file);
    return normalizePath(relative(root, absolute));
  }))].sort();
}

export function nativeMagic(buffer, platform) {
  if (buffer.length < 4) return false;
  if (platform === 'linux') return buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  if (platform === 'win32') return buffer.subarray(0, 2).toString('ascii') === 'MZ';
  if (platform === 'darwin') {
    return ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca'].includes(buffer.subarray(0, 4).toString('hex'));
  }
  throw new Error('不支持的平台: ' + platform);
}
