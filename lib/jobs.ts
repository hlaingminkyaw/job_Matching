export type JobLevel = "Junior" | "Mid" | "Senior" | "Staff";

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  /**
   * Full posting text. Blank lines separate blocks; a line starting with "-"
   * is a bullet. The card shows the first paragraph, the detail drawer renders
   * the whole thing. See components/job-description.tsx.
   */
  description: string;
  mustHave: string[];
  niceToHave: string[];
  /**
   * Recruitment address the "Apply via Gmail" button composes to.
   *
   * SEED DATA IS FICTIONAL. Every company, domain and address below is made
   * up. Replace them with addresses taken from the real posting before anyone
   * uses this to apply — the Apply button puts a ready-to-send mail one click
   * away, so a wrong address means a real application goes nowhere, or goes to
   * someone who never advertised the job.
   */
  email?: string;
  /**
   * Where "View original post" sends the reader. Placeholder paths — run them
   * through normalizeSourceUrl() before rendering a link.
   */
  sourceUrl?: string;
  /** ISO timestamp. Rendered as "3 days ago" by lib/format.ts at read time. */
  postedAt?: string;
  /**
   * Display-only fields. Optional because a row coming back from Supabase only
   * has them once the columns in supabase/match_jobs.sql exist. The card and
   * the drawer leave out whatever is missing.
   */
  employment?: string;
  level?: JobLevel;
  salary?: string;
};

/** Tech Career MM's landing page — the only path safe to guess at. */
const TECH_CAREER_HOME = "https://techcareerweb.com/home";

/** Real postings live at /article-details/<numeric id>. Nothing else resolves. */
const TECH_CAREER_ARTICLE = /^\/article-details\/\d+\/?$/;

function isTechCareer(hostname: string): boolean {
  return hostname === "techcareerweb.com" || hostname.endsWith(".techcareerweb.com");
}

/**
 * Keeps "View original post" off dead links.
 *
 * The seed URLs below were invented as /jobs/<slug>, a route Tech Career MM
 * doesn't have — every one of them 404s. Rather than send a job seeker to an
 * error page, anything that isn't a real /article-details/<id> path is pointed
 * at the site's home page, where the posting can at least be searched for.
 *
 * Applied at read time (app/api/match/route.ts) as well as at seed time, so
 * rows already sitting in Supabase are corrected without a reseed.
 *
 * Swap the placeholders for genuine /article-details/<id> URLs as you collect
 * them and they'll pass through untouched.
 */
export function normalizeSourceUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL at all. No link beats a broken one.
    return undefined;
  }

  // Anything else — LinkedIn job searches, company career pages — is already a
  // working address and passes through as-is.
  if (!isTechCareer(parsed.hostname)) return url;

  return TECH_CAREER_ARTICLE.test(parsed.pathname) ? url : TECH_CAREER_HOME;
}

/**
 * Posting dates are relative to whenever the seed runs, so re-seeding always
 * produces a listing from the past 30 days rather than a frozen snapshot.
 */
function daysAgo(days: number): string {
  // Jitter the clock time so every posting doesn't land on the same second.
  const hours = (days * 7) % 24;
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

/**
 * The text that gets embedded for a job. Title, company and both skill lists
 * are included because a resume mentioning "Laravel" should pull the Laravel
 * roles even when the Burmese prose doesn't repeat the word.
 */
export function jobEmbeddingInput(job: Job): string {
  return [
    `${job.title} at ${job.company}`,
    [job.location, job.level, job.employment].filter(Boolean).join(" · "),
    "",
    job.description,
    "",
    `Must have: ${job.mustHave.join(", ")}`,
    `Nice to have: ${job.niceToHave.join(", ")}`,
  ].join("\n");
}

/**
 * Myanmar-market seed data, written the way Tech Career MM and LinkedIn
 * Myanmar postings read: Burmese prose around English technical terms, monthly
 * salaries in MMK (USD for the remote roles), Yangon townships, ferry and lunch
 * listed as benefits.
 *
 * Section headings vary between postings on purpose. When all 8 of the earlier
 * jobs used identical Burmese headings, every pair looked more alike to the
 * embedding model and the usable similarity range shrank to 0.59–0.73.
 *
 * Companies, domains and email addresses are all fictional — see the `email`
 * field comment above before shipping this.
 */
export const JOBS: Job[] = [
  {
    id: "tkd-jr-01",
    title: "Junior Web Developer",
    company: "Thu Kha Digital",
    location: "လှိုင် (Hlaing), Yangon · On-site",
    employment: "Full-time",
    level: "Junior",
    salary: "MMK 500,000 – 800,000 / month",
    postedAt: daysAgo(2),
    email: "hr@thukhadigital.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/junior-web-developer-hlaing-yangon",
    description: `လှိုင်မြို့နယ်ရှိ ကျွန်ုပ်တို့၏ software house တွင် Junior Web Developer တစ်ဦး ခေါ်ယူလိုပါသည်။ ဘွဲ့ရပြီးစ fresh graduate များကိုလည်း လက်ခံပါသည်။ Senior developer နှစ်ဦးထံမှ mentorship ရရှိမည်ဖြစ်ပြီး မေးခွန်းများ မေးရန် အားပေးပါသည်။

လုပ်ငန်းတာဝန်များ (Responsibilities):

- Figma design များမှ responsive web page များကို HTML, CSS, JavaScript ဖြင့် ရေးသားခြင်း။
- လက်ရှိ client website များရှိ bug များကို ပြင်ဆင်ခြင်း (PHP နှင့် jQuery အများစု)။
- MySQL query အခြေခံများ ရေးသားပြီး database structure ကို လေ့လာခြင်း။

လိုအပ်ချက်များ (Requirements):

- HTML, CSS, JavaScript ကို အသုံးပြုနိုင်ရမည်။ Portfolio သို့မဟုတ် school project ဖြင့် ပြသနိုင်ရမည်။
- PHP အခြေခံ အသိပညာ ရှိရမည် (personal project ဖြစ်လျှင်လည်း ရပါသည်)။
- Git ကို အခြေခံအဆင့် အသုံးပြုတတ်ရမည်။

အကျိုးခံစားခွင့်: ferry, နေ့လည်စာ, သင်တန်းစရိတ် ထောက်ပံ့မှု။`,
    mustHave: ["HTML/CSS", "JavaScript", "PHP"],
    niceToHave: ["Bootstrap", "MySQL", "Git", "jQuery"],
  },
  {
    id: "zch-jf-02",
    title: "Junior Frontend Developer",
    company: "Zay Chat",
    location: "ကမာရွတ် (Kamayut), Yangon · On-site",
    employment: "Full-time",
    level: "Junior",
    salary: "MMK 600,000 – 900,000 / month",
    postedAt: daysAgo(5),
    email: "careers@zaychat.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/junior-frontend-developer-kamayut",
    description: `Zay Chat သည် ဒေသခံ အရောင်းဆိုင်များအတွက် messaging platform တစ်ခု ဖြစ်ပါသည်။ ကျွန်ုပ်တို့၏ web dashboard ကို တည်ဆောက်ရန် Junior Frontend Developer တစ်ဦး လိုအပ်နေပါသည်။

တာဝန်များ:

- React component များကို design spec အတိုင်း တည်ဆောက်ခြင်း။
- Backend team ထံမှ REST API များကို ချိတ်ဆက်ခြင်း။
- မတူညီသော browser နှင့် ဖုန်းအရွယ်အစားများတွင် စစ်ဆေးခြင်း။

အရည်အချင်းများ:

- JavaScript အခြေခံ ခိုင်မာရမည်။ React ကို သင်တန်း သို့မဟုတ် project မှ သိရှိထားရမည်။
- HTML နှင့် CSS ကို ကောင်းစွာ အသုံးပြုနိုင်ရမည်။
- အသစ်သော အရာများကို လေ့လာလိုစိတ် ရှိရမည်။

အကျိုးခံစားခွင့်: ferry, နေ့လည်စာ, နှစ်ပတ်လည် bonus။`,
    mustHave: ["JavaScript", "React", "HTML/CSS"],
    niceToHave: ["Git", "REST APIs", "Bootstrap", "Figma"],
  },
  {
    id: "sws-fe-03",
    title: "Frontend Developer (React)",
    company: "Shwe Stack",
    location: "Remote (Myanmar)",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,500,000 – 2,200,000 / month",
    postedAt: daysAgo(3),
    email: "hr@shwestack.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/frontend-developer-react-remote",
    description: `ရန်ကုန်နှင့် မန္တလေးတွင် ပြန့်ကျဲနေသော remote team တစ်ခုဖြစ်ပြီး၊ ဒေသတွင်း fintech တစ်ခုအတွက် customer dashboard ကို တည်ဆောက်နေပါသည်။ User အများစုသည် mobile data ဖြင့် အလယ်အလတ်အဆင့် ဖုန်းများကို အသုံးပြုကြသဖြင့် bundle size နှင့် latency သည် အခြားနေရာများထက် ပိုမို အရေးကြီးပါသည်။

သင်လုပ်ဆောင်ရမည့်အရာများ:

- React နှင့် Tailwind CSS ဖြင့် dashboard screen များ တည်ဆောက်ခြင်း။
- REST endpoint များကို ချိတ်ဆက်ပြီး loading နှင့် error state များကို သေချာစွာ ကိုင်တွယ်ခြင်း။
- 3G connection ပေါ်တွင် load နိုင်ရန် bundle size ကို ထိန်းသိမ်းခြင်း။

ကျွန်ုပ်တို့ ရှာဖွေနေသူမှာ:

- React အတွေ့အကြုံ (၂) နှစ်အထက် — hooks နှင့် state management အပါအဝင်။
- JavaScript ကို ယုံကြည်စွာ အသုံးပြုနိုင်သူ။ TypeScript ရှိလျှင် ပိုကောင်းပါသည်။
- တည်ငြိမ်သော internet connection နှင့် remote work အတွက် self-direction ရှိသူ။

အကျိုးခံစားခွင့်: အပြည့်အဝ remote, internet allowance, flexible hours။`,
    mustHave: ["React", "JavaScript", "Tailwind CSS"],
    niceToHave: ["TypeScript", "Git", "REST APIs", "Figma"],
  },
  {
    id: "pds-vu-04",
    title: "Frontend Developer (Vue.js)",
    company: "Padamyar Soft",
    location: "ဗဟန်း (Bahan), Yangon · Hybrid",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,400,000 – 2,000,000 / month",
    postedAt: daysAgo(9),
    email: "jobs@padamyarsoft.com.mm",
    sourceUrl:
      "https://www.linkedin.com/jobs/search/?keywords=Vue.js%20Developer&location=Myanmar",
    description: `ကျွန်ုပ်တို့သည် ဟိုတယ်နှင့် ခရီးသွားလုပ်ငန်းများအတွက် booking system များ တည်ဆောက်ပေးနေပါသည်။ Vue 3 ဖြင့် ရေးထားသော front end ကို ဆက်လက် တိုးချဲ့ရန် developer တစ်ဦး လိုအပ်ပါသည်။

နေ့စဉ်လုပ်ငန်းများ:

- Vue 3 Composition API ဖြင့် booking flow များ တည်ဆောက်ခြင်း။
- Pinia ဖြင့် state management ပြုလုပ်ပြီး component library ကို ထိန်းသိမ်းခြင်း။
- Backend team နှင့် ပူးပေါင်း၍ API contract များ သတ်မှတ်ခြင်း။

လိုအပ်သော ကျွမ်းကျင်မှုများ:

- Vue.js အတွေ့အကြုံ (၂) နှစ်အထက်။
- JavaScript နှင့် CSS ကို ခိုင်မာစွာ နားလည်ရမည်။
- Git workflow ကို team တစ်ခုအတွင်း အသုံးပြုဖူးရမည်။

အကျိုးခံစားခွင့်: hybrid (၃ ရက် ရုံးတက်), ferry, ဆေးဘက်ဆိုင်ရာ အာမခံ။`,
    mustHave: ["Vue.js", "JavaScript", "HTML/CSS"],
    niceToHave: ["TypeScript", "Git", "REST APIs", "Tailwind CSS"],
  },
  {
    id: "mby-lv-05",
    title: "Laravel Backend Developer",
    company: "Mandalay Byte",
    location: "လှိုင် (Hlaing), Yangon · Hybrid",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,200,000 – 1,800,000 / month",
    postedAt: daysAgo(1),
    email: "careers@mandalaybyte.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/laravel-backend-developer-yangon",
    description: `ကျွန်ုပ်တို့၏ logistics platform ကို တစ်နေ့လျှင် driver ရာနှင့်ချီ၍ အသုံးပြုလျက်ရှိပါသည်။ Laravel ဖြင့် တည်ဆောက်ထားသော system သည် လျင်မြန်စွာ ကြီးထွားလာသဖြင့် ၎င်းကို ထည့်သွင်းရုံမျှမက ပုံဖော်နိုင်သူ developer တစ်ဦး လိုအပ်နေပါသည်။

လုပ်ငန်းတာဝန်များ (Responsibilities):

- Mobile app များအတွက် REST API များ ရေးသားခြင်းနှင့် ထိန်းသိမ်းခြင်း။
- နှေးကွေးသော request path များကို queued job အဖြစ် ပြောင်းလဲပြီး worker များကို စောင့်ကြည့်ခြင်း။
- MySQL migration များနှင့် ၎င်းတို့နှင့် သက်ဆိုင်သော index များ ရေးသားခြင်း။

လိုအပ်ချက်များ (Requirements):

- Laravel ဖြင့် production အတွေ့အကြုံ (၂) နှစ်အထက် — Eloquent, queue, scheduler။
- MySQL ကို CRUD အဆင့်ထက် ပိုမိုနားလည်ရမည်: join, index နှင့် EXPLAIN ဖတ်နိုင်ရမည်။
- FTP မဟုတ်သော deployment pipeline အတွေ့အကြုံ ရှိရမည်။

အကျိုးခံစားခွင့်: hybrid (တစ်ပတ် ၂ ရက် ရုံးတက်), ferry, နှစ်ပတ်လည် bonus။`,
    mustHave: ["PHP", "Laravel", "MySQL"],
    niceToHave: ["REST APIs", "Redis", "Docker", "Git"],
  },
  {
    id: "ays-sl-06",
    title: "Senior Laravel Developer",
    company: "Ayeyar Systems",
    location: "မရမ်းကုန်း (Mayangone), Yangon · Hybrid",
    employment: "Full-time",
    level: "Senior",
    salary: "MMK 2,500,000 – 3,500,000 / month",
    postedAt: daysAgo(12),
    email: "recruitment@ayeyarsystems.com.mm",
    sourceUrl:
      "https://www.linkedin.com/jobs/search/?keywords=Senior%20Laravel%20Developer&location=Myanmar",
    description: `ကျွန်ုပ်တို့သည် ရန်ကုန်ပတ်ဝန်းကျင်ရှိ စက်ရုံများအတွက် ERP နှင့် inventory system များ တည်ဆောက်ပေးလျက်ရှိပါသည်။ ခြောက်ဦးပါ team ၏ အကြီးဆုံး backend engineer အဖြစ် တာဝန်ယူရမည်ဖြစ်ပြီး၊ နေ့စဉ် code ရေးရုံသာမက architecture ဆုံးဖြတ်ချက်များကိုပါ ချမှတ်ရပါမည်။

တာဝန်များ:

- Laravel API များကို ဒီဇိုင်းဆွဲပြီး multi-tenant architecture ကို ထိန်းသိမ်းခြင်း။
- Team ၏ pull request များကို review ပြုလုပ်ပြီး code quality စံနှုန်း မြှင့်တင်ခြင်း။
- Deployment, backup နှင့် staging environment ကို တာဝန်ယူခြင်း။

အရည်အချင်းများ:

- PHP နှင့် Laravel ဖြင့် အတွေ့အကြုံ (၅) နှစ်အထက်။
- Database design နှင့် query optimization ကို ခိုင်မာစွာ နားလည်ရမည်။
- အငယ်တန်း developer များကို လမ်းညွှန်ပေးခဲ့သည့် အတွေ့အကြုံ ရှိရမည်။

အကျိုးခံစားခွင့်: ဆေးဘက်ဆိုင်ရာ အာမခံ, ferry, project bonus။`,
    mustHave: ["PHP", "Laravel", "MySQL"],
    niceToHave: ["Docker", "AWS", "CI/CD", "Redis"],
  },
  {
    id: "ths-fs-07",
    title: "Full-Stack Developer (Laravel + Vue)",
    company: "Thiri Soft",
    location: "စမ်းချောင်း (Sanchaung), Yangon · On-site",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,800,000 – 2,500,000 / month",
    postedAt: daysAgo(6),
    email: "hr@thirisoft.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/fullstack-laravel-vue-sanchaung",
    description: `ကျွန်ုပ်တို့သည် ဆေးရုံနှင့် ဆေးခန်းများအတွက် patient management system တစ်ခု တည်ဆောက်နေပါသည်။ Backend နှင့် frontend နှစ်ခုလုံးကို ကိုင်တွယ်နိုင်သူ developer တစ်ဦး လိုအပ်ပါသည်။

သင်လုပ်ဆောင်ရမည့်အရာများ:

- Laravel API နှင့် Vue front end နှစ်ခုလုံးတွင် feature များ တည်ဆောက်ခြင်း။
- Patient data အတွက် access control နှင့် audit log များ ရေးသားခြင်း။
- MySQL schema ကို ပြုပြင်ပြီး report query များ ရေးသားခြင်း။

ကျွန်ုပ်တို့ ရှာဖွေနေသူမှာ:

- Laravel နှင့် Vue နှစ်ခုလုံးဖြင့် အတွေ့အကြုံ (၃) နှစ်အထက် ရှိသူ။
- MySQL ကို ကောင်းစွာ အသုံးပြုနိုင်သူ။
- သေချာမှုရှိပြီး အသေးစိတ် ဂရုစိုက်တတ်သူ — ဆေးဘက်ဆိုင်ရာ data ဖြစ်ပါသည်။

အကျိုးခံစားခွင့်: ferry, နေ့လည်စာ, ဆေးဘက်ဆိုင်ရာ အာမခံ။`,
    mustHave: ["PHP", "Laravel", "Vue.js"],
    niceToHave: ["MySQL", "JavaScript", "Git", "REST APIs"],
  },
  {
    id: "inw-fs-08",
    title: "Full-Stack Developer (Node.js + React)",
    company: "Innwa Tech Solutions",
    location: "ရန်ကင်း (Yankin), Yangon · Hybrid",
    employment: "Full-time",
    level: "Senior",
    salary: "MMK 3,000,000 – 4,500,000 / month",
    postedAt: daysAgo(15),
    email: "hr@innwatech.com.mm",
    sourceUrl:
      "https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Developer&location=Myanmar",
    description: `ကျွန်ုပ်တို့သည် ဒေသတွင်း bank နှစ်ခုနှင့် insurance company တစ်ခုအတွက် digital platform များ တည်ဆောက်ပေးနေပါသည်။ Senior engineer အနေဖြင့် product တစ်ခုလုံး၏ technical direction ကို ဦးဆောင်ရမည်ဖြစ်ပါသည်။

လုပ်ငန်းတာဝန်များ (Responsibilities):

- Node.js service များနှင့် React front end ကို end-to-end ဒီဇိုင်းဆွဲပြီး တည်ဆောက်ခြင်း။
- PostgreSQL schema နှင့် query performance ကို ထိန်းသိမ်းခြင်း။
- Code review, technical documentation နှင့် team ၏ စံနှုန်းများ ချမှတ်ခြင်း။

လိုအပ်ချက်များ (Requirements):

- Software engineering အတွေ့အကြုံ (၆) နှစ်အထက်။
- Node.js နှင့် React ကို production တွင် အသုံးပြုဖူးရမည်။
- TypeScript နှင့် relational database ဒီဇိုင်း ကောင်းစွာ နားလည်ရမည်။

အကျိုးခံစားခွင့်: ဆေးဘက်ဆိုင်ရာ အာမခံ, ferry, ပြည်ပ conference စရိတ် ထောက်ပံ့မှု။`,
    mustHave: ["Node.js", "React", "TypeScript"],
    niceToHave: ["PostgreSQL", "REST APIs", "Docker", "CI/CD"],
  },
  {
    id: "sca-fl-09",
    title: "Mobile App Developer (Flutter)",
    company: "Sanchaung Apps",
    location: "စမ်းချောင်း (Sanchaung), Yangon · On-site",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,400,000 – 2,000,000 / month",
    postedAt: daysAgo(4),
    email: "jobs@sanchaungapps.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/flutter-developer-yangon",
    description: `ကျွန်ုပ်တို့၏ delivery app သည် Google Play တွင် download တစ်သိန်းကျော် ရှိပြီးဖြစ်ပါသည်။ Flutter ဖြင့် ရေးသားထားသော codebase ကို ဆက်လက် တိုးချဲ့ရန် developer တစ်ဦး လိုအပ်ပါသည်။

တာဝန်များ:

- Flutter ဖြင့် Android နှင့် iOS နှစ်မျိုးလုံးအတွက် feature များ ရေးသားခြင်း။
- Backend REST API များနှင့် ချိတ်ဆက်ပြီး offline-first behaviour ကို ကိုင်တွယ်ခြင်း။
- Play Store နှင့် App Store release များကို စီမံခြင်း။

အရည်အချင်းများ:

- Flutter နှင့် Dart အတွေ့အကြုံ (၂) နှစ်အထက်။
- State management (Provider, Riverpod သို့မဟုတ် Bloc) ကို နားလည်ရမည်။
- Store တစ်ခုခုသို့ app တင်ဖူးသည့် အတွေ့အကြုံ ရှိရမည်။

အကျိုးခံစားခွင့်: ferry, နေ့လည်စာ, device allowance။`,
    mustHave: ["Flutter", "REST APIs", "Git"],
    niceToHave: ["Firebase", "JavaScript", "MySQL", "Figma"],
  },
  {
    id: "nwo-rn-10",
    title: "React Native Developer",
    company: "Nway Oo Mobile",
    location: "Remote (Myanmar)",
    employment: "Full-time",
    level: "Mid",
    salary: "USD 900 – 1,400 / month",
    postedAt: daysAgo(8),
    email: "careers@nwayoomobile.com.mm",
    sourceUrl:
      "https://www.linkedin.com/jobs/search/?keywords=React%20Native%20Developer&location=Myanmar",
    description: `ကျွန်ုပ်တို့သည် စင်္ကာပူအခြေစိုက် client များအတွက် mobile app များ တည်ဆောက်ပေးသော remote team ဖြစ်ပါသည်။ လစာကို USD ဖြင့် ပေးချေပါသည်။

နေ့စဉ်လုပ်ငန်းများ:

- React Native ဖြင့် cross-platform app များ တည်ဆောက်ခြင်း။
- Native module များကို ချိတ်ဆက်ပြီး performance ပြဿနာများ ဖြေရှင်းခြင်း။
- Client များနှင့် အင်္ဂလိပ်ဘာသာဖြင့် တိုက်ရိုက် ဆက်သွယ်ခြင်း။

လိုအပ်သော ကျွမ်းကျင်မှုများ:

- React Native အတွေ့အကြုံ (၂) နှစ်အထက်။
- JavaScript နှင့် React ကို ခိုင်မာစွာ နားလည်ရမည်။
- အင်္ဂလိပ်စာ ပြောဆိုရေးသားနိုင်ရမည် — client meeting များ ရှိပါသည်။

အကျိုးခံစားခွင့်: အပြည့်အဝ remote, USD လစာ, flexible hours။`,
    mustHave: ["React Native", "JavaScript", "React"],
    niceToHave: ["TypeScript", "REST APIs", "Firebase", "Git"],
  },
  {
    id: "pyd-sm-11",
    title: "Senior Mobile Engineer (Flutter)",
    company: "Pyay Digital",
    location: "ဗဟန်း (Bahan), Yangon · Hybrid",
    employment: "Full-time",
    level: "Senior",
    salary: "MMK 2,800,000 – 3,800,000 / month",
    postedAt: daysAgo(20),
    email: "hr@pyaydigital.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/senior-mobile-engineer-flutter-bahan",
    description: `ကျွန်ုပ်တို့၏ mobile banking app ကို အသုံးပြုသူ သုံးသိန်းကျော် ရှိပါသည်။ Mobile team ၏ ဦးဆောင် engineer အဖြစ် တာဝန်ယူရမည်ဖြစ်ပါသည်။

သင်လုပ်ဆောင်ရမည့်အရာများ:

- Flutter codebase ၏ architecture ကို ဦးဆောင် ဒီဇိုင်းဆွဲခြင်း။
- Security requirement များ (encryption, certificate pinning) ကို အကောင်အထည်ဖော်ခြင်း။
- Mobile developer သုံးဦးကို လမ်းညွှန်ပြီး release process ကို စီမံခြင်း။

ကျွန်ုပ်တို့ ရှာဖွေနေသူမှာ:

- Mobile development အတွေ့အကြုံ (၅) နှစ်အထက်၊ Flutter ဖြင့် (၃) နှစ်အထက်။
- CI/CD ဖြင့် mobile release automation ပြုလုပ်ဖူးသူ။
- Financial သို့မဟုတ် security အရေးကြီးသော app အတွေ့အကြုံ ရှိလျှင် ဦးစားပေးမည်။

အကျိုးခံစားခွင့်: ဆေးဘက်ဆိုင်ရာ အာမခံ, ferry, နှစ်စဉ် bonus။`,
    mustHave: ["Flutter", "CI/CD", "Git"],
    niceToHave: ["Firebase", "REST APIs", "Docker", "Testing"],
  },
  {
    id: "mby-qa-12",
    title: "QA Engineer / Software Tester",
    company: "Mandalay Byte",
    location: "လှိုင် (Hlaing), Yangon · On-site",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,000,000 – 1,500,000 / month",
    postedAt: daysAgo(7),
    email: "careers@mandalaybyte.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/qa-engineer-software-tester-yangon",
    description: `ကျွန်ုပ်တို့၏ logistics platform ကို release မလုပ်မီ စစ်ဆေးပေးမည့် QA Engineer တစ်ဦး ရှာဖွေနေပါသည်။ Developer team နှင့် နီးကပ်စွာ လုပ်ကိုင်ရပါမည်။

တာဝန်များ:

- Feature အသစ်များအတွက် test case နှင့် test plan များ ရေးသားခြင်း။
- Web နှင့် mobile app နှစ်ခုလုံးတွင် manual testing ပြုလုပ်ခြင်း။
- Bug များကို ပြန်လည် ထုတ်လုပ်ပြီး ရှင်းလင်းစွာ မှတ်တမ်းတင်ခြင်း။

အရည်အချင်းများ:

- QA အတွေ့အကြုံ (၂) နှစ်အထက်။
- Test case ဒီဇိုင်းနှင့် regression testing ကို နားလည်ရမည်။
- API testing အတွက် Postman အသုံးပြုတတ်ရမည်။

အကျိုးခံစားခွင့်: ferry, နေ့လည်စာ, နှစ်ပတ်လည် bonus။`,
    mustHave: ["Manual testing", "Test automation", "REST APIs"],
    niceToHave: ["Testing", "Git", "MySQL", "JavaScript"],
  },
  {
    id: "zch-jq-13",
    title: "Junior QA Tester",
    company: "Zay Chat",
    location: "ကမာရွတ် (Kamayut), Yangon · On-site",
    employment: "Full-time",
    level: "Junior",
    salary: "MMK 550,000 – 800,000 / month",
    postedAt: daysAgo(11),
    email: "careers@zaychat.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/junior-qa-tester-kamayut",
    description: `QA အလုပ်ကို စတင်လိုသူများအတွက် အခွင့်အလမ်းတစ်ခု ဖြစ်ပါသည်။ အတွေ့အကြုံ မလိုအပ်သော်လည်း သေချာမှုရှိပြီး စိတ်ရှည်သူ ဖြစ်ရပါမည်။

နေ့စဉ်လုပ်ငန်းများ:

- QA lead ရေးဆွဲထားသော test case များအတိုင်း app ကို စစ်ဆေးခြင်း။
- တွေ့ရှိသော bug များကို အဆင့်လိုက် ပြန်လည်ထုတ်လုပ်ပြီး မှတ်တမ်းတင်ခြင်း။
- Release မတိုင်မီ regression checklist ကို ဖြည့်သွင်းခြင်း။

လိုအပ်သော ကျွမ်းကျင်မှုများ:

- ကွန်ပျူတာ အခြေခံ ကောင်းစွာ တတ်ကျွမ်းရမည်။
- အသေးစိတ် ဂရုစိုက်တတ်ပြီး မှတ်တမ်းကို ရှင်းလင်းစွာ ရေးနိုင်ရမည်။
- အင်္ဂလိပ်စာ ဖတ်/ရေး အသင့်အတင့် တတ်ရမည်။

အကျိုးခံစားခွင့်: ferry, နေ့လည်စာ, QA သင်တန်း ထောက်ပံ့မှု။`,
    mustHave: ["Manual testing"],
    niceToHave: ["Testing", "REST APIs", "Git", "HTML/CSS"],
  },
  {
    id: "inw-aq-14",
    title: "Automation QA Engineer",
    company: "Innwa Tech Solutions",
    location: "ရန်ကင်း (Yankin), Yangon · Hybrid",
    employment: "Full-time",
    level: "Senior",
    salary: "MMK 2,000,000 – 2,800,000 / month",
    postedAt: daysAgo(18),
    email: "hr@innwatech.com.mm",
    sourceUrl:
      "https://www.linkedin.com/jobs/search/?keywords=Automation%20QA%20Engineer&location=Myanmar",
    description: `ကျွန်ုပ်တို့၏ banking platform အတွက် automated test suite ကို တည်ဆောက်ပြီး ထိန်းသိမ်းမည့် engineer တစ်ဦး လိုအပ်ပါသည်။ လက်ရှိတွင် manual testing အများစု ဖြစ်နေသဖြင့် သင်သည် အစမှ စတင် တည်ဆောက်ရပါမည်။

လုပ်ငန်းတာဝန်များ (Responsibilities):

- Playwright သို့မဟုတ် Cypress ဖြင့် end-to-end test suite တည်ဆောက်ခြင်း။
- CI/CD pipeline အတွင်း test များကို ထည့်သွင်း၍ အလိုအလျောက် run စေခြင်း။
- API test coverage ကို တိုးချဲ့ပြီး flaky test များကို ရှင်းလင်းခြင်း။

လိုအပ်ချက်များ (Requirements):

- Test automation အတွေ့အကြုံ (၄) နှစ်အထက်။
- JavaScript သို့မဟုတ် TypeScript ဖြင့် test ရေးနိုင်ရမည်။
- CI/CD pipeline အတွေ့အကြုံ ရှိရမည်။

အကျိုးခံစားခွင့်: hybrid, ဆေးဘက်ဆိုင်ရာ အာမခံ, certification ထောက်ပံ့မှု။`,
    mustHave: ["Test automation", "JavaScript", "CI/CD"],
    niceToHave: ["TypeScript", "Testing", "Docker", "REST APIs"],
  },
  {
    id: "sdl-ux-15",
    title: "UI/UX Designer",
    company: "Shwe Design Lab",
    location: "ဗဟန်း (Bahan), Yangon · Hybrid",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,300,000 – 1,900,000 / month",
    postedAt: daysAgo(3),
    email: "hello@shwedesignlab.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/ui-ux-designer-bahan-yangon",
    description: `ကျွန်ုပ်တို့သည် မြန်မာနိုင်ငံရှိ startup များအတွက် product design ဝန်ဆောင်မှု ပေးနေပါသည်။ Designer အနေဖြင့် user research မှ final handoff အထိ တာဝန်ယူရပါမည်။

သင်လုပ်ဆောင်ရမည့်အရာများ:

- Figma ဖြင့် wireframe, prototype နှင့် high-fidelity screen များ ဆွဲခြင်း။
- အသုံးပြုသူများနှင့် တွေ့ဆုံ၍ usability test ပြုလုပ်ခြင်း။
- Developer များထံ design handoff ပြုလုပ်ပြီး အကောင်အထည်ဖော်မှုကို စစ်ဆေးခြင်း။

ကျွန်ုပ်တို့ ရှာဖွေနေသူမှာ:

- Product design အတွေ့အကြုံ (၃) နှစ်အထက်နှင့် portfolio ရှိသူ။
- Figma ကို ကျွမ်းကျင်စွာ အသုံးပြုနိုင်သူ။
- မြန်မာစာ typography နှင့် ဖုန်းသေးများပေါ်တွင် ဒီဇိုင်းဆွဲဖူးသူ ဖြစ်လျှင် ပိုကောင်းပါသည်။

အကျိုးခံစားခွင့်: hybrid, device allowance, design tool subscription။`,
    mustHave: ["UI/UX", "Figma"],
    niceToHave: ["HTML/CSS", "Design systems", "Accessibility", "Prototyping"],
  },
  {
    id: "ths-pd-16",
    title: "Senior Product Designer",
    company: "Thiri Soft",
    location: "Remote (Myanmar)",
    employment: "Full-time",
    level: "Senior",
    salary: "USD 1,500 – 2,200 / month",
    postedAt: daysAgo(14),
    email: "hr@thirisoft.com.mm",
    sourceUrl:
      "https://www.linkedin.com/jobs/search/?keywords=Product%20Designer&location=Myanmar",
    description: `ကျွန်ုပ်တို့၏ healthcare product အတွက် design ကို ဦးဆောင်မည့် Senior Product Designer တစ်ဦး ရှာဖွေနေပါသည်။ ဆရာဝန်များနှင့် သူနာပြုများသည် ကျွန်ုပ်တို့၏ အသုံးပြုသူများ ဖြစ်ပါသည်။

တာဝန်များ:

- Product တစ်ခုလုံး၏ design direction ကို သတ်မှတ်ခြင်း။
- Design system ကို တည်ဆောက်ပြီး ထိန်းသိမ်းခြင်း။
- ဆေးရုံများသို့ သွားရောက်၍ အသုံးပြုသူ လေ့လာမှုများ ပြုလုပ်ခြင်း။

အရည်အချင်းများ:

- Product design အတွေ့အကြုံ (၅) နှစ်အထက်။
- Design system တည်ဆောက်ဖူးသည့် အတွေ့အကြုံ ရှိရမည်။
- Accessibility ကို requirement အဖြစ် ရှုမြင်တတ်သူ ဖြစ်ရမည်။

အကျိုးခံစားခွင့်: အပြည့်အဝ remote, USD လစာ, ပြည်ပ conference။`,
    mustHave: ["UI/UX", "Figma", "Design systems"],
    niceToHave: ["Accessibility", "Prototyping", "HTML/CSS", "Testing"],
  },
  {
    id: "thc-do-17",
    title: "DevOps Engineer",
    company: "Thiri Cloud",
    location: "မရမ်းကုန်း (Mayangone), Yangon · Hybrid",
    employment: "Full-time",
    level: "Senior",
    salary: "MMK 2,200,000 – 3,200,000 / month",
    postedAt: daysAgo(10),
    email: "careers@thiricloud.com.mm",
    sourceUrl:
      "https://www.linkedin.com/jobs/search/?keywords=DevOps%20Engineer&location=Myanmar",
    description: `ကျွန်ုပ်တို့သည် မြန်မာနိုင်ငံရှိ SaaS company များအတွက် infrastructure ကို စီမံပေးလျက်ရှိပါသည်။ Deployment pipeline များ တည်ဆောက်ခြင်းနှင့် production environment များကို တည်ငြိမ်စွာ ထိန်းသိမ်းခြင်းတို့ကို တာဝန်ယူရပါမည်။

လုပ်ငန်းတာဝန်များ (Responsibilities):

- Docker နှင့် CI/CD pipeline များကို တည်ဆောက်ပြီး ထိန်းသိမ်းခြင်း။
- Linux server များနှင့် Nginx configuration များကို စီမံခြင်း။
- Monitoring, alerting နှင့် backup strategy များ ချမှတ်ခြင်း။

လိုအပ်ချက်များ (Requirements):

- DevOps သို့မဟုတ် system administration အတွေ့အကြုံ (၄) နှစ်အထက်။
- Linux, Docker နှင့် CI/CD tool များကို ကောင်းစွာ နားလည်ရမည်။
- Bash သို့မဟုတ် Python ဖြင့် script ရေးနိုင်ရမည်။

အကျိုးခံစားခွင့်: hybrid, on-call allowance, certification စရိတ် ထောက်ပံ့မှု။`,
    mustHave: ["Linux", "Docker", "CI/CD"],
    niceToHave: ["AWS", "Nginx", "Python", "Kubernetes"],
  },
  {
    id: "emh-js-18",
    title: "Junior DevOps / System Administrator",
    company: "Eain Mya Hosting",
    location: "သင်္ဃန်းကျွန်း (Thingangyun), Yangon · On-site",
    employment: "Full-time",
    level: "Junior",
    salary: "MMK 700,000 – 1,000,000 / month",
    postedAt: daysAgo(22),
    email: "jobs@eainmyahosting.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/junior-devops-sysadmin-thingangyun",
    description: `ကျွန်ုပ်တို့သည် ဒေသခံ လုပ်ငန်းများအတွက် hosting နှင့် server ဝန်ဆောင်မှု ပေးနေပါသည်။ Server စီမံခန့်ခွဲမှုကို လေ့လာလိုသော junior တစ်ဦး လိုအပ်ပါသည်။

နေ့စဉ်လုပ်ငန်းများ:

- Linux server များပေါ်တွင် client site များ setup ပြုလုပ်ခြင်း။
- Backup များ စစ်ဆေးခြင်းနှင့် SSL certificate များ သက်တမ်းတိုးခြင်း။
- Senior engineer နှင့်အတူ deployment script များ ရေးသားခြင်း။

လိုအပ်သော ကျွမ်းကျင်မှုများ:

- Linux command line ကို အခြေခံအဆင့် အသုံးပြုတတ်ရမည်။
- Networking အခြေခံ (DNS, HTTP, SSL) နားလည်ရမည်။
- အလုပ်ချိန်ပြင်ပ on-call ကို လက်ခံနိုင်ရမည်။

အကျိုးခံစားခွင့်: ferry, on-call allowance, Linux သင်တန်း ထောက်ပံ့မှု။`,
    mustHave: ["Linux", "Nginx"],
    niceToHave: ["Docker", "Git", "Python", "AWS"],
  },
  {
    id: "mmw-wp-19",
    title: "WordPress Developer",
    company: "Myint Mo Web Studio",
    location: "ချမ်းအေးသာစံ (Chanayethazan), Mandalay · On-site",
    employment: "Full-time",
    level: "Junior",
    salary: "MMK 450,000 – 700,000 / month",
    postedAt: daysAgo(16),
    email: "hr@myintmoweb.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/wordpress-developer-mandalay",
    description: `မန္တလေးမြို့ရှိ ကျွန်ုပ်တို့၏ web studio တွင် ဟိုတယ်, ကျောင်း နှင့် ဒေသခံ လုပ်ငန်းငယ်များအတွက် website များ တည်ဆောက်ပေးလျက်ရှိပါသည်။ WordPress အလုပ်များ အများဆုံး ဖြစ်ပါသည်။

တာဝန်များ:

- Client လိုအပ်ချက်အရ WordPress theme နှင့် plugin များကို စိတ်ကြိုက် ပြင်ဆင်ခြင်း။
- WooCommerce ဖြင့် online shop များ တည်ဆောက်ခြင်း။
- လက်ရှိ site များ၏ speed နှင့် security ကို ထိန်းသိမ်းခြင်း။

အရည်အချင်းများ:

- WordPress အတွေ့အကြုံ (၁) နှစ်အထက်။
- PHP, HTML, CSS နှင့် အခြေခံ JavaScript တတ်ကျွမ်းရမည်။
- cPanel နှင့် domain/hosting စီမံခန့်ခွဲမှု အခြေခံ နားလည်ရမည်။

အကျိုးခံစားခွင့်: နေ့လည်စာ, project အလိုက် commission။`,
    mustHave: ["WordPress", "PHP", "HTML/CSS"],
    niceToHave: ["MySQL", "JavaScript", "jQuery", "Bootstrap"],
  },
  {
    id: "gpm-sw-20",
    title: "Senior WordPress / PHP Developer",
    company: "Golden Page Media",
    location: "ဗိုလ်တထောင် (Botahtaung), Yangon · Hybrid",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,100,000 – 1,600,000 / month",
    postedAt: daysAgo(25),
    email: "careers@goldenpagemedia.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/senior-wordpress-php-developer-yangon",
    description: `ကျွန်ုပ်တို့သည် မြန်မာနိုင်ငံရှိ သတင်းဌာနများနှင့် publisher များအတွက် website များ စီမံပေးနေပါသည်။ နေ့စဉ် visitor သိန်းနှင့်ချီ ဝင်ရောက်သဖြင့် performance သည် အဓိက ဖြစ်ပါသည်။

သင်လုပ်ဆောင်ရမည့်အရာများ:

- Custom WordPress theme နှင့် plugin များကို အစမှ ရေးသားခြင်း။
- Caching နှင့် database query optimization ဖြင့် site speed မြှင့်တင်ခြင်း။
- Junior developer နှစ်ဦးကို လမ်းညွှန်ခြင်း။

ကျွန်ုပ်တို့ ရှာဖွေနေသူမှာ:

- WordPress နှင့် PHP ဖြင့် အတွေ့အကြုံ (၄) နှစ်အထက် ရှိသူ။
- MySQL query optimization ကို နားလည်သူ။
- Traffic များသော site များကို ကိုင်တွယ်ဖူးသူ။

အကျိုးခံစားခွင့်: hybrid, ferry, နှစ်ပတ်လည် bonus။`,
    mustHave: ["WordPress", "PHP", "MySQL"],
    niceToHave: ["JavaScript", "Nginx", "Redis", "HTML/CSS"],
  },
  {
    id: "mdl-py-21",
    title: "Python Developer (Data)",
    company: "Mya Data Lab",
    location: "ကမာရွတ် (Kamayut), Yangon · Hybrid",
    employment: "Full-time",
    level: "Mid",
    salary: "MMK 1,600,000 – 2,400,000 / month",
    postedAt: daysAgo(5),
    email: "jobs@myadatalab.com.mm",
    sourceUrl: "https://techcareerweb.com/jobs/python-developer-data-kamayut",
    description: `ကျွန်ုပ်တို့သည် ဘဏ်များနှင့် telecom operator များအတွက် data analytics ဝန်ဆောင်မှု ပေးနေပါသည်။ Python ဖြင့် data pipeline များ ရေးသားမည့် developer တစ်ဦး လိုအပ်ပါသည်။

လုပ်ငန်းတာဝန်များ (Responsibilities):

- Python ဖြင့် data cleaning နှင့် transformation script များ ရေးသားခြင်း။
- PostgreSQL မှ data များကို ထုတ်ယူပြီး report အဖြစ် ပြင်ဆင်ခြင်း။
- Analyst team အတွက် အလိုအလျောက် run သော scheduled job များ တည်ဆောက်ခြင်း။

လိုအပ်ချက်များ (Requirements):

- Python အတွေ့အကြုံ (၂) နှစ်အထက် — pandas အပါအဝင်။
- SQL ကို ကောင်းစွာ ရေးနိုင်ရမည်။
- Data တွင် ပါဝင်သော ပုံမမှန်မှုများကို သတိပြုမိတတ်ရမည်။

အကျိုးခံစားခွင့်: hybrid, ferry, ဆေးဘက်ဆိုင်ရာ အာမခံ။`,
    mustHave: ["Python", "PostgreSQL", "Pandas"],
    niceToHave: ["ETL", "Linux", "Docker", "Git"],
  },
  {
    id: "ays-de-22",
    title: "Data Engineer",
    company: "Ayeyar Systems",
    location: "မရမ်းကုန်း (Mayangone), Yangon · On-site",
    employment: "Full-time",
    level: "Senior",
    salary: "MMK 2,600,000 – 3,600,000 / month",
    postedAt: daysAgo(28),
    email: "recruitment@ayeyarsystems.com.mm",
    sourceUrl:
      "https://www.linkedin.com/jobs/search/?keywords=Data%20Engineer&location=Myanmar",
    description: `ကျွန်ုပ်တို့၏ ERP client များထံမှ data များကို စုစည်း၍ warehouse တစ်ခု တည်ဆောက်နေပါသည်။ Pipeline များကို ဒီဇိုင်းဆွဲပြီး တည်ဆောက်မည့် Data Engineer တစ်ဦး လိုအပ်ပါသည်။

တာဝန်များ:

- ETL pipeline များကို ဒီဇိုင်းဆွဲပြီး Airflow ဖြင့် orchestrate ပြုလုပ်ခြင်း။
- PostgreSQL warehouse schema ကို ဒီဇိုင်းဆွဲခြင်း။
- Data quality check များ ရေးသားပြီး pipeline failure များကို ဖြေရှင်းခြင်း။

အရည်အချင်းများ:

- Data engineering အတွေ့အကြုံ (၄) နှစ်အထက်။
- Python နှင့် SQL ကို ခိုင်မာစွာ နားလည်ရမည်။
- Docker နှင့် cloud environment အတွေ့အကြုံ ရှိရမည်။

အကျိုးခံစားခွင့်: ferry, ဆေးဘက်ဆိုင်ရာ အာမခံ, certification ထောက်ပံ့မှု။`,
    mustHave: ["Python", "ETL", "PostgreSQL"],
    niceToHave: ["Docker", "AWS", "Linux", "Pandas"],
  },
];
