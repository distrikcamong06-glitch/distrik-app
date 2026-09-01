// Resizes + re-encodes an image client-side before upload, so a 4-5MB phone
// photo doesn't get stored (and re-downloaded by every visitor) at full
// resolution when it only ever renders inside a small square thumbnail.
export async function compressImage(file: File, maxDimension = 1200, quality = 0.82): Promise<File> {
  // Animated GIFs would lose their animation if redrawn to a canvas.
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    // If compression fails for any reason, fall back to the original file
    // rather than blocking the upload.
    return file;
  }
}
