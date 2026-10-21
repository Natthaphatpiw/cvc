import type { Tier } from '@cvc/schemas';

// Fictional creators and content for demo mode. Every handle starts with 'cvcdemo_' and every display name ends in
// ' (ตัวอย่าง)'; brand names in sponsored captions are marked '(สมมติ)'. Nothing here refers to a real person or brand.

export const MOCK_HANDLE_PREFIX = 'cvcdemo_';
export const MOCK_NAME_SUFFIX = ' (ตัวอย่าง)';

export type MockCategoryId =
  | 'beauty.skincare'
  | 'beauty.makeup'
  | 'fashion'
  | 'food'
  | 'food.restaurant'
  | 'health.fitness'
  | 'health.supplement'
  | 'mom_baby'
  | 'gaming'
  | 'tech'
  | 'travel'
  | 'home'
  | 'pets'
  | 'finance'
  | 'education'
  | 'lifestyle'
  | 'business'
  | 'family';

export type CategoryContent = {
  /** Thai + English terms a search keyword is matched against. */
  keywords: string[];
  hashtags: string[];
  /** {item} = one of `items`, {p} = polite particle of the creator. */
  captions: string[];
  items: string[];
  bioTh: string;
  durationS: [number, number];
  /** saves as a share of likes */
  saveRate: [number, number];
  shopFriendly: boolean;
};

export const CATEGORY_CONTENT: Record<MockCategoryId, CategoryContent> = {
  'beauty.skincare': {
    keywords: ['สกินแคร์', 'skincare', 'skin care', 'ผิว', 'ครีม', 'เซรั่ม', 'serum', 'กันแดด', 'sunscreen', 'สิว', 'acne', 'บำรุงผิว', 'moisturizer', 'beauty', 'ความงาม', 'บิวตี้', 'เครื่องสำอาง', 'cosmetic'],
    hashtags: ['สกินแคร์', 'skincare', 'รีวิวสกินแคร์', 'ผิวแพ้ง่าย', 'กันแดด', 'ผิวใส'],
    captions: [
      'รีวิว{item}หลังใช้ 2 อาทิตย์ ผิวเปลี่ยนไหม มาดูกัน{p}',
      'สกินแคร์รูทีนตอนเช้าแบบง่าย ๆ สำหรับผิวมันเป็นสิวง่าย',
      'เทียบ{item} 3 ตัวในงบไม่เกิน 500 บาท ตัวไหนคุ้มสุด',
      'ผิวแพ้ง่ายต้องอ่านฉลากยังไง สรุปให้ใน 1 นาที{p}',
      'ของหมดแล้วซื้อซ้ำ {item}ตัวนี้ใช้มาครึ่งปี',
      'ทากันแดดยังไงไม่ให้วอก ลองให้ดู{p}',
      'ตอบคำถาม ผิวมันควรเลือก{item}แบบไหนดี',
      'ป้ายยา{item}ที่ใช้แล้วผิวฉ่ำขึ้นจริง',
    ],
    items: ['เซรั่มวิตามินซี', 'ครีมกันแดด', 'มอยส์เจอไรเซอร์', 'โฟมล้างหน้า', 'โทนเนอร์', 'เจลแต้มสิว'],
    bioTh: 'รีวิวสกินแคร์ตามจริง ผิวผสมแพ้ง่าย',
    durationS: [20, 90],
    saveRate: [0.08, 0.2],
    shopFriendly: true,
  },
  'beauty.makeup': {
    keywords: ['เมคอัพ', 'แต่งหน้า', 'makeup', 'ลิป', 'lipstick', 'รองพื้น', 'foundation', 'คุชชั่น', 'cushion', 'บิวตี้', 'beauty', 'ความงาม', 'เครื่องสำอาง', 'cosmetic'],
    hashtags: ['แต่งหน้า', 'makeup', 'เมคอัพ', 'ลิปสติก', 'บิวตี้', 'รีวิวเครื่องสำอาง'],
    captions: [
      'แต่งหน้าไปทำงาน 5 นาทีด้วย{item}ตัวเดียว',
      'สวอชสี{item} 6 เฉดสำหรับผิวสองสี{p}',
      'ลุคไปเดทแบบหวาน ๆ ใช้ของในงบ 300',
      '{item}ติดทนจริงไหม ใส่ไปทั้งวันให้ดู',
      'รวม{item}ราคาน่ารักที่ไม่แพ้แบรนด์แพง',
      'แต่งหน้ากันเหงื่อสำหรับอากาศร้อนแบบไทย{p}',
    ],
    items: ['ลิปทินท์', 'คุชชั่น', 'รองพื้น', 'บลัชออน', 'อายแชโดว์', 'แป้งพัฟ'],
    bioTh: 'แต่งหน้าง่าย ๆ ใช้ได้จริงทุกวัน',
    durationS: [20, 120],
    saveRate: [0.05, 0.12],
    shopFriendly: true,
  },
  fashion: {
    keywords: ['แฟชั่น', 'fashion', 'เสื้อผ้า', 'ชุด', 'outfit', 'ootd', 'แต่งตัว', 'กระเป๋า', 'รองเท้า', 'sneaker', 'สนีกเกอร์', 'สไตล์', 'style'],
    hashtags: ['แฟชั่น', 'ootd', 'แต่งตัว', 'fashion', 'outfit', 'สไตล์'],
    captions: [
      'แมตช์ชุดไปทำงาน 5 วัน 5 ลุคด้วย{item}ตัวเดียว',
      'OOTD วันนี้ ใส่{item}ไปคาเฟ่{p}',
      'ช้อปเสื้อผ้างบ 1,000 ได้กี่ชิ้น',
      'วิธีเลือก{item}ให้เข้ากับรูปร่าง',
      'ลุคเที่ยวทะเลแบบไม่ร้อน{p}',
      'จัดตู้เสื้อผ้าแบบแคปซูล ใส่ได้ทั้งเดือน',
    ],
    items: ['เสื้อเชิ้ต', 'กางเกงยีนส์', 'เดรส', 'รองเท้าผ้าใบ', 'กระเป๋าสะพาย', 'แจ็กเก็ต'],
    bioTh: 'แต่งตัวง่าย ๆ งบไม่บานปลาย',
    durationS: [15, 60],
    saveRate: [0.04, 0.1],
    shopFriendly: true,
  },
  food: {
    keywords: ['อาหาร', 'food', 'กิน', 'ของกิน', 'สูตร', 'ทำอาหาร', 'cooking', 'recipe', 'ขนม', 'dessert', 'อร่อย', 'สตรีทฟู้ด', 'streetfood', 'เครื่องปรุง', 'ซอส'],
    hashtags: ['อาหาร', 'ของกิน', 'ทำอาหาร', 'สูตรอาหาร', 'อร่อยบอกต่อ', 'streetfood'],
    captions: [
      'สูตร{item}ทำง่ายในหม้อทอดไร้น้ำมัน{p}',
      'ทำ{item}กินเองงบ 100 บาท อิ่มทั้งบ้าน',
      'ตามหา{item}เจ้าดังย่านเมืองเก่า อร่อยสมคำร่ำลือไหม',
      'กินตามคอมเมนต์ วันนี้{item}เผ็ดระดับ 5',
      'เมนูข้าวกล่องไปทำงาน ทำครั้งเดียวกินได้ 3 วัน',
      'รีวิวของกินในร้านสะดวกซื้อที่คนแนะนำมาเยอะสุด{p}',
    ],
    items: ['ผัดกะเพรา', 'ต้มยำกุ้ง', 'ส้มตำ', 'ข้าวมันไก่', 'หมูกระทะ', 'ขนมครก'],
    bioTh: 'ทำกินเอง กินเที่ยว อร่อยบอกต่อ',
    durationS: [20, 120],
    saveRate: [0.08, 0.18],
    shopFriendly: true,
  },
  'food.restaurant': {
    keywords: ['ร้านอาหาร', 'คาเฟ่', 'cafe', 'restaurant', 'รีวิวร้าน', 'บุฟเฟ่ต์', 'buffet', 'ร้านกาแฟ', 'coffee', 'กาแฟ', 'อาหาร', 'food', 'อร่อย', 'กิน'],
    hashtags: ['รีวิวร้านอาหาร', 'คาเฟ่', 'ร้านอร่อย', 'กินเที่ยว', 'บุฟเฟ่ต์', 'foodreview'],
    captions: [
      'รีวิว{item}เปิดใหม่ย่านในเมือง คุ้มไหมกับราคา',
      'คาเฟ่ลับ ๆ บรรยากาศดี นั่งทำงานได้ทั้งวัน{p}',
      'บุฟเฟ่ต์{item}หัวละ 599 กินให้คุ้มต้องสั่งอะไร',
      'พาไปกิน{item}ที่ต้องต่อคิว 1 ชั่วโมง',
      'ร้านลับในซอย ราคาน่ารัก รสชาติจัดเต็ม',
      'จัดอันดับ{item} 5 ร้านที่ไปมาแล้วเดือนนี้{p}',
    ],
    items: ['คาเฟ่', 'ร้านชาบู', 'ร้านปิ้งย่าง', 'ร้านซูชิ', 'ร้านขนมหวาน', 'ร้านก๋วยเตี๋ยว'],
    bioTh: 'ตระเวนกินร้านอร่อยทั่วกรุงฯ',
    durationS: [20, 90],
    saveRate: [0.1, 0.22],
    shopFriendly: false,
  },
  'health.fitness': {
    keywords: ['ฟิตเนส', 'fitness', 'ออกกำลังกาย', 'workout', 'gym', 'ยิม', 'วิ่ง', 'running', 'รองเท้าวิ่ง', 'ลดน้ำหนัก', 'คาร์ดิโอ', 'โยคะ', 'yoga', 'สุขภาพ', 'health'],
    hashtags: ['ออกกำลังกาย', 'ฟิตเนส', 'workout', 'ลดน้ำหนัก', 'สุขภาพดี', 'วิ่ง'],
    captions: [
      'เวิร์กเอาต์ 15 นาทีที่บ้าน ไม่ต้องใช้อุปกรณ์{p}',
      'ลดไขมันยังไงให้ไม่โยโย่ สรุปจากที่ทำมา 1 ปี',
      'ท่า{item}ที่คนทำผิดบ่อย แก้แบบนี้',
      'กินยังไงช่วงลดน้ำหนัก วันหนึ่งกินอะไรบ้าง',
      'วิ่งตอนเช้าครบ 30 วัน ร่างกายเปลี่ยนไปยังไง{p}',
      'มือใหม่เข้ายิมครั้งแรกควรเริ่มจาก{item}',
    ],
    items: ['สควอท', 'แพลงก์', 'เดดลิฟต์', 'โยคะยืดเหยียด', 'คาร์ดิโอ', 'วิ่งโซน 2'],
    bioTh: 'ออกกำลังกายแบบคนธรรมดาทำได้',
    durationS: [20, 120],
    saveRate: [0.08, 0.18],
    shopFriendly: false,
  },
  'health.supplement': {
    keywords: ['อาหารเสริม', 'supplement', 'วิตามิน', 'vitamin', 'คอลลาเจน', 'collagen', 'โปรตีน', 'protein', 'เวย์', 'สุขภาพ', 'health'],
    hashtags: ['อาหารเสริม', 'วิตามิน', 'สุขภาพ', 'ดูแลตัวเอง', 'รีวิวอาหารเสริม'],
    captions: [
      'กิน{item}ทุกวันมา 1 เดือน รู้สึกต่างไหม{p}',
      'อ่านฉลาก{item}ยังไง ไม่ให้โดนหลอก',
      '{item}จำเป็นจริงไหม สรุปให้แบบเข้าใจง่าย',
      'ตารางกินวิตามินของคนทำงานออฟฟิศ',
      'เทียบ{item} 3 แบบ ต่างกันตรงไหน{p}',
    ],
    items: ['วิตามินซี', 'คอลลาเจน', 'เวย์โปรตีน', 'แมกนีเซียม', 'โอเมก้า 3'],
    bioTh: 'อ่านฉลากให้ก่อนซื้อ สุขภาพดีแบบมีข้อมูล',
    durationS: [25, 120],
    saveRate: [0.08, 0.16],
    shopFriendly: true,
  },
  mom_baby: {
    keywords: ['แม่และเด็ก', 'คุณแม่', 'แม่', 'ลูก', 'เด็ก', 'baby', 'mom', 'ทารก', 'ผ้าอ้อม', 'ขวดนม', 'ของใช้เด็ก', 'parenting', 'เลี้ยงลูก'],
    hashtags: ['แม่และเด็ก', 'คุณแม่มือใหม่', 'เลี้ยงลูก', 'ของใช้เด็ก', 'momlife', 'ลูกน้อย'],
    captions: [
      'ของใช้เด็กแรกเกิดที่จำเป็นจริง ๆ ไม่ต้องซื้อเยอะ{p}',
      'รีวิว{item}ที่ใช้กับลูกมา 3 เดือน',
      'วันหนึ่งของแม่ลูกอ่อน ตื่นกี่รอบกันนะ',
      'เทียบ{item} 3 แบบ ตัวไหนลูกชอบสุด',
      'ทริคพาลูกเที่ยวไม่ให้งอแง{p}',
      'เมนูอาหารเด็ก 1 ขวบ ทำง่ายใน 15 นาที',
    ],
    items: ['ผ้าอ้อม', 'ขวดนม', 'รถเข็นเด็ก', 'ครีมทาผื่น', 'เป้อุ้มเด็ก', 'ของเล่นเสริมพัฒนาการ'],
    bioTh: 'แม่ลูกอ่อนเล่าเรื่องเลี้ยงลูกแบบจริงใจ',
    durationS: [20, 120],
    saveRate: [0.06, 0.14],
    shopFriendly: true,
  },
  gaming: {
    keywords: ['เกม', 'game', 'gaming', 'เกมมือถือ', 'mobile game', 'สตรีม', 'esports', 'อีสปอร์ต', 'เกมเมอร์', 'gamer', 'คอนโซล'],
    hashtags: ['เกม', 'gaming', 'เกมมือถือ', 'สตรีมเกม', 'เกมเมอร์', 'gamer'],
    captions: [
      'ไฮไลต์แรงก์คืนนี้ คอมโบนี้ต้องดู{p}',
      'สอนเล่น{item}สำหรับมือใหม่ใน 3 นาที',
      'จัดสเปกมือถือเล่นเกมลื่น ๆ งบไม่เกินหมื่น',
      'รีวิว{item}ที่ใช้สตรีมทุกวัน',
      'ทีมเพื่อนสายฮา แพ้แต่ยังขำ{p}',
      'อัปเดตแพตช์ใหม่ อะไรเปลี่ยนบ้าง',
    ],
    items: ['เกม MOBA', 'เกมยิง', 'หูฟังเกมมิ่ง', 'จอยมือถือ', 'เกมเอาชีวิตรอด'],
    bioTh: 'สตรีมเกมทุกคืน สายฮาไม่เน้นชนะ',
    durationS: [20, 150],
    saveRate: [0.02, 0.06],
    shopFriendly: false,
  },
  tech: {
    keywords: ['ไอที', 'tech', 'แกดเจ็ต', 'gadget', 'มือถือ', 'สมาร์ทโฟน', 'smartphone', 'โน้ตบุ๊ก', 'notebook', 'laptop', 'หูฟัง', 'แอป', 'app', 'รีวิวมือถือ'],
    hashtags: ['ไอที', 'รีวิวมือถือ', 'แกดเจ็ต', 'tech', 'gadget', 'รีวิวไอที'],
    captions: [
      'รีวิว{item}หลังใช้จริง 1 สัปดาห์ ข้อดีข้อเสีย{p}',
      'เทียบ{item} 2 รุ่นยอดนิยม ซื้อตัวไหนดี',
      '5 ฟีเจอร์ลับในมือถือที่หลายคนไม่รู้',
      'จัดโต๊ะทำงานด้วยแกดเจ็ตงบ 3,000',
      'แกะกล่อง{item}รุ่นใหม่ มีอะไรมาบ้าง{p}',
      'ตั้งค่าแบบนี้แบตอึดขึ้นทั้งวัน',
    ],
    items: ['สมาร์ทโฟน', 'หูฟังไร้สาย', 'โน้ตบุ๊ก', 'สมาร์ทวอทช์', 'พาวเวอร์แบงก์', 'แท็บเล็ต'],
    bioTh: 'รีวิวไอทีภาษาคน ไม่อวยไม่แซะ',
    durationS: [30, 180],
    saveRate: [0.05, 0.12],
    shopFriendly: true,
  },
  travel: {
    keywords: ['ท่องเที่ยว', 'เที่ยว', 'travel', 'ที่พัก', 'โรงแรม', 'hotel', 'รีสอร์ต', 'resort', 'ทริป', 'trip', 'ทะเล', 'ภูเขา', 'เที่ยวไทย'],
    hashtags: ['เที่ยวไทย', 'ท่องเที่ยว', 'ที่พัก', 'travel', 'เที่ยวทะเล', 'ทริป'],
    captions: [
      'เที่ยว{item} 2 วัน 1 คืน งบไม่เกิน 3,000{p}',
      'ที่พักวิวทะเลราคาหลักร้อย ตื่นมาเจอแบบนี้',
      'แพลนทริป{item}ช่วงหน้าฝน ไปได้ไหม',
      'จุดถ่ายรูปลับที่คนยังไม่เยอะ{p}',
      'ขับรถเที่ยว{item} แวะกินอะไรระหว่างทางดี',
      'รีวิวรีสอร์ตติดลำธาร เงียบสงบมาก',
    ],
    items: ['เชียงใหม่', 'เขาใหญ่', 'เกาะเสม็ด', 'น่าน', 'กระบี่', 'กาญจนบุรี'],
    bioTh: 'เที่ยวไทยงบน้อย ที่พักดีบอกต่อ',
    durationS: [20, 120],
    saveRate: [0.1, 0.25],
    shopFriendly: false,
  },
  home: {
    keywords: ['บ้าน', 'แต่งบ้าน', 'home', 'คอนโด', 'condo', 'เฟอร์นิเจอร์', 'furniture', 'ของใช้ในบ้าน', 'ห้องนอน', 'decor', 'ทำความสะอาด', 'จัดบ้าน'],
    hashtags: ['แต่งบ้าน', 'แต่งคอนโด', 'homedecor', 'ของใช้ในบ้าน', 'จัดบ้าน', 'บ้านสวย'],
    captions: [
      'เปลี่ยนห้องคอนโด 28 ตร.ม. ให้ดูกว้างขึ้น{p}',
      'รีวิว{item}ที่ซื้อมาแล้วชีวิตง่ายขึ้น',
      'จัดระเบียบตู้เย็นแบบนี้ ของไม่เสียง่าย',
      'ทำความสะอาดห้องน้ำ 10 นาทีด้วย{item}',
      'ของแต่งบ้านงบ 500 ที่ทำให้ห้องดูแพง{p}',
      'มุมทำงานที่บ้านแบบมินิมอล',
    ],
    items: ['ชั้นวางของ', 'เครื่องดูดฝุ่น', 'โคมไฟ', 'กล่องจัดระเบียบ', 'ผ้าม่าน', 'น้ำยาทำความสะอาด'],
    bioTh: 'แต่งคอนโดเล็กให้อยู่สบาย',
    durationS: [15, 90],
    saveRate: [0.1, 0.22],
    shopFriendly: true,
  },
  pets: {
    keywords: ['สัตว์เลี้ยง', 'pet', 'หมา', 'แมว', 'dog', 'cat', 'อาหารแมว', 'อาหารหมา', 'ทาสแมว', 'น้องหมา', 'น้องแมว'],
    hashtags: ['ทาสแมว', 'หมาน่ารัก', 'แมวน่ารัก', 'สัตว์เลี้ยง', 'petlover', 'catlover'],
    captions: [
      'วันหนึ่งของน้องแมว นอนกี่ชั่วโมงกันแน่{p}',
      'รีวิว{item}ที่น้องชอบมาก',
      'ทาสแมวต้องรู้ อาหารแบบไหนไม่ควรให้',
      'พาน้องไปหาหมอครั้งแรก เตรียมอะไรบ้าง',
      'ลองให้น้องเลือกระหว่าง{item} 2 แบบ{p}',
      'ทริคฝึกน้องหมาให้นั่งรอใน 3 วัน',
    ],
    items: ['อาหารแมว', 'ทรายแมว', 'ขนมหมา', 'ของเล่นแมว', 'ที่นอนสัตว์เลี้ยง'],
    bioTh: 'บ้านนี้มีน้องสี่ขา เล่าเรื่องเลี้ยงสัตว์แบบอบอุ่น',
    durationS: [10, 60],
    saveRate: [0.03, 0.08],
    shopFriendly: true,
  },
  finance: {
    keywords: ['การเงิน', 'finance', 'ลงทุน', 'invest', 'หุ้น', 'ออมเงิน', 'เก็บเงิน', 'ประกัน', 'บัตรเครดิต', 'กองทุน', 'ภาษี', 'money'],
    hashtags: ['การเงิน', 'ออมเงิน', 'เก็บเงิน', 'วางแผนการเงิน', 'ลงทุน', 'moneytips'],
    captions: [
      'เงินเดือน 20,000 แบ่งเก็บยังไงให้มีเงินเหลือ{p}',
      'มือใหม่เริ่ม{item}ต้องรู้อะไรบ้าง',
      'ลดหย่อนภาษีปลายปี ทำอะไรได้บ้าง',
      'เทียบ{item}แบบเข้าใจง่ายใน 1 นาที',
      '5 นิสัยการใช้เงินที่ทำให้เก็บเงินไม่อยู่{p}',
      'วางแผนเงินฉุกเฉิน ควรมีกี่เดือน',
    ],
    items: ['กองทุนรวม', 'ประกันสุขภาพ', 'บัญชีเงินฝากดอกเบี้ยสูง', 'บัตรเครดิต', 'การออมหุ้น'],
    bioTh: 'การเงินส่วนบุคคลแบบเข้าใจง่าย ไม่ใช่คำแนะนำการลงทุน',
    durationS: [30, 150],
    saveRate: [0.15, 0.3],
    shopFriendly: false,
  },
  education: {
    keywords: ['การศึกษา', 'เรียน', 'education', 'ภาษาอังกฤษ', 'english', 'ติวเตอร์', 'ติวสอบ', 'สอบ', 'ความรู้', 'study'],
    hashtags: ['ภาษาอังกฤษ', 'เรียนภาษา', 'ติวสอบ', 'ความรู้', 'english', 'studytips'],
    captions: [
      'ประโยคภาษาอังกฤษใช้ในที่ทำงาน พูดแบบนี้ดูโปร{p}',
      'คำที่คนไทยออกเสียงผิดบ่อย ฝึกตามนี้',
      'เทคนิคจำ{item}แบบไม่ต้องท่อง',
      'เตรียมสอบ{item}ใน 30 วัน เริ่มยังไงดี',
      'สรุปแกรมมาร์ที่ใช้บ่อยใน 1 นาที{p}',
    ],
    items: ['คำศัพท์', 'TOEIC', 'IELTS', 'การพูดภาษาอังกฤษ', 'แกรมมาร์'],
    bioTh: 'ครูสอนภาษาอังกฤษใช้ได้จริงในชีวิตประจำวัน',
    durationS: [30, 150],
    saveRate: [0.15, 0.3],
    shopFriendly: false,
  },
  lifestyle: {
    keywords: ['ไลฟ์สไตล์', 'lifestyle', 'vlog', 'วล็อก', 'ชีวิตประจำวัน', 'daily', 'รีวิว', 'ป้ายยา', 'ของดี', 'review'],
    hashtags: ['ไลฟ์สไตล์', 'vlog', 'ป้ายยา', 'tiktokป้ายยา', 'ของดีบอกต่อ', 'รีวิว'],
    captions: [
      'วันหยุดของคนทำงาน ทำอะไรบ้าง{p}',
      'ป้ายยา{item}ที่ใช้แล้วชีวิตดีขึ้น',
      'Vlog ตื่นเช้าไปทำงาน กับรูทีนง่าย ๆ',
      'ของดีราคาไม่แพงที่ซื้อซ้ำบ่อยสุด',
      'ลองใช้ชีวิตแบบไม่เล่นโซเชียล 3 วัน{p}',
      'รีวิว{item}ที่คนถามมาเยอะ',
    ],
    items: ['ของใช้ประจำวัน', 'กระติกน้ำ', 'กระเป๋าเดินทาง', 'ร่มพับ', 'แอปจดโน้ต'],
    bioTh: 'เล่าชีวิตประจำวัน ป้ายยาของที่ใช้จริง',
    durationS: [15, 120],
    saveRate: [0.04, 0.1],
    shopFriendly: true,
  },
  business: {
    keywords: ['ธุรกิจ', 'sme', 'business', 'การตลาด', 'marketing', 'ขายของออนไลน์', 'เจ้าของร้าน', 'startup', 'ค้าขาย', 'ไลฟ์ขายของ'],
    hashtags: ['ขายของออนไลน์', 'sme', 'ธุรกิจ', 'การตลาด', 'เจ้าของร้าน', 'ไลฟ์ขายของ'],
    captions: [
      'เริ่มขายของออนไลน์ด้วยงบ 5,000 ทำยังไง{p}',
      'ถ่ายรูปสินค้าด้วยมือถือให้ดูแพง',
      'เขียนแคปชันขายของยังไงให้คนอยากซื้อ',
      'เทคนิคไลฟ์ขายของสำหรับร้านเล็ก{p}',
      'คำนวณต้นทุน{item}ให้ไม่ขาดทุน',
    ],
    items: ['ร้านกาแฟ', 'ร้านเสื้อผ้า', 'สินค้าแฮนด์เมด', 'ขนมโฮมเมด'],
    bioTh: 'เจ้าของร้านเล็กเล่าเรื่องทำธุรกิจออนไลน์',
    durationS: [30, 150],
    saveRate: [0.12, 0.25],
    shopFriendly: false,
  },
  family: {
    keywords: ['ครอบครัว', 'family', 'พ่อแม่ลูก', 'ลูก', 'กิจกรรมครอบครัว', 'วันหยุด'],
    hashtags: ['ครอบครัว', 'ครอบครัวสุขสันต์', 'family', 'พ่อแม่ลูก', 'กิจกรรมครอบครัว'],
    captions: [
      'กิจกรรมวันหยุดของบ้านเรา ง่ายแต่ลูกชอบ{p}',
      'ทำอาหารกับลูกครั้งแรก วุ่นแต่สนุก',
      'พาพ่อแม่เที่ยว{item} ทริปสบาย ๆ',
      'บ้านเราจัดตารางงานบ้านยังไงไม่ให้ทะเลาะ',
      'เกมสนุกทั้งครอบครัวเล่นได้ในบ้าน{p}',
    ],
    items: ['ต่างจังหวัด', 'ทะเล', 'สวนสัตว์', 'ตลาดน้ำ'],
    bioTh: 'บ้านเล็ก ๆ ที่อบอุ่น เล่าเรื่องครอบครัวทุกวัน',
    durationS: [15, 90],
    saveRate: [0.04, 0.1],
    shopFriendly: false,
  },
};

export const SPONSORED_CAPTIONS = [
  'ขอบคุณ{brand}ที่ส่ง{item}มาให้ลองใช้{p} รีวิวตามจริงหลังใช้ 7 วัน',
  'ร่วมกับ{brand} ชวนมาดู{item}ที่ใช้อยู่ทุกวัน{p}',
  '[โฆษณา] {brand}เปิดตัว{item}ใหม่ ลองแล้วชอบตรงไหนบ้าง',
  'พาร์ทเนอร์กับ{brand} มีโค้ดส่วนลดในคอมเมนต์{p}',
];

/** Rendered as `แบรนด์<name> (สมมติ)`. */
export const FICTIONAL_BRANDS = ['ลูมิน่า', 'นภาลัย', 'ฟ้าใส', 'บ้านสวนดี', 'มิลค์ดิว', 'ทิวลิปเฮาส์', 'ลมหนาว', 'ไอริสวิลล์'];

export const GENERIC_HASHTAGS = ['fyp', 'foryou', 'tiktokuni', 'รีวิวของดี'];

export type RosterEntry = {
  slug: string;
  nameTh: string;
  category: MockCategoryId;
  tier: Tier;
  particle: 'ค่ะ' | 'ครับ';
};

/** 40 fictional creators: nano 8 · micro 14 · mid 10 · macro 5 · mega 3. */
export const ROSTER: readonly RosterEntry[] = [
  { slug: 'skin_mali', nameTh: 'มะลิ รีวิวผิว', category: 'beauty.skincare', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'skin_pimpim', nameTh: 'พิมพิม สกินแคร์', category: 'beauty.skincare', tier: 'nano', particle: 'ค่ะ' },
  { slug: 'glow_nokyung', nameTh: 'นกยูง ผิวโกลว์', category: 'beauty.skincare', tier: 'mid', particle: 'ค่ะ' },
  { slug: 'sunscreen_fah', nameTh: 'ฟ้า กันแดดทุกวัน', category: 'beauty.skincare', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'skinlab_ploy', nameTh: 'พลอย สกินแล็บ', category: 'beauty.skincare', tier: 'macro', particle: 'ค่ะ' },
  { slug: 'makeup_bow', nameTh: 'โบว์ แต่งหน้า', category: 'beauty.makeup', tier: 'mid', particle: 'ค่ะ' },
  { slug: 'lipstick_kaew', nameTh: 'แก้ว ลิปสติก', category: 'beauty.makeup', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'makeup_mint', nameTh: 'มิ้นท์ เมคอัพ', category: 'beauty.makeup', tier: 'mega', particle: 'ค่ะ' },
  { slug: 'ootd_praew', nameTh: 'แพรว แต่งตัว', category: 'fashion', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'sneaker_tor', nameTh: 'ต่อ สนีกเกอร์', category: 'fashion', tier: 'mid', particle: 'ครับ' },
  { slug: 'style_nampueng', nameTh: 'น้ำผึ้ง สไตล์', category: 'fashion', tier: 'nano', particle: 'ค่ะ' },
  { slug: 'food_jaew', nameTh: 'แจ่ว ทำกินเอง', category: 'food', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'streetfood_boy', nameTh: 'บอย สตรีทฟู้ด', category: 'food', tier: 'macro', particle: 'ครับ' },
  { slug: 'cafe_hopper_wan', nameTh: 'หวาน คาเฟ่ฮอปเปอร์', category: 'food.restaurant', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'buffet_ohm', nameTh: 'โอม บุฟเฟ่ต์', category: 'food.restaurant', tier: 'mid', particle: 'ครับ' },
  { slug: 'fit_kong', nameTh: 'ก้อง ฟิตเนส', category: 'health.fitness', tier: 'mid', particle: 'ครับ' },
  { slug: 'run_fon', nameTh: 'ฝน วิ่งทุกเช้า', category: 'health.fitness', tier: 'nano', particle: 'ค่ะ' },
  { slug: 'yoga_ning', nameTh: 'หนิง โยคะ', category: 'health.fitness', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'vitamin_beam', nameTh: 'บีม วิตามิน', category: 'health.supplement', tier: 'micro', particle: 'ครับ' },
  { slug: 'mom_ngern', nameTh: 'แม่เงิน เลี้ยงลูก', category: 'mom_baby', tier: 'mid', particle: 'ค่ะ' },
  { slug: 'babydiary_ploen', nameTh: 'เพลิน ไดอารี่ลูกน้อย', category: 'mom_baby', tier: 'nano', particle: 'ค่ะ' },
  { slug: 'mom_nid', nameTh: 'แม่นิด ของใช้เด็ก', category: 'mom_baby', tier: 'macro', particle: 'ค่ะ' },
  { slug: 'game_tong', nameTh: 'ต้อง เกมเมอร์', category: 'gaming', tier: 'mega', particle: 'ครับ' },
  { slug: 'mobilegame_kim', nameTh: 'คิม เกมมือถือ', category: 'gaming', tier: 'micro', particle: 'ครับ' },
  { slug: 'gadget_kao', nameTh: 'เก้า แกดเจ็ต', category: 'tech', tier: 'mid', particle: 'ครับ' },
  { slug: 'techreview_pond', nameTh: 'ปอนด์ รีวิวไอที', category: 'tech', tier: 'macro', particle: 'ครับ' },
  { slug: 'apptip_fern', nameTh: 'เฟิร์น ทริคแอป', category: 'tech', tier: 'nano', particle: 'ค่ะ' },
  { slug: 'trip_jom', nameTh: 'จ๋อม เที่ยวไทย', category: 'travel', tier: 'micro', particle: 'ครับ' },
  { slug: 'beach_fai', nameTh: 'ฝ้าย ทะเลไทย', category: 'travel', tier: 'mid', particle: 'ค่ะ' },
  { slug: 'hotel_pat', nameTh: 'แพท รีวิวที่พัก', category: 'travel', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'condo_aom', nameTh: 'ออม แต่งคอนโด', category: 'home', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'cleanhome_nui', nameTh: 'นุ้ย บ้านสะอาด', category: 'home', tier: 'nano', particle: 'ค่ะ' },
  { slug: 'catslave_mew', nameTh: 'หมิว ทาสแมว', category: 'pets', tier: 'mid', particle: 'ค่ะ' },
  { slug: 'dogdaddy_tum', nameTh: 'ตั้ม พ่อหมา', category: 'pets', tier: 'micro', particle: 'ครับ' },
  { slug: 'money_ton', nameTh: 'ต้น เก็บเงินเป็น', category: 'finance', tier: 'mid', particle: 'ครับ' },
  { slug: 'english_noon', nameTh: 'ครูนุ่น ภาษาอังกฤษ', category: 'education', tier: 'macro', particle: 'ค่ะ' },
  { slug: 'vlog_dao', nameTh: 'ดาว วล็อกชีวิต', category: 'lifestyle', tier: 'mega', particle: 'ค่ะ' },
  { slug: 'paiya_nam', nameTh: 'น้ำ ป้ายยาของดี', category: 'lifestyle', tier: 'micro', particle: 'ค่ะ' },
  { slug: 'sme_golf', nameTh: 'กอล์ฟ ทำร้านออนไลน์', category: 'business', tier: 'nano', particle: 'ครับ' },
  { slug: 'family_baansuk', nameTh: 'บ้านสุข ครอบครัวอบอุ่น', category: 'family', tier: 'nano', particle: 'ค่ะ' },
];
