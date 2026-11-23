const MAX_SIDE = 1280;
const QUALITY = 0.85;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a picked photo as a `data:` URL, downscaled to at most 1280px and
 * re-encoded as JPEG. Phone cameras produce 5–12 MB images; the KYC upload
 * stays well under the API body limit and EXIF metadata (GPS!) is dropped.
 * Falls back to the original file when the browser cannot decode it.
 */
export async function imageToDataUrl(file: File): Promise<string> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return readAsDataUrl(file);
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return readAsDataUrl(file);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', QUALITY);
  } catch {
    return readAsDataUrl(file);
  }
}
