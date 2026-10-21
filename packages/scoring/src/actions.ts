import type { NextAction, Objective } from '@cvc/schemas';
import { FORMAT_LABEL_TH, describePostingWindowTh, type PlaybookHints } from './playbook';

const byDue = (a: NextAction, b: NextAction): number => a.dueInDays - b.dueInDays;

/** Campaign-level actions plus one outreach action per creator. dueInDays counts from shortlist confirmation. */
export function baseNextActions(args: { objective: Objective; creators: { creatorId: string; handle: string }[] }): NextAction[] {
  const { objective, creators } = args;
  const out: NextAction[] = creators.map((c) => ({
    id: `outreach-${c.creatorId}`,
    titleTh: `ติดต่อ @${c.handle}`,
    detailTh: 'ส่งข้อความแนะนำแคมเปญ เช็กคิวว่าง เรตจริง และประวัติการรับงานแบรนด์คู่แข่ง',
    owner: 'planner',
    category: 'outreach',
    dueInDays: 2,
    creatorId: c.creatorId,
  }));

  const campaign = (a: Omit<NextAction, 'creatorId'>): NextAction => ({ ...a, creatorId: null });
  out.push(
    campaign({
      id: 'client-confirm-shortlist',
      titleTh: 'ลูกค้ายืนยันรายชื่อและงบประมาณ',
      detailTh: 'ยืนยันตัวจริง ตัวสำรอง และกรอบงบรวมก่อนเริ่มเจรจาค่าจ้าง',
      owner: 'client',
      category: 'outreach',
      dueInDays: 3,
    }),
    campaign({
      id: 'brief-master',
      titleTh: 'เขียน brief กลางของแคมเปญ',
      detailTh: 'ข้อความหลัก จุดเด่นสินค้า สิ่งที่ห้ามพูด การติด #โฆษณา และกำหนดส่งงาน',
      owner: 'planner',
      category: 'brief',
      dueInDays: 4,
    }),
    campaign({
      id: 'client-approve-brief',
      titleTh: 'ลูกค้าอนุมัติ brief',
      detailTh: 'ตรวจข้อความหลักและคำกล่าวอ้างของสินค้าให้ถูกต้องตามข้อเท็จจริงและข้อกฎหมาย',
      owner: 'client',
      category: 'brief',
      dueInDays: 6,
    }),
    campaign({
      id: 'contract-terms',
      titleTh: 'ทำสัญญากับครีเอเตอร์',
      detailTh: 'ค่าจ้างและงวดจ่าย สิทธิ์การใช้คอนเทนต์ ระยะห้ามรับงานคู่แข่ง และการส่งรหัส Spark Ads',
      owner: 'planner',
      category: 'contract',
      dueInDays: 9,
    }),
  );

  if (objective === 'conversion') {
    out.push(
      campaign({
        id: 'client-tracking-assets',
        titleTh: 'ลูกค้าส่งลิงก์สินค้าและโค้ดส่วนลด',
        detailTh: 'ลิงก์หน้าสินค้าที่ใช้ทำ UTM และโค้ดส่วนลดแยกรายครีเอเตอร์ (ถ้ามี)',
        owner: 'client',
        category: 'tracking',
        dueInDays: 7,
      }),
      campaign({
        id: 'tracking-utm',
        titleTh: 'สร้างลิงก์ UTM แยกรายครีเอเตอร์',
        detailTh: 'ตั้งค่า utm_source=tiktok, utm_medium=influencer และ utm_content เป็นชื่อบัญชีของแต่ละคน',
        owner: 'planner',
        category: 'tracking',
        dueInDays: 10,
      }),
    );
  } else if (objective === 'tiktok_shop') {
    out.push(
      campaign({
        id: 'client-shop-affiliate',
        titleTh: 'ลูกค้าเปิดสินค้าในโปรแกรม affiliate ของ TikTok Shop',
        detailTh: 'กำหนดอัตราค่าคอมมิชชันและส่งคำเชิญให้ครีเอเตอร์ในรายชื่อ',
        owner: 'client',
        category: 'tracking',
        dueInDays: 7,
      }),
      campaign({
        id: 'tracking-affiliate-codes',
        titleTh: 'ตรวจลิงก์และโค้ด affiliate ของทุกคน',
        detailTh: 'ยืนยันว่าครีเอเตอร์ทุกคนผูกสินค้าในตะกร้าได้และติดตามยอดขายรายคนได้',
        owner: 'planner',
        category: 'tracking',
        dueInDays: 10,
      }),
    );
  } else {
    out.push(
      campaign({
        id: 'tracking-spark-ads',
        titleTh: 'เตรียมบัญชีโฆษณาสำหรับ Spark Ads',
        detailTh: 'ตั้งงบบูสต์และกลุ่มเป้าหมาย เพื่อใช้กับรหัส Spark Ads ที่ได้จากครีเอเตอร์',
        owner: 'client',
        category: 'tracking',
        dueInDays: 10,
      }),
    );
  }

  out.push(
    campaign({
      id: 'launch-schedule',
      titleTh: 'วางตารางโพสต์ของทุกคน',
      detailTh: 'กระจายวันโพสต์ตามช่วงเวลาที่แนะนำของแต่ละคน และไม่ให้ชนกันในวันเดียว',
      owner: 'planner',
      category: 'launch',
      dueInDays: 14,
    }),
    campaign({
      id: 'report-7d',
      titleTh: 'สรุปผล 7 วันหลังโพสต์',
      detailTh: 'รวมยอดวิว เอ็นเกจ ต้นทุนต่อวิว และยอดคลิกหรือยอดขาย เทียบกับช่วงที่คาดการณ์',
      owner: 'planner',
      category: 'report',
      dueInDays: 28,
    }),
    campaign({
      id: 'report-outcomes',
      titleTh: 'บันทึกผลจริงเพื่อปรับเทียบ',
      detailTh: 'บันทึกผลของแต่ละคนลงระบบ เพื่อให้การคาดการณ์รอบถัดไปแม่นขึ้น',
      owner: 'planner',
      category: 'report',
      dueInDays: 30,
    }),
  );
  return out.sort(byDue);
}

/** Per-creator actions derived from the playbook hints. Ids are stable: '<kind>-<creatorId>'. */
export function creatorNextActions(args: { creatorId: string; handle: string; playbook: PlaybookHints; objective: Objective }): NextAction[] {
  const { creatorId, handle, playbook, objective } = args;
  const at = `@${handle}`;
  const act = (a: Omit<NextAction, 'creatorId'>): NextAction => ({ ...a, creatorId });
  const out: NextAction[] = [];
  const formats = playbook.recommendedFormats;

  if (playbook.collaborationModel === 'gifting') {
    out.push(
      act({
        id: `gifting-${creatorId}`,
        titleTh: `ส่งสินค้าให้ ${at} ทดลองใช้`,
        detailTh: 'ส่งสินค้าพร้อมข้อมูลจุดเด่น และตกลงจำนวนคอนเทนต์ที่จะได้รับ',
        owner: 'planner',
        category: 'outreach',
        dueInDays: 3,
      }),
    );
  }

  out.push(
    act({
      id: `brief-${creatorId}`,
      titleTh: `ส่ง brief ให้ ${at}`,
      detailTh: `รูปแบบที่แนะนำ: ${formats.map((f) => FORMAT_LABEL_TH[f]).join(', ')}`,
      owner: 'planner',
      category: 'brief',
      dueInDays: 5,
    }),
  );

  if (playbook.collaborationModel === 'hybrid' || playbook.collaborationModel === 'affiliate_commission') {
    out.push(
      act({
        id: `commission-${creatorId}`,
        titleTh: `ตกลงค่าคอมมิชชันกับ ${at}`,
        detailTh:
          playbook.collaborationModel === 'hybrid'
            ? 'ค่าจ้างคงที่ส่วนหนึ่งบวกค่าคอมมิชชันตามยอดขาย ระบุอัตราและรอบการจ่ายในสัญญา'
            : 'จ่ายตามยอดขายผ่านค่าคอมมิชชัน ระบุอัตราและรอบการจ่ายให้ชัดเจน',
        owner: 'planner',
        category: 'contract',
        dueInDays: 8,
      }),
    );
  }

  if (objective === 'conversion') {
    out.push(
      act({
        id: `tracking-link-${creatorId}`,
        titleTh: `ส่งลิงก์ UTM หรือโค้ดส่วนลดให้ ${at}`,
        detailTh: 'ใช้ลิงก์หรือโค้ดเฉพาะคนเพื่อแยกยอดคลิกและยอดขาย',
        owner: 'planner',
        category: 'tracking',
        dueInDays: 10,
      }),
    );
  } else if (objective === 'tiktok_shop' || formats.includes('affiliate')) {
    out.push(
      act({
        id: `affiliate-link-${creatorId}`,
        titleTh: `ให้ ${at} ผูกสินค้าในตะกร้า affiliate`,
        detailTh: 'ตรวจว่าครีเอเตอร์รับคำเชิญ affiliate แล้วและผูกสินค้าในคลิปหรือไลฟ์ได้',
        owner: 'creator',
        category: 'tracking',
        dueInDays: 10,
      }),
    );
  }

  if (formats.includes('live')) {
    out.push(
      act({
        id: `live-${creatorId}`,
        titleTh: `นัดวันไลฟ์ขายกับ ${at}`,
        detailTh: 'กำหนดวันเวลา ความยาวไลฟ์ สินค้าที่ขาย และโปรโมชันเฉพาะไลฟ์',
        owner: 'planner',
        category: 'launch',
        dueInDays: 12,
      }),
    );
  }

  out.push(
    act({
      id: `draft-${creatorId}`,
      titleTh: `${at} ส่ง draft คอนเทนต์`,
      detailTh: 'ส่งสคริปต์หรือคลิปร่างให้ตรวจก่อนโพสต์ แก้ไขได้ไม่เกิน 2 รอบ',
      owner: 'creator',
      category: 'launch',
      dueInDays: 15,
    }),
  );

  if (formats.includes('spark_ads')) {
    out.push(
      act({
        id: `spark-code-${creatorId}`,
        titleTh: `ขอรหัส Spark Ads จาก ${at}`,
        detailTh: 'ขอรหัสอนุญาตที่มีอายุครอบคลุมช่วงบูสต์ทั้งหมด',
        owner: 'creator',
        category: 'tracking',
        dueInDays: 18,
      }),
    );
  }

  out.push(
    act({
      id: `post-${creatorId}`,
      titleTh: `${at} โพสต์คอนเทนต์`,
      detailTh: playbook.postingWindow
        ? `ช่วงที่แนะนำ: ${describePostingWindowTh(playbook.postingWindow)}`
        : 'โพสต์ตามวันเวลาที่ตกลงในตาราง',
      owner: 'creator',
      category: 'launch',
      dueInDays: 21,
    }),
    act({
      id: `report-${creatorId}`,
      titleTh: `${at} ส่ง insight 7 วันหลังโพสต์`,
      detailTh: 'ส่ง screenshot ยอดวิว เวลาดูเฉลี่ย และข้อมูลผู้ชมจากหลังบ้าน TikTok',
      owner: 'creator',
      category: 'report',
      dueInDays: 28,
    }),
  );
  return out.sort(byDue);
}
