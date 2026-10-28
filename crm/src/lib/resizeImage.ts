// Browser-only: shrink a phone photo to at most `maxSide` px (JPEG) before upload.
export async function resizeImage(file: File, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.82));
}

/** Upload photos one by one to an endpoint that takes a "file" form field. */
export async function uploadPhotos(endpoint: string, files: File[], onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  for (const file of files) {
    onProgress?.(done, files.length);
    const form = new FormData();
    form.append("file", new File([await resizeImage(file)], "photo.jpg", { type: "image/jpeg" }));
    const response = await fetch(endpoint, { method: "POST", body: form });
    done += 1;
    const result = await response.json().catch(() => ({}));
    if (result.full) break;
  }
  onProgress?.(done, files.length);
}
