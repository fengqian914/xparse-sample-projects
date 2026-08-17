import type { ExtractResult, RequirementItem } from './types';

export async function fetchItems(): Promise<RequirementItem[]> {
  const res = await fetch('/api/items');
  if (!res.ok) throw new Error('加载基准库失败');
  const data = await res.json();
  return data.items;
}

export async function extractItems(
  itemIds: number[],
  onLog: (message: string) => void,
  onRow?: (result: ExtractResult) => void,
): Promise<ExtractResult[]> {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_ids: itemIds }),
  });
  if (!res.ok || !res.body) throw new Error(await res.text() || '抽取失败');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let results: ExtractResult[] | null = null;
  let error = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'log') onLog(event.message);
      if (event.type === 'row' && event.result) onRow?.(event.result);
      if (event.type === 'done') results = event.results;
      if (event.type === 'error') error = event.message;
    }
  }

  if (error) throw new Error(error);
  if (!results) throw new Error('抽取未返回结果');
  return results;
}
