import {
  GAME_IMAGE_MAX_EDGE, GAME_IMAGE_UPLOAD_LIMIT, gameImageFileError,
} from "./gameCatalogImages";

/** Decode and re-encode uploads: no original metadata, scripts, or giant files are stored. */
export async function prepareGameCatalogImage(file: File): Promise<Blob> {
  const validationError = gameImageFileError(file);
  if (validationError) throw new Error(validationError);
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Gambar terlalu lama dibaca. Coba file lain.")), 15000);
      image.onload = () => { window.clearTimeout(timer); resolve(); };
      image.onerror = () => { window.clearTimeout(timer); reject(new Error("File tidak dapat dibaca sebagai gambar.")); };
      image.src = objectUrl;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > 32_000_000) {
      throw new Error("Resolusi gambar tidak valid atau melebihi 32 megapiksel. Perkecil gambar dahulu.");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak dapat memproses gambar. Coba browser terbaru.");
    for (const [maxEdge, quality] of [[GAME_IMAGE_MAX_EDGE, 0.86], [1280, 0.76], [960, 0.68]]) {
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      // Some browsers fall back to PNG when WebP encoding is unavailable.
      if (blob && ["image/webp", "image/png"].includes(blob.type) && blob.size > 0 && blob.size <= GAME_IMAGE_UPLOAD_LIMIT) return blob;
    }
    throw new Error("Gambar masih terlalu besar setelah dioptimalkan. Coba gambar yang lebih kecil.");
  } finally {
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}
