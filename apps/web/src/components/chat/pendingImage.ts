import type { PendingImage } from './composerTypes';

export async function fileToPendingImage(file: File): Promise<PendingImage> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const dataBase64 = btoa(binary);
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    name: file.name,
    mimeType: file.type || 'image/png',
    previewUrl: URL.createObjectURL(file),
    dataBase64,
  };
}

export function revokeImages(pending: PendingImage[]): void {
  for (const image of pending) URL.revokeObjectURL(image.previewUrl);
}
