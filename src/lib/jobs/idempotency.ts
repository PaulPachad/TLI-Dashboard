const activeJobs = new Set<string>();

export function tryStartJob(key: string): boolean {
  if (activeJobs.has(key)) return false;
  activeJobs.add(key);
  return true;
}

export function finishJob(key: string): void {
  activeJobs.delete(key);
}

export function isJobRunning(key: string): boolean {
  return activeJobs.has(key);
}
