export function generateId(prefix = 'id'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'id';
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `${cleanPrefix}_${time}_${rand}`;
}
