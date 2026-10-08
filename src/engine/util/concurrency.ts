/**
 * Like Promise.all over `items`, but with at most `limit` calls in flight. Results keep input order.
 * After the first failure nothing new is started, and the rejection waits for the calls already in flight, so the caller
 * can clean up knowing nothing is still running.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  const failures: unknown[] = [];
  let next = 0;
  const worker = async () => {
    while (failures.length === 0 && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failures.length > 0) throw failures[0];
  return results;
}
