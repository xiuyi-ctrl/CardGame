const pendingImages = new Map<string, Promise<HTMLImageElement>>();
const decodedImages = new Map<string, HTMLImageElement>();

export function getDecodedImage(src: string): HTMLImageElement | undefined {
  return decodedImages.get(src);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const pending = pendingImages.get(src);
  if (pending) return pending;

  const image = new Image();
  let decoded: Promise<void>;
  if (typeof image.decode === 'function') {
    image.src = src;
    decoded = image.decode();
  } else {
    decoded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      image.src = src;
    });
  }
  const promise = decoded.then(() => {
    decodedImages.set(src, image);
    return image;
  }).catch((error: unknown) => {
    pendingImages.delete(src);
    throw error;
  });
  pendingImages.set(src, promise);
  return promise;
}

export function preloadImages(sources: string[]): Promise<void> {
  return Promise.allSettled([...new Set(sources)].map(loadImage)).then(() => {});
}
