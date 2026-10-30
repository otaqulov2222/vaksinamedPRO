import { resolveImageUrl } from '@/lib/api';

export const PRODUCT_IMAGES: Record<string, any> = {
  'cat-p1': require('../assets/images/cat-p1-d3.png'),
  'cat-p2': require('../assets/images/cat-p2-c.png'),
  'cat-p3': require('../assets/images/cat-p3-mg.png'),
  'cat-p4': require('../assets/images/cat-p4-omega.png'),
  'cat-p5': require('../assets/images/cat-p5-zn.png'),
  'cat-p6': require('../assets/images/cat-p6-para.png'),
};

export type ProductImageTarget = {
  id?: number | string;
  analogGroup?: string;
  icon?: string;
  imageUrl?: string | null;
  image_url?: string | null;
};

export function getProductImage(item: ProductImageTarget | null | undefined): any {
  if (!item) return null;

  const url = item.imageUrl || item.image_url;
  if (url) {
    const resolved = resolveImageUrl(url);
    if (resolved) return { uri: resolved };
  }

  const id = Number(item.id);
  if (id === 1) return PRODUCT_IMAGES['cat-p1'];
  if (id === 2) return PRODUCT_IMAGES['cat-p2'];
  if (id === 3) return PRODUCT_IMAGES['cat-p3'];
  if (id === 4) return PRODUCT_IMAGES['cat-p4'];
  if (id === 5) return PRODUCT_IMAGES['cat-p5'];
  if (id === 6 || id === 7 || id === 8) return PRODUCT_IMAGES['cat-p6'];

  const group = String(item.analogGroup || '').toLowerCase();
  if (group.includes('vitamin-d')) return PRODUCT_IMAGES['cat-p1'];
  if (group.includes('vitamin-c')) return PRODUCT_IMAGES['cat-p2'];
  if (group.includes('magnesium')) return PRODUCT_IMAGES['cat-p3'];
  if (group.includes('omega')) return PRODUCT_IMAGES['cat-p4'];
  if (group.includes('zinc')) return PRODUCT_IMAGES['cat-p5'];
  if (group.includes('analgesic')) return PRODUCT_IMAGES['cat-p6'];

  return null;
}
