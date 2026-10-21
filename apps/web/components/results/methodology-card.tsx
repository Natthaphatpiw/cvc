import type { FinalResult } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDateTh, formatNumber, formatPct } from '@/lib/format';
import { GROUP_LABEL, GROUP_ORDER, OBJECTIVE_LABEL } from './labels';

/** How the ranking was computed: preset, weights, pool size, sources, data date, caveats. */
export function MethodologyCard({ methodology, isPreview }: { methodology: FinalResult['methodology']; isPreview?: boolean }) {
  return (
    <Card>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 text-label font-light text-muted">
          <span>สูตรน้ำหนัก</span>
          <Badge tone="accent">{OBJECTIVE_LABEL[methodology.preset]}</Badge>
          {isPreview ? <Badge tone="warning">ปรับเอง ยังไม่บันทึก</Badge> : null}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <table className="w-full text-body font-light">
            <caption className="sr-only">น้ำหนักของแต่ละกลุ่มคะแนน</caption>
            <thead>
              <tr className="bg-raised">
                <th scope="col" className="h-8 rounded-l-chip px-3 text-left text-meta font-normal text-muted">
                  กลุ่มคะแนน
                </th>
                <th scope="col" className="h-8 rounded-r-chip px-3 text-right text-meta font-normal text-muted">
                  น้ำหนัก
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {GROUP_ORDER.map((g) => (
                <tr key={g} className="border-b border-rule last:border-b-0">
                  <th scope="row" className="h-9 px-3 text-left font-light">{GROUP_LABEL[g]}</th>
                  <td className="h-9 px-3 text-right">{formatPct(methodology.weights[g], 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-2 text-body font-light">
            <dt className="text-muted">ครีเอเตอร์ที่สแกน</dt>
            <dd className="text-right tabular-nums">{formatNumber(methodology.candidatesScanned)} คน</dd>
            <dt className="text-muted">ประเมินละเอียด</dt>
            <dd className="text-right tabular-nums">{formatNumber(methodology.candidatesEvaluated)} คน</dd>
            <dt className="text-muted">น้ำหนักข้อมูลประชากรจริง</dt>
            <dd className="text-right tabular-nums">{formatPct(methodology.effectiveDemographicWeight, 0)}</dd>
            <dt className="text-muted">ข้อมูล ณ วันที่</dt>
            <dd className="text-right tabular-nums">{formatDateTh(methodology.dataAsOf)}</dd>
          </dl>
        </div>

        {methodology.dataSources.length > 0 ? (
          <div>
            <h3 className="text-label font-normal text-text">แหล่งข้อมูล</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {methodology.dataSources.map((s) => (
                <li key={s}>
                  <Badge tone="neutral">{s}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {methodology.caveatsTh.length > 0 ? (
          <div className="rounded-control bg-warning-soft px-4 py-3">
            <h3 className="text-label font-normal text-warning">ข้อควรระวัง</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-label font-light text-text">
              {methodology.caveatsTh.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
