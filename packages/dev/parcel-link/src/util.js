// @flow strict-local

import child_process from 'child_process';
import path from 'path';

import type {FileSystem} from '@parcel/fs';

export type CmdOptions = {|
  appRoot: string,
  packageRoot: string,
  dryRun: boolean,
  fs: FileSystem,
  log: (...data: mixed[]) => void,
|};

export async function fsWrite(
  f: string,
  content: string,
  {appRoot, log, dryRun, fs}: CmdOptions,
): Promise<void> {
  log('Writing', path.join('<app>', path.relative(appRoot, f)));
  if (!dryRun) {
    return fs.writeFile(f, content);
  }
}

export async function fsDelete(
  f: string,
  {appRoot, log, dryRun, fs}: CmdOptions,
): Promise<void> {
  log('Deleting', path.join('<app>', path.relative(appRoot, f)));
  if (!dryRun) {
    return fs.rimraf(f);
  }
}

export async function fsSymlink(
  source: string,
  target: string,
  {appRoot, log, dryRun, fs}: CmdOptions,
): Promise<void> {
  log(
    'Symlink',
    source,
    '->',
    path.join('<app>', path.relative(appRoot, target)),
  );
  if (!dryRun) {
    return fs.symlink(source, target);
  }
}

export async function findParcelPackages(
  fs: FileSystem,
  rootDir: string,
  files: Map<string, string> = new Map(),
): Promise<Map<string, string>> {
  for (let file of fs.readdirSync(rootDir)) {
    if (file === 'node_modules') continue;
    let projectPath = path.join(rootDir, file);
    const stats = fs.statSync(projectPath);
    if (stats && stats.isDirectory()) {
      let packagePath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packagePath)) {
        let pack = JSON.parse(await fs.readFile(packagePath, 'utf8'));
        if (!pack.private) {
          files.set(pack.name, projectPath);
        }
      } else {
        await findParcelPackages(fs, projectPath, files);
      }
    }
  }
  return files;
}

export function mapNamespacePackageAliases(
  ns: string,
  parcelPackages: Map<string, string>,
): Map<string, string> {
  let aliasesToParcelPackages = new Map();
  for (let packageName of parcelPackages.keys()) {
    if (packageName.startsWith(ns)) {
      continue;
    }
    aliasesToParcelPackages.set(
      packageName === 'parcel'
        ? `${ns}/parcel`
        : packageName === 'parcelforvscode'
        ? `${ns}/parcelforvscode`
        : packageName.replace(/^@parcel\//, `${ns}/parcel-`),
      packageName,
    );
  }
  return aliasesToParcelPackages;
}

export async function cleanupNodeModules(
  root: string,
  predicate: (filepath: string) => boolean,
  opts: CmdOptions,
): Promise<void> {
  let {fs} = opts;
  for (let dirName of fs.readdirSync(root)) {
    let dirPath = path.join(root, dirName);
    if (dirName === '.bin') {
      let binSymlink = path.join(root, '.bin/parcel');
      try {
        await fsDelete(binSymlink, opts);
      } catch (e) {
        // noop
      }
      continue;
    }
    if (dirName[0].startsWith('@')) {
      await cleanupNodeModules(dirPath, predicate, opts);
      continue;
    }

    let packageName;
    let parts = dirPath.split(path.sep).slice(-2);
    if (parts[0].startsWith('@')) {
      packageName = parts.join('/');
    } else {
      packageName = parts[1];
    }

    // -------

    if (predicate(packageName)) {
      await fsDelete(dirPath, opts);
    }

    // -------

    let packageNodeModules = path.join(root, dirName, 'node_modules');
    let stat;
    try {
      stat = fs.statSync(packageNodeModules);
    } catch (e) {
      // noop
    }
    if (stat?.isDirectory()) {
      await cleanupNodeModules(packageNodeModules, predicate, opts);
    }
  }
}

export function execSync(
  cmd: string,
  {appRoot, log, dryRun}: CmdOptions,
): void {
  log('Executing', cmd);
  if (!dryRun) {
    child_process.execSync(cmd, {cwd: appRoot, stdio: 'inherit'});
  }
}
