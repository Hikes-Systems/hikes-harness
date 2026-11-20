/**
 * Node marks `node:sqlite` experimental and prints a warning on every
 * launch. Hikes silences it once, before the database module loads it.
 *
 * `server/db.ts` imports this file first and then loads `node:sqlite` on
 * demand, so the patch is always in place before the warning is emitted.
 */
const original = process.emitWarning.bind(process);

process.emitWarning = (warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : (warning as Error)?.message ?? "";
  if (/SQLite is an experimental feature/i.test(text)) return;
  (original as (...args: unknown[]) => void)(warning, ...rest);
};
