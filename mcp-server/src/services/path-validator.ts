/**
 * Path validation utility to prevent path traversal attacks.
 * All user-provided file paths must go through this before any fs operations.
 */

import { resolve, normalize, sep } from 'path';
import { homedir } from 'os';
import { join } from 'path';

// Allowed base directories for file operations
const ALLOWED_ROOTS = [
  // ESO SavedVariables
  normalize(join(homedir(), 'Documents', 'Elder Scrolls Online')),
  // ESO AddOns (OneDrive paths too)
  normalize(join(homedir(), 'OneDrive', 'Documents', 'Elder Scrolls Online')),
  // Project data directory
  normalize(resolve(join(import.meta.dirname || '.', '..', '..', '..', 'data'))),
  // Project addon_Libs directory
  normalize(resolve(join(import.meta.dirname || '.', '..', '..', '..', 'addon_Libs'))),
];

/**
 * Validate that a path is within allowed directories and doesn't contain traversal.
 * Returns the resolved absolute path if valid, or throws an error.
 */
export function validatePath(userPath: string, allowedExtensions?: string[]): string {
  // Reject obvious traversal attempts
  if (userPath.includes('..')) {
    throw new PathValidationError(`Path contains '..': ${userPath}`);
  }

  // Resolve to absolute path
  const resolved = resolve(userPath);
  const normalized = normalize(resolved);

  // Check if path is within any allowed root (append separator to prevent prefix tricks)
  const isAllowed = ALLOWED_ROOTS.some(root =>
    normalized === root || normalized.startsWith(root + sep)
  );
  if (!isAllowed) {
    throw new PathValidationError(
      `Path is outside allowed directories: ${userPath}\n` +
      `Allowed: ESO Documents folder, project data/addon_Libs`
    );
  }

  // Check file extension if restrictions given
  if (allowedExtensions && allowedExtensions.length > 0) {
    const hasValidExt = allowedExtensions.some(ext =>
      normalized.toLowerCase().endsWith(ext.toLowerCase())
    );
    if (!hasValidExt) {
      throw new PathValidationError(
        `File extension not allowed. Expected: ${allowedExtensions.join(', ')}`
      );
    }
  }

  return normalized;
}

/**
 * Validate a path specifically for SavedVariables files.
 */
export function validateSavedVarsPath(userPath: string): string {
  return validatePath(userPath, ['.lua']);
}

/**
 * Validate a path for addon directories.
 */
export function validateAddonPath(userPath: string): string {
  return validatePath(userPath);
}

/**
 * Validate a path for addon manifest files.
 */
export function validateManifestPath(userPath: string): string {
  return validatePath(userPath, ['.txt']);
}

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathValidationError';
  }
}
