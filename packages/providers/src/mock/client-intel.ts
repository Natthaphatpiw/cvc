import { normalizeFacebookUrl } from '../apify';
import { normalizeWebsiteUrl } from '../firecrawl';
import { parseTiktokHandle } from '../tiktok-intel';
import { ProviderError } from '../errors';
import type { ClientIntelProvider, SourceDoc } from '../types';

// Sample docs are built from the inputs only. They never invent products, prices or audiences, and say so in Thai,
// so evidence summaries built on top of them stay honest.

const SAMPLE_HEADER = '[ข้อมูลตัวอย่าง (โหมดสาธิต) ไม่ใช่ข้อมูลจริงของแบรนด์]';

function sampleMeta(source: string): Record<string, unknown> {
  return { provider: 'mock', mock: true, sample: true, source };
}

function nameFromHost(host: string): string {
  const label = host.toLowerCase().replace(/^www\./, '').split('.')[0] ?? host;
  return label.replace(/[-_]+/g, ' ').trim() || host;
}

export function mockWebsiteDocs(url: string): SourceDoc[] {
  const u = normalizeWebsiteUrl(url);
  const name = nameFromHost(u.hostname);
  return [
    {
      sourceType: 'website',
      url: u.toString(),
      title: `${name} (ตัวอย่าง)`,
      text: [
        SAMPLE_HEADER,
        `ระบบยังไม่ได้เชื่อมต่อบริการอ่านเว็บไซต์ จึงไม่ได้เปิดอ่าน ${u.toString()} จริง`,
        `เอกสารนี้สร้างจากชื่อโดเมน "${name}" เท่านั้น ไม่มีรายละเอียดสินค้า ราคา จุดเด่น หรือกลุ่มลูกค้าของแบรนด์`,
        'ข้อมูลแบรนด์ที่เชื่อถือได้ในโหมดนี้มีเพียงสิ่งที่ผู้ใช้กรอกในบรีฟ',
      ].join('\n'),
      fetchedAt: new Date().toISOString(),
      meta: sampleMeta('website'),
    },
  ];
}

export function mockFacebookDocs(url: string): SourceDoc[] {
  const fb = normalizeFacebookUrl(url);
  const pageName = new URL(fb).pathname.split('/').filter(Boolean)[0] ?? 'facebook page';
  return [
    {
      sourceType: 'facebook_page',
      url: fb,
      title: `เพจ ${pageName} (ตัวอย่าง)`,
      text: [
        SAMPLE_HEADER,
        `ระบบยังไม่ได้เชื่อมต่อบริการดึงข้อมูลเพจ Facebook จึงไม่ได้อ่านเพจ ${fb} จริง`,
        'ไม่มีข้อมูลผู้ติดตาม โพสต์ ยอดมีส่วนร่วม หรือหมวดหมู่ของเพจในเอกสารนี้',
      ].join('\n'),
      fetchedAt: new Date().toISOString(),
      meta: sampleMeta('facebook'),
    },
  ];
}

export function mockTiktokDocs(url: string): SourceDoc[] {
  const handle = parseTiktokHandle(url);
  if (!handle) {
    throw new ProviderError(`mock: cannot read a TikTok handle from "${url}"`, { provider: 'mock', retryable: false, code: 'invalid_input' });
  }
  return [
    {
      sourceType: 'tiktok',
      url: `https://www.tiktok.com/@${handle}`,
      title: `TikTok @${handle} (ตัวอย่าง)`,
      text: [
        SAMPLE_HEADER,
        `ระบบยังไม่ได้เชื่อมต่อบริการดึงข้อมูล TikTok จึงไม่ได้อ่านบัญชี @${handle} จริง`,
        'ไม่มีข้อมูลผู้ติดตาม ยอดวิว สไตล์คอนเทนต์ หรือครีเอเตอร์ที่เคยร่วมงานในเอกสารนี้',
      ].join('\n'),
      fetchedAt: new Date().toISOString(),
      meta: sampleMeta('tiktok'),
    },
  ];
}

export function createMockClientIntelProvider(): ClientIntelProvider {
  return {
    name: 'mock',
    mock: true,
    crawlWebsite: async (url) => mockWebsiteDocs(url),
    facebookPage: async (url) => mockFacebookDocs(url),
    tiktokProfile: async (url) => mockTiktokDocs(url),
  };
}
