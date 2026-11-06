/**
 * Home delivery is disabled network-wide. Page kept so deep links / old bookmarks
 * show a clear operator message instead of a courier console.
 */
export function DeliveryPage(_props: {
  token: string;
  user: any;
  permissions: string[];
  branches: any[];
  onOpenOrder?: (orderId: number) => void;
}) {
  return (
    <div className="page-panel" data-testid="delivery-disabled">
      <div className="empty-state" role="status">
        <h2 className="empty-title">Yetkazib berish o‘chirilgan</h2>
        <p className="empty-desc">
          Uyga yetkazib berish xizmati tarmoq bo‘ylab o‘chirilgan. Buyurtmalar faqat filialdan olib ketish
          (pickup) orqali rasmiylashtiriladi. Kuryer biriktirish va yetkazish holatlari mavjud emas.
        </p>
      </div>
    </div>
  );
}
