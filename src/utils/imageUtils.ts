export interface ConvertOptions {
  quality?: number;   // 0–1, default 0.85
  maxWidth?: number;  // px, default 1920
  maxHeight?: number; // px, default 1920
}

export async function convertToWebP(
  file: File,
  { quality = 0.85, maxWidth = 1920, maxHeight = 1920 }: ConvertOptions = {},
): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo cargar la imagen: ${file.name}`));
    };

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { naturalWidth: w, naturalHeight: h } = img;

      // Scale down if exceeds max dimensions, preserving aspect ratio
      if (w > maxWidth || h > maxHeight) {
        const ratio = Math.min(maxWidth / w, maxHeight / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Canvas not available — return original
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          const baseName = file.name.replace(/\.[^.]+$/, '');
          resolve(new File([blob], `${baseName}.webp`, { type: 'image/webp' }));
        },
        'image/webp',
        quality,
      );
    };

    img.src = url;
  });
}
