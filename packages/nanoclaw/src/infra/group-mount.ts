import fs from 'fs';
import path from 'path';

import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';

export const TERMINAL_SOURCE_MOUNT_TARGETS = [
  'package.json',
  'tsconfig.json',
  'src',
] as const;

export function mountProjectSourceIntoGroup(groupFolder: string): void {
  const groupDir = resolveGroupFolderPath(groupFolder);
  const projectRoot = process.cwd();

  for (const target of TERMINAL_SOURCE_MOUNT_TARGETS) {
    const sourcePath = path.join(projectRoot, target);
    const destPath = path.join(groupDir, target);

    if (!fs.existsSync(sourcePath)) continue;
    if (fs.existsSync(destPath)) {
      try {
        const stat = fs.lstatSync(destPath);
        if (stat.isSymbolicLink()) {
          const currentTarget = fs.readlinkSync(destPath);
          if (currentTarget === sourcePath) continue;
          fs.unlinkSync(destPath);
        } else {
          continue;
        }
      } catch {
        continue;
      }
    }

    try {
      fs.symlinkSync(sourcePath, destPath);
      logger.info(
        { groupFolder, target, sourcePath },
        'Mounted project source into group workspace',
      );
    } catch (err) {
      logger.warn(
        { groupFolder, target, err },
        'Failed to mount project source into group workspace',
      );
    }
  }
}
