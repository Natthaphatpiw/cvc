import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Neutral banner on results and run pages when the data comes from demo fixtures. */
export function DemoBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn('mb-6 flex items-start gap-2.5 rounded-card border border-border bg-raised px-4 py-3 text-body text-text', className)}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
      <p>
        <span className="font-normal">ข้อมูลตัวอย่าง:</span> ยังไม่ได้ตั้งค่า API keys ผลลัพธ์นี้สร้างจากข้อมูลสมมติ
      </p>
    </div>
  );
}
