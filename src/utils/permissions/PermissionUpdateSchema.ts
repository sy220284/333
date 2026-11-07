/**
 * Zod schemas for permission updates.
 *
 * This file is intentionally kept minimal with no complex dependencies
 * so it can be safely imported by src/types/hooks.ts without creating
 * circular dependencies.
 */
import z from 'zod/v4'
// Types extracted to src/types/permissions.ts to break import cycles
import type {
  PermissionUpdate,
  PermissionUpdateDestination,
} from '../../types/permissions.js'
import { lazySchema } from '../lazySchema.js'
import { PermissionUpdateSchema } from '../../entrypoints/sdk/coreSchemas.js'

// Re-export for backwards compatibility
export type { PermissionUpdate, PermissionUpdateDestination }

/**
 * PermissionUpdateDestination is where a new permission rule should be saved to.
 */
export const permissionUpdateDestinationSchema = lazySchema(() =>
  z.enum([
    // User settings (global)
    'userSettings',
    // Project settings (shared per-directory)
    'projectSettings',
    // Local settings (gitignored)
    'localSettings',
    // In-memory for the current session only
    'session',
    // From the command line arguments
    'cliArg',
  ]),
)

// Share the SDK's versioned runtime parser; the legacy parallel schema
// excluded 'auto' and split hook/remote permission types from actual SDK events.
export const permissionUpdateSchema = PermissionUpdateSchema
