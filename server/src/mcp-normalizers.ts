export interface NormalizedMcpResult {
  providerId: string;
  tool: string;
  ok: boolean;
  summary: string;
  structured: unknown;
  text: string[];
  rawType: string;
}

function textFromContent(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((item: any) => {
    if (typeof item === 'string') return [item];
    if (item && typeof item.text === 'string') return [item.text];
    return [];
  }).slice(0, 200);
}

export function normalizeMcpResult(providerId: string, tool: string, result: unknown): NormalizedMcpResult {
  const value: any = result;
  if (value && typeof value === 'object') {
    const content = textFromContent(value.content);
    const structured = value.structuredContent ?? value.data ?? value.result ?? value;
    const text = content.length ? content : textFromContent(value.result);
    return { providerId, tool, ok: value.isError !== true, summary: text[0]?.slice(0, 500) || (value.isError ? 'provider returned an error result' : 'structured MCP result'), structured, text, rawType: 'object' };
  }
  if (typeof result === 'string') return { providerId, tool, ok: true, summary: result.slice(0, 500), structured: null, text: result.split(/\r?\n/).slice(0, 200), rawType: 'string' };
  return { providerId, tool, ok: true, summary: 'MCP result received', structured: result ?? null, text: [], rawType: result === null ? 'null' : typeof result };
}
