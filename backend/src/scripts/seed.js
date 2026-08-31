/* ==============================================================================
   Disha Database Seed Script
   Populates questions, categories, and scheduled tournaments from initial dataset.
   ============================================================================== */

import { db } from '../config/db.js';

const INITIAL_QUESTIONS = [
  {
    id: 'ssc_01',
    category_code: 'SSC',
    subject: 'Indian Polity',
    year: 'SSC CGL 2023 Tier-1',
    difficulty: 'Medium',
    question_en: 'Under which Article of the Indian Constitution is the "Right to Constitutional Remedies" guaranteed?',
    question_hi: 'भारतीय संविधान के किस अनुच्छेद के तहत "संवैधानिक उपचारों का अधिकार" गारंटीकृत है?',
    options_en: ['Article 19', 'Article 21', 'Article 32', 'Article 44'],
    options_hi: ['अनुच्छेद 19', 'अनुच्छेद 21', 'अनुच्छेद 32', 'अनुच्छेद 44'],
    correct_option_index: 2,
    explanation_en: 'Article 32 provides the Right to Constitutional Remedies, allowing individuals to move the Supreme Court directly for the enforcement of fundamental rights. Dr. B.R. Ambedkar called Article 32 the "Heart and Soul of the Constitution".',
    explanation_hi: 'अनुच्छेद 32 संवैधानिक उपचारों का अधिकार प्रदान करता है। डॉ. बी.आर. अंबेडकर ने अनुच्छेद 32 को "संविधान का हृदय और आत्मा" कहा था।'
  },
  {
    id: 'ssc_02',
    category_code: 'SSC',
    subject: 'History',
    year: 'SSC CHSL 2024 Tier-1',
    difficulty: 'Easy',
    question_en: 'Who founded the Brahmo Samaj in 1828 in Calcutta?',
    question_hi: '1828 में कलकत्ता में ब्रह्म समाज की स्थापना किसने की थी?',
    options_en: ['Swami Dayanand Saraswati', 'Raja Ram Mohan Roy', 'Ishwar Chandra Vidyasagar', 'Swami Vivekananda'],
    options_hi: ['स्वामी दयानंद सरस्वती', 'राजा राम मोहन राय', 'ईश्वर चंद्र विद्यासागर', 'स्वामी विवेकानंद'],
    correct_option_index: 1,
    explanation_en: 'Raja Ram Mohan Roy founded the Brahmo Samaj in August 1828 to promote monotheism, eradicate idol worship, and champion social reforms such as the abolition of Sati.',
    explanation_hi: 'राजा राम मोहन राय ने अगस्त 1828 में ब्रह्म समाज की स्थापना की थी। उन्होंने सती प्रथा के उन्मूलन में अग्रणी भूमिका निभाई।'
  },
  {
    id: 'ssc_03',
    category_code: 'SSC',
    subject: 'Geography',
    year: 'SSC CGL 2023 Tier-2',
    difficulty: 'Medium',
    question_en: 'Which Indian river is known as the "Sorrow of Bihar" due to its frequent devastating floods?',
    question_hi: 'बार-बार आने वाली विनाशकारी बाढ़ के कारण किस भारतीय नदी को "बिहार का शोक" कहा जाता है?',
    options_en: ['Gandak', 'Kosi', 'Son', 'Ghaghara'],
    options_hi: ['गंडक', 'कोसी', 'सोन', 'घाघरा'],
    correct_option_index: 1,
    explanation_en: 'The Kosi River is known as the "Sorrow of Bihar" because of its unpredictable course shifts, high silt load, and recurring catastrophic flooding during the monsoon season.',
    explanation_hi: 'कोसी नदी को अपने मार्ग बदलने और गंभीर बाढ़ लाने के कारण "बिहार का शोक" कहा जाता है।'
  },
  {
    id: 'ssc_04',
    category_code: 'SSC',
    subject: 'Economics',
    year: 'SSC CGL 2024 Tier-1',
    difficulty: 'Hard',
    question_en: 'What is the primary indicator used by the Reserve Bank of India (RBI) to measure headline retail inflation?',
    question_hi: 'खुदरा मुद्रास्फीति को मापने के लिए भारतीय रिज़र्व बैंक (RBI) द्वारा मुख्य संकेतक के रूप में क्या उपयोग किया जाता है?',
    options_en: ['Wholesale Price Index (WPI)', 'Consumer Price Index - Combined (CPI-C)', 'GDP Deflator', 'Index of Industrial Production (IIP)'],
    options_hi: ['थोक मूल्य सूचकांक (WPI)', 'उपभोक्ता मूल्य सूचकांक - संयुक्त (CPI-C)', 'जीडीपी डिफ्लेटर', 'औद्योगिक उत्पादन सूचकांक (IIP)'],
    correct_option_index: 1,
    explanation_en: 'Under the monetary policy framework adopted following the Urjit Patel committee recommendations, the RBI targets Consumer Price Index - Combined (CPI-C) inflation within the 4% (+/- 2%) band.',
    explanation_hi: 'उर्जित पटेल समिति की सिफारिशों के बाद अपनाए गए मौद्रिक नीति ढांचे के तहत, आरबीआई उपभोक्ता मूल्य सूचकांक - संयुक्त (CPI-C) मुद्रास्फीति को 4% (+/- 2%) बैंड के भीतर लक्षित करता है।'
  },
  {
    id: 'ssc_05',
    category_code: 'SSC',
    subject: 'General Science',
    year: 'SSC MTS 2023',
    difficulty: 'Easy',
    question_en: 'Which part of the human brain is primarily responsible for maintaining posture, balance, and motor coordination?',
    question_hi: 'मानव मस्तिष्क का कौन सा भाग मुख्य रूप से शारीरिक मुद्रा, संतुलन और मांसपेशियों के समन्वय को बनाए रखने के लिए जिम्मेदार है?',
    options_en: ['Cerebrum', 'Cerebellum', 'Medulla Oblongata', 'Hypothalamus'],
    options_hi: ['प्रमस्तिष्क (सेरेब्रम)', 'अनुमस्तिष्क (सेरिबैलम)', 'मेडुला ऑब oblongata', 'हाइपोथैलेमस'],
    correct_option_index: 1,
    explanation_en: 'The cerebellum coordinates voluntary muscle movements, fine-tunes motor activities, and maintains posture and equilibrium.',
    explanation_hi: 'अनुमस्तिष्क (सेरिबैलम) स्वैच्छिक मांसपेशियों की गतिविधियों का समन्वय करता है तथा शरीर का संतुलन और मुद्रा बनाए रखता है।'
  }
];

export async function seedDatabase() {
  console.log('[Seed] Seeding initial questions and tournaments into database...');

  // 1. Seed Categories
  const categories = [
    { code: 'SSC', name: 'Staff Selection Commission (CGL, CHSL, MTS)', icon: '🏛️' },
    { code: 'UPSSSC', name: 'UPSSSC (PET, Lekhpal, VDO)', icon: '🌾' },
    { code: 'Railways', name: 'Railway Recruitment Board (NTPC, Group D)', icon: '🚆' },
    { code: 'Bank', name: 'Banking & Insurance (IBPS, SBI, RBI)', icon: '🏦' }
  ];

  for (const cat of categories) {
    await db.query(
      `INSERT INTO question_categories (id, code, name, icon)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      ['cat_' + cat.code.toLowerCase(), cat.code, cat.name, cat.icon]
    );
  }

  // 2. Seed Questions
  for (const q of INITIAL_QUESTIONS) {
    await db.query(
      `INSERT INTO questions (id, category_code, subject, year, difficulty, question_en, question_hi, options_en, options_hi, correct_option_index, explanation_en, explanation_hi)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET question_en = EXCLUDED.question_en, correct_option_index = EXCLUDED.correct_option_index`,
      [q.id, q.category_code, q.subject, q.year, q.difficulty, q.question_en, q.question_hi, JSON.stringify(q.options_en), JSON.stringify(q.options_hi), q.correct_option_index, q.explanation_en, q.explanation_hi]
    );
  }

  // 3. Seed Default Tournament
  await db.query(
    `INSERT INTO quizzes (id, title, category, prize_pool_paise, entry_fee_paise, duration_seconds, time_per_question_sec, total_questions, registered_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    ['live_maha_01', 'Maha-Dhamaka SSC CGL All India Live Quiz', 'SSC', 1000000, 0, 300, 15, 5, 1842]
  );

  console.log('[Seed] Database seeding completed successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase().then(() => process.exit(0)).catch((err) => {
    console.error('[Seed Error]:', err);
    process.exit(1);
  });
}
