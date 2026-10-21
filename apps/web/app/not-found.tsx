import type { Metadata } from 'next';
import { ProductMark } from '@/components/shell/product-mark';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'ไม่พบหน้านี้' };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[480px] flex-col justify-center px-4 py-16">
      <ProductMark size={24} />
      <h1 className="mt-6 text-title font-medium text-text">ไม่พบหน้านี้</h1>
      <p className="mt-1 text-body text-muted">ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกลบไปแล้ว</p>
      <div className="mt-6">
        <ButtonLink href="/" variant="primary">
          กลับหน้าการวิเคราะห์
        </ButtonLink>
      </div>
    </main>
  );
}
