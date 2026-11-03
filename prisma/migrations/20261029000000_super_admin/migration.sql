-- Preserve existing accounts while renaming the administrator role.
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';
