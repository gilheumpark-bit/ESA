/**
 * Electrical Certification Database
 * ------------------------------------
 * 국내외 전기 관련 자격증 정보.
 * 시험 일정, 응시 자격, 과목, 합격 기준, 관련 KEC/NEC 조항 매핑.
 * 모든 정보 = 사실 정보 (저작권 자유).
 *
 * PART 1: 한국 자격증
 * PART 2: 미국 자격증
 * PART 3: 일본 자격증
 * PART 4: 국제 자격증
 * PART 5: Lookup functions
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface Certification {
  id: string;
  country: string;
  name: string;
  nameEn: string;
  /** 등급/분류 */
  grade: string;
  /** 주관 기관 */
  organization: string;
  organizationUrl: string;
  /** 시험 과목 */
  subjects: ExamSubject[];
  /** 응시 자격 */
  eligibility: string;
  /** 합격 기준 */
  passCriteria: string;
  /** 시험 주기 */
  examFrequency: string;
  /** 시험 형태 */
  examFormat: string;
  /** 관련 기준서 조항 */
  relatedStandards: string[];
  /** 참고 링크 */
  infoUrl: string;
  /** 비고 */
  note?: string;
}

export interface ExamSubject {
  name: string;
  type: 'written' | 'practical' | 'interview';
  /** 관련 KEC/NEC 조항 (출제 범위) */
  relatedArticles?: string[];
}

export interface ExamSchedule {
  certId: string;
  year: number;
  sessions: ExamSession[];
  source: string;
}

export interface ExamSession {
  session: number;        // 1회, 2회, 3회
  registrationStart: string;  // YYYY-MM-DD
  registrationEnd: string;
  writtenExamDate: string;
  writtenResultDate: string;
  practicalExamStart?: string;
  practicalExamEnd?: string;
  practicalResultDate?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 한국 자격증
// ═══════════════════════════════════════════════════════════════════════════════

const KOREA_CERTS: Certification[] = [
  {
    id: 'KR-PE-EE',
    country: 'KR',
    name: '전기기술사',
    nameEn: 'Professional Engineer (Electrical)',
    grade: '기술사',
    organization: '한국산업인력공단',
    organizationUrl: 'https://www.q-net.or.kr',
    subjects: [
      { name: '단답형+주관식 (400분)', type: 'written', relatedArticles: ['KEC-전체', 'NEC-전체'] },
      { name: '구술 면접 (30분)', type: 'interview' },
    ],
    eligibility: '기사 취득 후 4년 이상 실무경력, 또는 산업기사 후 5년, 또는 관련학과 석사+6년',
    passCriteria: '필기 60점 이상, 면접 60점 이상',
    examFrequency: '연 4회',
    examFormat: '주관식 서술형 (필기) + 구술 면접',
    relatedStandards: ['KEC 전체', '전기사업법', '전기안전관리법', '판단기준'],
    infoUrl: 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&gId=',
    note: '전기 분야 최고 자격. 기술사사무소 개업, 감리, 안전관리자 선임 가능',
  },
  {
    id: 'KR-EE',
    country: 'KR',
    name: '전기기사',
    nameEn: 'Engineer Electricity',
    grade: '기사',
    organization: '한국산업인력공단',
    organizationUrl: 'https://www.q-net.or.kr',
    subjects: [
      { name: '전력공학', type: 'written', relatedArticles: ['KEC-310', 'KEC-320', 'KEC-340'] },
      { name: '전기기기', type: 'written', relatedArticles: ['KEC-341', 'KEC-351'] },
      { name: '회로이론 및 제어공학', type: 'written' },
      { name: '전기설비기술기준 및 판단기준', type: 'written', relatedArticles: ['KEC-전체'] },
      { name: '전기설비설계 및 관리 (실기)', type: 'practical', relatedArticles: ['KEC-212', 'KEC-232', 'KEC-311'] },
    ],
    eligibility: '관련학과 4년제 졸업, 또는 산업기사+1년 실무, 또는 실무 4년',
    passCriteria: '필기 과목당 40점 이상 + 평균 60점, 실기 60점 이상',
    examFrequency: '연 3회',
    examFormat: '필기 객관식 + 실기 필답형',
    relatedStandards: ['KEC 2021', '전기사업법', '전기안전관리법'],
    infoUrl: 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&gId=',
    note: '전기 분야 대표 자격. 전기안전관리자, 전기감리원 가능',
  },
  {
    id: 'KR-ECE',
    country: 'KR',
    name: '전기공사기사',
    nameEn: 'Engineer Electrical Construction',
    grade: '기사',
    organization: '한국산업인력공단',
    organizationUrl: 'https://www.q-net.or.kr',
    subjects: [
      { name: '전기응용 및 공사재료', type: 'written', relatedArticles: ['KEC-230', 'KEC-211'] },
      { name: '전기설비기술기준 및 판단기준', type: 'written', relatedArticles: ['KEC-전체'] },
      { name: '전기기기', type: 'written' },
      { name: '송배전공학', type: 'written', relatedArticles: ['KEC-320', 'KEC-321'] },
      { name: '전기공사 시공 (실기)', type: 'practical', relatedArticles: ['KEC-211', 'KEC-232', 'KEC-250'] },
    ],
    eligibility: '관련학과 4년제 졸업, 또는 산업기사+1년 실무',
    passCriteria: '필기 과목당 40점 이상 + 평균 60점, 실기 60점 이상',
    examFrequency: '연 3회',
    examFormat: '필기 객관식 + 실기 필답형',
    relatedStandards: ['KEC 2021', '전기공사업법'],
    infoUrl: 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&gId=',
    note: '전기공사업 등록에 필요한 자격',
  },
  {
    id: 'KR-EIE',
    country: 'KR',
    name: '전기산업기사',
    nameEn: 'Industrial Engineer Electricity',
    grade: '산업기사',
    organization: '한국산업인력공단',
    organizationUrl: 'https://www.q-net.or.kr',
    subjects: [
      { name: '전기자기학', type: 'written' },
      { name: '전력공학', type: 'written', relatedArticles: ['KEC-310', 'KEC-320'] },
      { name: '전기기기', type: 'written' },
      { name: '회로이론', type: 'written' },
      { name: '전기설비 (실기)', type: 'practical', relatedArticles: ['KEC-212', 'KEC-232'] },
    ],
    eligibility: '관련학과 2년제 졸업, 또는 기능사+1년 실무, 또는 실무 2년',
    passCriteria: '필기 과목당 40점 이상 + 평균 60점, 실기 60점 이상',
    examFrequency: '연 3회',
    examFormat: '필기 객관식 + 실기 필답형',
    relatedStandards: ['KEC 2021'],
    infoUrl: 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&gId=',
  },
  {
    id: 'KR-EF',
    country: 'KR',
    name: '전기기능사',
    nameEn: 'Craftsman Electricity',
    grade: '기능사',
    organization: '한국산업인력공단',
    organizationUrl: 'https://www.q-net.or.kr',
    subjects: [
      { name: '전기이론, 전기기기, 전기설비', type: 'written', relatedArticles: ['KEC-210', 'KEC-211', 'KEC-212'] },
      { name: '전기설비 작업 (실기)', type: 'practical' },
    ],
    eligibility: '제한 없음',
    passCriteria: '필기 60점, 실기 60점',
    examFrequency: '연 4회 이상 (상시)',
    examFormat: '필기 객관식 + 실기 작업형',
    relatedStandards: ['KEC 기초'],
    infoUrl: 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&gId=',
  },
  {
    id: 'KR-FIRE-EE',
    country: 'KR',
    name: '소방설비기사 (전기분야)',
    nameEn: 'Fire Protection Engineer (Electrical)',
    grade: '기사',
    organization: '한국산업인력공단',
    organizationUrl: 'https://www.q-net.or.kr',
    subjects: [
      { name: '소방원론', type: 'written' },
      { name: '소방전기일반', type: 'written' },
      { name: '소방관계법규', type: 'written' },
      { name: '소방전기시설의 구조 및 원리', type: 'written', relatedArticles: ['KEC-234.2'] },
      { name: '소방전기설비 설계 및 시공 (실기)', type: 'practical' },
    ],
    eligibility: '관련학과 4년제 졸업, 또는 산업기사+1년',
    passCriteria: '필기 과목당 40점 + 평균 60점, 실기 60점',
    examFrequency: '연 3회',
    examFormat: '필기 객관식 + 실기 필답형',
    relatedStandards: ['소방시설법', 'KEC-234'],
    infoUrl: 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&gId=',
  },
  {
    id: 'KR-NE',
    country: 'KR',
    name: '신재생에너지발전설비기사 (태양광)',
    nameEn: 'New & Renewable Energy Engineer (PV)',
    grade: '기사',
    organization: '한국산업인력공단',
    organizationUrl: 'https://www.q-net.or.kr',
    subjects: [
      { name: '신재생에너지 기초', type: 'written', relatedArticles: ['KEC-500', 'KEC-501'] },
      { name: '태양광발전 설계 및 시공', type: 'written', relatedArticles: ['KEC-501.1', 'KEC-501.2', 'KEC-501.3'] },
      { name: '태양광발전 운영 및 유지보수', type: 'written' },
      { name: '태양광발전 실무 (실기)', type: 'practical', relatedArticles: ['KEC-501'] },
    ],
    eligibility: '관련학과 졸업 또는 실무경력',
    passCriteria: '필기 과목당 40점 + 평균 60점, 실기 60점',
    examFrequency: '연 2회',
    examFormat: '필기 객관식 + 실기 필답형',
    relatedStandards: ['KEC 제5편', '신에너지법'],
    infoUrl: 'https://www.q-net.or.kr/crf005.do?id=crf00505&gSite=Q&gId=',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 미국 자격증
// ═══════════════════════════════════════════════════════════════════════════════

const US_CERTS: Certification[] = [
  {
    id: 'US-PE-EE',
    country: 'US',
    name: 'Professional Engineer (Electrical)',
    nameEn: 'PE Electrical',
    grade: 'PE License',
    organization: 'NCEES (National Council of Examiners for Engineering and Surveying)',
    organizationUrl: 'https://ncees.org',
    subjects: [
      { name: 'FE Exam (Fundamentals of Engineering)', type: 'written' },
      { name: 'PE Electrical and Computer: Power', type: 'written', relatedArticles: ['NEC-전체'] },
    ],
    eligibility: 'ABET 인증 공학 학위 + FE 합격 + 4년 실무경력',
    passCriteria: 'NCEES 컷오프 점수 (비공개, 약 50~55%)',
    examFrequency: 'CBT (Computer-Based Testing) — 연중 수시',
    examFormat: 'CBT 객관식 80문항 / 9시간',
    relatedStandards: ['NEC 2023', 'NFPA 70E', 'IEEE C2'],
    infoUrl: 'https://ncees.org/engineering/pe/',
    note: 'PE 라이선스는 주(State)별 발급. 설계 도장 날인 권한',
  },
  {
    id: 'US-FE',
    country: 'US',
    name: 'Fundamentals of Engineering',
    nameEn: 'FE Exam',
    grade: 'EIT (Engineer in Training)',
    organization: 'NCEES',
    organizationUrl: 'https://ncees.org',
    subjects: [
      { name: 'FE Electrical and Computer', type: 'written' },
    ],
    eligibility: 'ABET 인증 공학 학위 (또는 최종학년 재학)',
    passCriteria: 'NCEES 컷오프 (비공개)',
    examFrequency: 'CBT — 연중 수시',
    examFormat: 'CBT 객관식 110문항 / 5시간 20분',
    relatedStandards: ['NEC 기초'],
    infoUrl: 'https://ncees.org/engineering/fe/',
    note: 'PE 취득 전 필수 시험. 학부 졸업 시점에 응시 권장',
  },
  {
    id: 'US-JOURNEYMAN',
    country: 'US',
    name: 'Journeyman Electrician',
    nameEn: 'Journeyman Electrician License',
    grade: 'Journeyman',
    organization: '주(State) 면허 위원회',
    organizationUrl: 'https://www.electricallicenserenewal.com',
    subjects: [
      { name: 'NEC Code Knowledge', type: 'written', relatedArticles: ['NEC-210', 'NEC-240', 'NEC-250', 'NEC-310', 'NEC-430'] },
    ],
    eligibility: '4년 도제(Apprenticeship) + 8,000시간 현장 실습',
    passCriteria: '70% 이상 (주마다 다름)',
    examFrequency: '주별 상이',
    examFormat: '객관식 (NEC 코드북 오픈북)',
    relatedStandards: ['NEC 2023'],
    infoUrl: 'https://www.bls.gov/ooh/construction-and-extraction/electricians.htm',
    note: 'NEC 코드북 참조 가능 (오픈북). 주별 면허 요건 다름',
  },
  {
    id: 'US-MASTER',
    country: 'US',
    name: 'Master Electrician',
    nameEn: 'Master Electrician License',
    grade: 'Master',
    organization: '주(State) 면허 위원회',
    organizationUrl: 'https://www.electricallicenserenewal.com',
    subjects: [
      { name: 'Advanced NEC Code + Business', type: 'written', relatedArticles: ['NEC-전체'] },
    ],
    eligibility: 'Journeyman 면허 + 2~4년 추가 경력',
    passCriteria: '70~75% (주마다 다름)',
    examFrequency: '주별 상이',
    examFormat: '객관식 (NEC 오픈북)',
    relatedStandards: ['NEC 2023', 'OSHA'],
    infoUrl: 'https://www.bls.gov/ooh/construction-and-extraction/electricians.htm',
    note: '독립 계약 가능. 전기공사업 면허의 최고 등급',
  },
  {
    id: 'US-NFPA-CESCP',
    country: 'US',
    name: 'Certified Electrical Safety Compliance Professional',
    nameEn: 'CESCP',
    grade: 'Certification',
    organization: 'NFPA',
    organizationUrl: 'https://www.nfpa.org',
    subjects: [
      { name: 'NFPA 70E Electrical Safety', type: 'written', relatedArticles: ['NEC-전체'] },
    ],
    eligibility: '전기 안전 실무 3년 이상',
    passCriteria: '합격선 비공개',
    examFrequency: '연중 수시 (CBT)',
    examFormat: 'CBT 객관식',
    relatedStandards: ['NFPA 70E', 'NEC 2023'],
    infoUrl: 'https://www.nfpa.org/training-and-events/certification/cescp',
    note: '전기 안전 전문가 인증. 아크플래시 위험 평가 관련',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 일본 자격증
// ═══════════════════════════════════════════════════════════════════════════════

const JP_CERTS: Certification[] = [
  {
    id: 'JP-DENKEN-1',
    country: 'JP',
    name: '第一種電気主任技術者',
    nameEn: 'Class 1 Chief Electrical Engineer',
    grade: '제1종',
    organization: '一般財団法人 電気技術者試験センター',
    organizationUrl: 'https://www.shiken.or.jp',
    subjects: [
      { name: '이론', type: 'written' },
      { name: '전력', type: 'written' },
      { name: '기계', type: 'written' },
      { name: '법규', type: 'written', relatedArticles: ['JIS-전체'] },
    ],
    eligibility: '제한 없음 (단, 실무 선임 시 경력 필요)',
    passCriteria: '과목당 60점 이상 (과목 합격 유효 3년)',
    examFrequency: '연 1회 (9월)',
    examFormat: '1차: 객관식, 2차: 기술형',
    relatedStandards: ['전기사업법', '전기설비기술기준', 'JIS C 0364'],
    infoUrl: 'https://www.shiken.or.jp/examination/e-chief1.html',
    note: '모든 전압의 전기시설 보안 감독 가능. 일본 전기 최고 자격',
  },
  {
    id: 'JP-DENKEN-2',
    country: 'JP',
    name: '第二種電気主任技術者',
    nameEn: 'Class 2 Chief Electrical Engineer',
    grade: '제2종',
    organization: '電気技術者試験センター',
    organizationUrl: 'https://www.shiken.or.jp',
    subjects: [
      { name: '이론/전력/기계/법규', type: 'written', relatedArticles: ['JIS-전체'] },
    ],
    eligibility: '제한 없음',
    passCriteria: '과목당 60점 이상',
    examFrequency: '연 1회 (9월)',
    examFormat: '1차: 객관식, 2차: 기술형',
    relatedStandards: ['전기사업법', 'JIS C 0364'],
    infoUrl: 'https://www.shiken.or.jp/examination/e-chief2.html',
    note: '170kV 미만 전기시설 보안 감독',
  },
  {
    id: 'JP-DENKEN-3',
    country: 'JP',
    name: '第三種電気主任技術者 (電験三種)',
    nameEn: 'Class 3 Chief Electrical Engineer',
    grade: '제3종',
    organization: '電気技術者試験センター',
    organizationUrl: 'https://www.shiken.or.jp',
    subjects: [
      { name: '이론', type: 'written' },
      { name: '전력', type: 'written' },
      { name: '기계', type: 'written' },
      { name: '법규', type: 'written', relatedArticles: ['JIS-525.1', 'JIS-542.1'] },
    ],
    eligibility: '제한 없음',
    passCriteria: '과목당 60점 이상 (CBT 도입)',
    examFrequency: '연 2회 (CBT)',
    examFormat: 'CBT 객관식',
    relatedStandards: ['전기사업법', 'JIS C 0364'],
    infoUrl: 'https://www.shiken.or.jp/examination/e-chief3.html',
    note: '50kV 미만 전기시설. 일본에서 가장 인기 있는 전기 자격',
  },
  {
    id: 'JP-DENKO-1',
    country: 'JP',
    name: '第一種電気工事士',
    nameEn: 'Class 1 Electrician',
    grade: '제1종',
    organization: '電気技術者試験センター',
    organizationUrl: 'https://www.shiken.or.jp',
    subjects: [
      { name: '필기 (객관식)', type: 'written', relatedArticles: ['JIS-521.1', 'JIS-432.1'] },
      { name: '기능 (실기 작업)', type: 'practical' },
    ],
    eligibility: '제한 없음 (면허 교부 시 실무 3년)',
    passCriteria: '필기 60점, 실기 합격',
    examFrequency: '연 1회 (10~12월)',
    examFormat: '필기 객관식 + 실기 작업형 (40분)',
    relatedStandards: ['전기공사사업법', 'JIS C 0364'],
    infoUrl: 'https://www.shiken.or.jp/examination/e-construction1.html',
    note: '최대 수전 전력 500kW 미만 시설의 전기공사 가능',
  },
  {
    id: 'JP-DENKO-2',
    country: 'JP',
    name: '第二種電気工事士',
    nameEn: 'Class 2 Electrician',
    grade: '제2종',
    organization: '電気技術者試験センター',
    organizationUrl: 'https://www.shiken.or.jp',
    subjects: [
      { name: '필기 (객관식)', type: 'written' },
      { name: '기능 (실기 작업)', type: 'practical' },
    ],
    eligibility: '제한 없음',
    passCriteria: '필기 60점, 실기 합격',
    examFrequency: '연 2회 (상반기/하반기)',
    examFormat: '필기 객관식 + 실기 작업형 (40분)',
    relatedStandards: ['전기공사사업법'],
    infoUrl: 'https://www.shiken.or.jp/examination/e-construction2.html',
    note: '일반용 전기공작물(주택 등)의 전기공사. 일본 입문 자격',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — 국제 자격증
// ═══════════════════════════════════════════════════════════════════════════════

const INTL_CERTS: Certification[] = [
  {
    id: 'INTL-IEC-EXPERT',
    country: 'INT',
    name: 'IEC System of Conformity Assessment (IECEE)',
    nameEn: 'IECEE CB Scheme',
    grade: 'CB Test Certificate',
    organization: 'IEC',
    organizationUrl: 'https://www.iecee.org',
    subjects: [
      { name: 'IEC 표준 적합성 평가', type: 'written' },
    ],
    eligibility: '인증 기관(NCB) 소속 시험 엔지니어',
    passCriteria: 'CB 시험 보고서 발행',
    examFrequency: '수시',
    examFormat: '제품 시험 + 보고서',
    relatedStandards: ['IEC 60364', 'IEC 61439', 'IEC 62368'],
    infoUrl: 'https://www.iecee.org',
    note: '제품 국제 인증. 자격증이 아닌 적합성 인증 체계',
  },
  {
    id: 'INTL-CMVP',
    country: 'INT',
    name: 'Certified Measurement & Verification Professional',
    nameEn: 'CMVP',
    grade: 'Certification',
    organization: 'EVO (Efficiency Valuation Organization)',
    organizationUrl: 'https://evo-world.org',
    subjects: [
      { name: 'IPMVP (에너지 절감 검증)', type: 'written' },
    ],
    eligibility: '에너지 관리 실무 3년',
    passCriteria: '시험 합격',
    examFrequency: '연중 수시',
    examFormat: 'CBT',
    relatedStandards: ['IPMVP', 'ISO 50001'],
    infoUrl: 'https://evo-world.org/en/cmvp',
    note: '에너지 절감량 측정 및 검증 전문가 인증',
  },
  {
    id: 'INTL-CEM',
    country: 'INT',
    name: 'Certified Energy Manager',
    nameEn: 'CEM',
    grade: 'Certification',
    organization: 'AEE (Association of Energy Engineers)',
    organizationUrl: 'https://www.aeecenter.org',
    subjects: [
      { name: '에너지 관리/감사/효율', type: 'written' },
    ],
    eligibility: '에너지 관련 학위 + 3년 경력, 또는 10년 경력',
    passCriteria: '시험 합격 (4시간)',
    examFrequency: '연중 수시',
    examFormat: 'CBT 객관식',
    relatedStandards: ['ISO 50001', 'ASHRAE'],
    infoUrl: 'https://www.aeecenter.org/certifications/cem',
    note: '에너지 매니저 국제 인증. 한국에서도 응시 가능',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Lookup Functions
// ═══════════════════════════════════════════════════════════════════════════════

export const ALL_CERTIFICATIONS = [...KOREA_CERTS, ...US_CERTS, ...JP_CERTS, ...INTL_CERTS];

/** 국가별 자격증 목록 */
export function getCertsByCountry(country: string): Certification[] {
  return ALL_CERTIFICATIONS.filter(c => c.country === country);
}

/** 자격증 ID로 조회 */
export function getCertById(id: string): Certification | null {
  return ALL_CERTIFICATIONS.find(c => c.id === id) ?? null;
}

/** 관련 기준서로 자격증 검색 */
export function getCertsByStandard(standard: string): Certification[] {
  return ALL_CERTIFICATIONS.filter(c =>
    c.relatedStandards.some(s => s.includes(standard))
  );
}

/** 전체 자격증 수 */
export function getCertCount(): { total: number; byCountry: Record<string, number> } {
  const byCountry: Record<string, number> = {};
  for (const c of ALL_CERTIFICATIONS) {
    byCountry[c.country] = (byCountry[c.country] ?? 0) + 1;
  }
  return { total: ALL_CERTIFICATIONS.length, byCountry };
}
