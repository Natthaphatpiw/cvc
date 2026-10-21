-- reference data — tier bands, categories, audience personas, rate cards, benchmarks
-- Values marked 'assumption_to_calibrate' are starting points for the MVP; replace them with Convert Cake's own data
-- (admin screens write ref.* through the api service).

insert into ref.tier_bands (tier, min_followers, max_followers, sort_order, source) values
  ('nano',  1000,    9999,    1, 'clisk_2026'),
  ('micro', 10000,   99999,   2, 'clisk_2026'),
  ('mid',   100000,  499999,  3, 'clisk_2026'),
  ('macro', 500000,  999999,  4, 'clisk_2026'),
  ('mega',  1000000, null,    5, 'clisk_2026')
on conflict (tier) do nothing;

insert into ref.categories (id, parent_id, label_th, label_en, tiktok_bc_policy, niche_multiplier) values
  ('beauty',             null,       'ความงาม',              'Beauty',            'allowed',    1.10),
  ('beauty.skincare',    'beauty',   'สกินแคร์',              'Skincare',          'allowed',    1.15),
  ('beauty.makeup',      'beauty',   'เมคอัพ',                'Makeup',            'allowed',    1.10),
  ('fashion',            null,       'แฟชั่น',                'Fashion',           'allowed',    1.05),
  ('food',               null,       'อาหาร',                 'Food',              'allowed',    1.00),
  ('food.restaurant',    'food',     'ร้านอาหาร/คาเฟ่',        'Restaurants',       'allowed',    1.00),
  ('health',             null,       'สุขภาพ',                'Health',            'allowed',    1.10),
  ('health.fitness',     'health',   'ฟิตเนส',                'Fitness',           'allowed',    1.05),
  ('health.supplement',  'health',   'อาหารเสริม',             'Supplements',       'restricted', 1.20),
  ('mom_baby',           null,       'แม่และเด็ก',             'Mom & baby',        'allowed',    1.10),
  ('gaming',             null,       'เกม',                   'Gaming',            'allowed',    1.00),
  ('tech',               null,       'ไอที/แกดเจ็ต',           'Tech',              'allowed',    1.10),
  ('travel',             null,       'ท่องเที่ยว',             'Travel',            'allowed',    1.05),
  ('home',               null,       'บ้านและของแต่งบ้าน',      'Home',              'allowed',    1.00),
  ('pets',               null,       'สัตว์เลี้ยง',            'Pets',              'allowed',    1.00),
  ('finance',            null,       'การเงิน',               'Finance',           'restricted', 1.25),
  ('education',          null,       'การศึกษา',              'Education',         'allowed',    1.00),
  ('lifestyle',          null,       'ไลฟ์สไตล์',             'Lifestyle',         'allowed',    1.00),
  ('business',           null,       'ธุรกิจ/SME',            'Business',          'allowed',    1.05),
  ('family',             null,       'ครอบครัว',              'Family',            'allowed',    1.00),
  ('alcohol',            null,       'เครื่องดื่มแอลกอฮอล์',     'Alcohol',           'restricted', 1.20)
on conflict (id) do nothing;

insert into ref.audience_personas (id, label_th, label_en, description_th, age_dist, gender_dist, region_dist, interests, category_hints, sort_order) values
  ('th_genz_beauty_bkk', 'สาว Gen Z สายบิวตี้ กทม.', 'Gen Z beauty lovers (BKK)', 'อายุ 18–24 ในกรุงเทพฯ ตามเทรนด์สกินแคร์และเมคอัพ', '{"18-24":0.75,"25-34":0.25}', '{"female":0.85,"male":0.15}', '{"BKK":0.7,"Central":0.2,"Other":0.1}', '{skincare,makeup,trends}', '{beauty}', 1),
  ('first_jobber', 'First jobber วัยเริ่มทำงาน', 'First jobbers', 'เพิ่งเริ่มทำงาน รายได้เริ่มต้น สนใจของคุ้มค่า', '{"18-24":0.4,"25-34":0.6}', '{"female":0.55,"male":0.45}', '{"BKK":0.5,"Central":0.25,"Other":0.25}', '{career,value,lifestyle}', '{lifestyle,finance}', 2),
  ('new_mom', 'คุณแม่มือใหม่', 'New moms', 'แม่ลูกเล็ก หาข้อมูลก่อนซื้อ เชื่อรีวิวจากแม่ด้วยกัน', '{"25-34":0.65,"35-44":0.35}', '{"female":0.95,"male":0.05}', null, '{parenting,baby,health}', '{mom_baby}', 3),
  ('foodie', 'สายกิน/รีวิวร้าน', 'Foodies', 'ตามรีวิวร้านอาหารและคาเฟ่', '{"18-24":0.35,"25-34":0.45,"35-44":0.2}', '{"female":0.55,"male":0.45}', null, '{food,cafe,travel}', '{food}', 4),
  ('fitness_health', 'สายสุขภาพ/ฟิตเนส', 'Health & fitness', 'ออกกำลังกาย ดูแลรูปร่าง อ่านฉลาก', '{"18-24":0.3,"25-34":0.45,"35-44":0.25}', '{"female":0.5,"male":0.5}', null, '{fitness,nutrition}', '{health}', 5),
  ('gamer', 'เกมเมอร์', 'Gamers', 'เล่นเกมมือถือ/คอนโซล ดูสตรีม', '{"18-24":0.6,"25-34":0.4}', '{"female":0.25,"male":0.75}', null, '{gaming,tech}', '{gaming}', 6),
  ('sme_owner', 'เจ้าของธุรกิจ SME', 'SME owners', 'เจ้าของกิจการเล็ก-กลาง สนใจเครื่องมือทำธุรกิจ', '{"25-34":0.45,"35-44":0.4,"45-54":0.15}', '{"female":0.45,"male":0.55}', null, '{business,marketing}', '{business}', 7),
  ('uni_upcountry', 'นักศึกษาต่างจังหวัด', 'Upcountry students', 'นักศึกษามหาวิทยาลัยต่างจังหวัด งบจำกัด', '{"18-24":1.0}', '{"female":0.55,"male":0.45}', '{"North":0.3,"Northeast":0.35,"South":0.2,"Central":0.15}', '{education,value,entertainment}', '{education,lifestyle}', 8),
  ('traveler', 'สายเที่ยว', 'Travelers', 'เที่ยวในประเทศ วางแผนจากคลิปรีวิว', '{"18-24":0.3,"25-34":0.45,"35-44":0.25}', '{"female":0.55,"male":0.45}', null, '{travel,food}', '{travel}', 9),
  ('tech_early', 'สายไอที/แกดเจ็ต', 'Tech early adopters', 'ซื้อแกดเจ็ตก่อนคนอื่น อ่านสเปก', '{"18-24":0.4,"25-34":0.45,"35-44":0.15}', '{"female":0.25,"male":0.75}', null, '{tech,gaming}', '{tech}', 10),
  ('pet_lover', 'ทาสหมาแมว', 'Pet lovers', 'เลี้ยงสัตว์ ซื้ออาหารและของใช้สัตว์', '{"18-24":0.3,"25-34":0.5,"35-44":0.2}', '{"female":0.65,"male":0.35}', null, '{pets}', '{pets}', 11),
  ('home_decor', 'สายแต่งบ้าน/คอนโด', 'Home & condo', 'แต่งห้อง คอนโด ของใช้ในบ้าน', '{"25-34":0.55,"35-44":0.45}', '{"female":0.65,"male":0.35}', null, '{home,lifestyle}', '{home}', 12),
  ('isan_mass', 'กลุ่มแมส ภาคอีสาน', 'Northeast mass market', 'ผู้ชมภาคอีสาน ชอบคอนเทนต์ภาษาถิ่น', '{"18-24":0.35,"25-34":0.4,"35-44":0.25}', '{"female":0.55,"male":0.45}', '{"Northeast":1.0}', '{entertainment,value}', '{lifestyle}', 13),
  ('silver_age', 'วัยเกษียณ/50+', 'Silver age', 'อายุ 50 ขึ้นไป ดูแลสุขภาพและครอบครัว', '{"45-54":0.4,"55+":0.6}', '{"female":0.55,"male":0.45}', null, '{health,family}', '{health,family}', 14)
on conflict (id) do nothing;

-- Thai TikTok rate card per clip (30–60 s, excluding usage rights) — Clisk, Sep 2026. Mega's upper bound is an assumption.
insert into ref.rate_cards (tier, category_id, format, fee_min_thb, fee_max_thb, source) values
  ('nano',  null, 'in_feed', 1500,   5000,   'clisk_2026'),
  ('micro', null, 'in_feed', 5000,   30000,  'clisk_2026'),
  ('mid',   null, 'in_feed', 30000,  100000, 'clisk_2026'),
  ('macro', null, 'in_feed', 100000, 300000, 'clisk_2026'),
  ('mega',  null, 'in_feed', 300000, 800000, 'clisk_2026');

-- Views-based engagement rate by tier (Socialinsider 2025 medians ~3.75–4.4%); p25/p75 are assumptions.
insert into ref.tier_benchmarks (tier, category_id, metric, p25, p50, p75, source) values
  ('nano',  null, 'er_views', 0.025, 0.044, 0.070, 'socialinsider_2025'),
  ('micro', null, 'er_views', 0.022, 0.039, 0.065, 'socialinsider_2025'),
  ('mid',   null, 'er_views', 0.020, 0.0375, 0.060, 'socialinsider_2025'),
  ('macro', null, 'er_views', 0.020, 0.0395, 0.060, 'socialinsider_2025'),
  ('mega',  null, 'er_views', 0.018, 0.035, 0.055, 'socialinsider_2025'),
  ('nano',  null, 'median_views', 800,    2500,   6000,    'assumption_to_calibrate'),
  ('micro', null, 'median_views', 5000,   15000,  40000,   'assumption_to_calibrate'),
  ('mid',   null, 'median_views', 25000,  60000,  150000,  'assumption_to_calibrate'),
  ('macro', null, 'median_views', 80000,  200000, 450000,  'assumption_to_calibrate'),
  ('mega',  null, 'median_views', 250000, 600000, 1500000, 'assumption_to_calibrate');

insert into ref.kpi_benchmarks (objective, category_id, tier, metric, p25, p50, p75, source, note_th) values
  (null,          null, null, 'sponsored_view_factor', 0.60,  0.80,  1.00, 'assumption_to_calibrate', 'สัดส่วนยอดวิวคลิปที่มีสปอนเซอร์ต่อคลิปทั่วไป ใช้เมื่อครีเอเตอร์มีคลิปสปอนเซอร์ไม่ถึง 3 คลิป'),
  ('conversion',  null, null, 'ctr',                   0.003, 0.006, 0.010, 'assumption_to_calibrate', 'อัตราคลิกลิงก์ต่อยอดวิว ต้องปรับเทียบกับผลแคมเปญของ CVC'),
  ('conversion',  null, null, 'cvr',                   0.010, 0.020, 0.040, 'assumption_to_calibrate', 'อัตราการซื้อต่อคลิก ต้องปรับเทียบกับผลแคมเปญของ CVC'),
  ('tiktok_shop', null, null, 'ctr',                   0.005, 0.010, 0.018, 'assumption_to_calibrate', 'อัตรากดตะกร้าต่อยอดวิว (TikTok Shop) ต้องปรับเทียบ'),
  ('tiktok_shop', null, null, 'cvr',                   0.020, 0.035, 0.060, 'assumption_to_calibrate', 'อัตราการซื้อต่อการกดตะกร้า ต้องปรับเทียบ');
