// 64-bit difference hash (dHash) of a photo, computed in the browser.  Must
// match hash_images.py in the collector: shrink so the longest side is at
// most 128 px, greyscale 299/587/114, average into 9x8 cells, then per row
// one bit per neighbouring pair (1 = left brighter), MSB first, 16 hex chars.

export async function dhashFile(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  const cells = Array.from({ length: 8 }, () => new Array<number>(9).fill(0));
  const counts = Array.from({ length: 8 }, () => new Array<number>(9).fill(0));
  for (let y = 0; y < height; y++) {
    const cy = Math.min(7, Math.floor((y * 8) / height));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(8, Math.floor((x * 9) / width));
      const i = (y * width + x) * 4;
      cells[cy][cx] += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      counts[cy][cx] += 1;
    }
  }
  let hex = "";
  let nibble = 0;
  let n = 0;
  for (let cy = 0; cy < 8; cy++) {
    const avg = cells[cy].map((sum, cx) => sum / Math.max(1, counts[cy][cx]));
    for (let cx = 0; cx < 8; cx++) {
      nibble = (nibble << 1) | (avg[cx] > avg[cx + 1] ? 1 : 0);
      if (++n % 4 === 0) {
        hex += nibble.toString(16);
        nibble = 0;
      }
    }
  }
  return hex;
}

function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Hamming distance between two 16-hex-char hashes (0 = identical, 64 = opposite). */
export function hashDistance(a: string, b: string): number {
  return popcount32((parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0) + popcount32((parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16)) >>> 0);
}
