export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';
export interface ImageRequest { prompt: string; refs: Blob[]; size: ImageSize; signal?: AbortSignal }
export interface ImageResult { blob: Blob; backend: string; promptId?: string; seconds: number }
export interface Detection { available: boolean; detail: string }
export interface HarnessAdapter {
  id: string; label: string;
  capabilities: {generate: boolean; edit: boolean; promptHelp: boolean};
  detect(): Promise<Detection>;
  generateImage(request: ImageRequest): Promise<ImageResult>;
  editImage(request: ImageRequest): Promise<ImageResult>;
  helpPrompt?(prompt: string, signal?: AbortSignal): Promise<string>;
}
export type Fetcher = typeof fetch;
export function endpoint(raw: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) URL without embedded credentials, query or fragment.');
  return url.href.replace(/\/$/, '');
}
export async function checked(fetcher: Fetcher, url: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  const response = await fetcher(url, {...init, signal});
  if (!response.ok) throw new Error(`Harness HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  return response;
}
export async function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve,reject) => {
    const cancel = () => {clearTimeout(timer); reject(signal.reason)};
    const timer = setTimeout(() => {signal.removeEventListener('abort',cancel); resolve()}, ms);
    signal.addEventListener('abort',cancel,{once:true});
  });
}
