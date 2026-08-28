import { useEffect, useRef, useState } from 'react';
import type { PendingImage } from './composerTypes';
import { fileToPendingImage, revokeImages } from './pendingImage';

export function useComposerImages() {
  const [images, setImages] = useState<PendingImage[]>([]);
  const imagesRef = useRef<PendingImage[]>([]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(
    () => () => {
      revokeImages(imagesRef.current);
    },
    [],
  );

  const clearImages = () => {
    setImages((prev) => {
      revokeImages(prev);
      return [];
    });
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (list.length === 0) return;
    const pending = await Promise.all(list.map(fileToPendingImage));
    setImages((prev) => {
      const next = [...prev, ...pending];
      const kept = next.slice(0, 6);
      revokeImages(next.slice(6));
      return kept;
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  return { images, clearImages, addFiles, removeImage };
}
