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
export const TECH_CAREER_HOME = "https://techcareerweb.com/home";

/**
 * A LinkedIn job search scoped to Myanmar.
 *
 * Keywords are kept deliberately broad — "Laravel", not "Senior Laravel
 * Developer". Myanmar's market is small enough that an over-specific query
 * returns an empty results page, which reads as a broken link even though it
 * technically loaded.
 */
export function linkedInSearch(keywords: string): string {
  // encodeURIComponent rather than URLSearchParams: it renders spaces as %20,
  // which is what LinkedIn's own share links use.
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
    keywords,
  )}&location=Myanmar`;
}

/**
 * Broad search term for a job title, used when a posting has no usable link.
 *
 * "Senior Mobile Engineer (Flutter)" becomes "Mobile Engineer", and
 * "QA Engineer / Software Tester" becomes "QA Engineer" — seniority and
 * parenthetical stacks narrow a Myanmar search to nothing.
 */
export function searchKeywordFor(title: string): string {
  const cleaned = title
    .replace(/\s*\([^)]*\)/g, "")
    .split("/")[0]
    .replace(/\b(junior|senior|staff|mid|lead|principal)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "Software Developer";
}

/**
 * Real Tech Career MM content sits at one of two paths:
 *
 *   /article-details/<slug>  — an individual posting. The slug is the short
 *                              id the API returns ("Jwlg84BV"), or the
 *                              article's uuid; both resolve to the same page.
 *   /articles/<uuid>         — a category listing, not one job.
 *
 * Everything else, including the invented /jobs/<slug> paths this seed data
 * started with, is dead.
 */
const TECH_CAREER_ARTICLE =
  /^\/(?:articles\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}|article-details\/[A-Za-z0-9_-]{4,64})\/?$/i;

/**
 * Tech Career MM pages confirmed to hold real content.
 *
 * Status codes can't verify these: /articles/<anything> answers 200, and a
 * wrong uuid renders an empty shell rather than a 404. Each entry below was
 * checked by hand for a real <title> and og:description before being added.
 *
 * These are category listings rather than single postings — the one below is
 * the site's "Software Development" category, which it describes as covering
 * front-end, back-end, full-stack and mobile roles. Add further categories as
 * you collect their uuids; the jobs referencing them need no other change.
 */
export const TECH_CAREER_ARTICLES = {
  softwareDevelopment: "https://techcareerweb.com/articles/3eb742e5-bbfb-43b8-9ab0-fbe9b7cbc213",
} as const;

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
 * The link a job card should actually open. Never returns a dead address.
 *
 * Order: the posting's own URL if it survives normalizing, otherwise a
 * LinkedIn search for that kind of role in Myanmar — which always lands on
 * live listings, even for a posting that carries no link at all.
 */
export function jobSourceUrl(job: Pick<Job, "title" | "sourceUrl">): string {
  const normalized = normalizeSourceUrl(job.sourceUrl);

  // TECH_CAREER_HOME means normalizeSourceUrl() rescued a dead path. It loads,
  // but it's the site's front page — nothing to do with this role. A keyword
  // search for the same job is a better landing place, and it means rows
  // seeded before this fix stop pointing at a generic page without a reseed.
  if (!normalized || normalized === TECH_CAREER_HOME) {
    return linkedInSearch(searchKeywordFor(job.title));
  }

  return normalized;
}

/**
 * Whether a link lands on a list of roles rather than one specific posting.
 *
 * The button says "Find similar roles" for these. Labelling a keyword search
 * "View original post" is the same broken promise as a 404 — the reader clicks
 * expecting this job and gets a search page.
 */
export function isSearchLink(url: string): boolean {
  if (url === TECH_CAREER_HOME) return true;
  try {
    return new URL(url).pathname.startsWith("/jobs/search");
  } catch {
    return false;
  }
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
/**
 * Real Tech Career MM postings. GENERATED — do not edit by hand.
 *
 *   node scripts/fetch-jobs.ts --limit 40 --pages 5
 *
 * Companies, salaries and application addresses are taken verbatim from the
 * live postings, so they are real: a wrong edit here sends a real application
 * to the wrong place. Re-run the script rather than patching entries.
 *
 * Fetched 2026-10-12.
 */
export const JOBS: Job[] = [
  {
    id: "0c09090c-3aa1-4de2-9264-521fa97b9455",
    title: "Data Analyst",
    company: "KBZ Bank",
    location: "Yangon, Myanmar",
    description: "KBZ Bank နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nData Analyst (M/F) 1 Post\n\nJob Purpose\nThe BI Analyst will be a key member of the Analytics Center of Excellence, the role holder is accountable for working in business intelligence tasks as an individual contributor and responsible for delivering actionable insights, building robust BI solutions, and ensuring data-driven decision-making across the organization. This role requires strong expertise in SQL, Power BI, Excel, and data integration, with the ability to translate complex datasets into clear and meaningful business insights.\n\n1. Data Analysis & Insights\nAnalyze large, complex datasets to identify trends, patterns, and opportunities.\nProvide timely and accurate insights to support business units and senior management.\nBuild dashboards, reports, and KPIs in Power BI and Excel to monitor business performance.\n\n2. BI Solution Development\nDesign, develop, and maintain interactive reports and data models in Power BI.\nOptimize SQL queries, stored procedures, and views for performance and scalability.\nCollaborate with cross-functional teams to translate business requirements into BI solutions.\n\n3. Data Integration & Management\nIntegrate and validate data from multiple sources (databases, flat files, etc.).\nEnsure data quality, consistency, and accuracy across BI platforms.\nWork closely with Data Engineering and IT teams on ETL/ELT processes.\n\n4. Governance & Standards\nAdhere to Analytics CoE best practices and governance frameworks.\nContribute to establishing standard KPIs, definitions, and reporting templates.\nSupport self-service BI initiatives and promote data literacy across business units.\n\nJob Requirements\nDegree in quantitative discipline (computer science, mathematics, engineering etc.).\n\nTechnical Expertise\nAdvanced SQL skills (query optimization, joins, subqueries, CTEs, stored procedures).\nStrong proficiency in Power BI (DAX, Power Query, modeling, dashboard design).\nAdvanced knowledge of Excel (pivot tables, advanced formulas, Power Pivot).\n\nAnalytical & Business Skills\nStrong problem-solving and critical-thinking abilities.\nAbility to translate business questions into analytical requirements.\nExperience in performance monitoring, forecasting, and ad-hoc analysis.\n\nOther Requirements\nBachelor’s degree in Computer Science, Information Systems, Data Analytics, or related field.\n2–3+ years of experience in BI, data analysis, or analytics roles.\nExcellent communication skills with the ability to work across business and technical teams.\n\nBenefits\nQuarterly Bonus\nFerry (YGN area)\nUniform\nHealth Care Support\n\nမိမိအနေနဲ့စိတ်ပါဝင်စားတယ်ဆိုရင် လျှောက်ထားလိုတဲ့ ရာထူးအမည်၊ CV တို့နဲ့အတူ career@kbzbank.com ကိုပေးပို့လျှောက်ထားနိုင်ပါသည်။",
    mustHave: ["Analytics","PostgreSQL","Performance","ETL"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/l5Jw1eJx",
    email: "career@kbzbank.com",
    postedAt: "2026-10-12T03:51:27.161Z",
    level: "Mid",
  },
  {
    id: "c809b229-2d59-4f85-9768-e6738ca3a605",
    title: "Mobile Android Software Engineer",
    company: "KBZ Bank",
    location: "Yangon, Myanmar",
    description: "KBZ Bank နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nMobile Android Software Engineer (M/F)\n\nJob Purpose\nThe purpose of this role is to develop secure, scalable, and high-performance android applications in alignment with business, compliance, and security requirements. The android software engineer plays a key role in delivering reliable mobile solutions through close collaboration with product, backend, and QA teams.\n\nKey Responsibilities\nWork collaboratively in an Agile/Scrum team\nWork with in-house application teams and other IT teams in the department\nHave passion for technology and the ability to learn new concepts quickly\nHave strong sense of ownership and drive\nHave strong communication skills\nHave detail-oriented mindset\nStand firm on his/her own ideas but also at the same time flexible enough to listen to and accept others’ ideas\nHighly-motivated self-starter with a passion for making high-quality software, maximum coding speed and scalability\nMake high-quality software with a passion of highly-motivated self-starter for maximum coding speed and scalability\nUnderstand and translate business requirements into technical requirements\nPrepare required documentation and specification\nWork closely with product management & UX to execute an idea from concept to delivery using excellent software design, coding, & processes\nBuild reusable code and libraries for future use\nSolve the problems and do the judgment with excellency\nWrite unit tests and design integration tests with application teams\nPublish and manage the applications\nMonitor the system performance\nProvide production support\n\nJob Requirements\nRequires a bachelor's degree or diploma and certificates in area of specialty\nStrong knowledge of Android SDK, including how to effectively deal with different versions and screen sizes of mobile devices.\nAbility to effectively use Android UI kits without compromising the performance.\n1–3+ years of extensive experience in mobile app development.\nAbility to write in Kotlin is a must.\nKnowledge of all or either of these architectural patterns: Clean, MVP, MVVM, MVI.\nExperience with Instruments and other memory tuning and performance tools.\nExperience working with offline data storages.\nProficient understanding of code versioning tools, especially Git.\nExperience integrating third-party services like Google Maps, Firebase, etc.\nExperience publishing apps on the Play Store.\nKnowledge in reactive programming.\nEnsure the performance, quality, and responsiveness of applications.\n\nBenefits\nQuarterly Bonus\nFerry (YGN area)\nUniform\nHealth Care Support\n\nမိမိအနေနဲ့စိတ်ပါဝင်စားတယ်ဆိုရင် လျှောက်ထားလိုတဲ့ ရာထူးအမည်၊ CV တို့နဲ့အတူ career@kbzbank.com ကိုပေးပို့လျှောက်ထားနိုင်ပါသည်။",
    mustHave: ["Performance","Testing","Git","Firebase"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/XP37a3GU",
    email: "career@kbzbank.com",
    postedAt: "2026-10-12T03:49:02.492Z",
    level: "Mid",
  },
  {
    id: "0d89193f-183e-45ef-937d-b215aef31686",
    title: "Senior Network Engineer",
    company: "KBZ Bank",
    location: "Yangon, Myanmar",
    description: "KBZ Bank နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nSenior Network Engineer (M/F) 1 Post\n\nJob Purpose\nSenior Network Engineers are responsible for day-to-day operation of Data Center and branch networks availability, security and performance. Designing, Implementing and administering Intranet, Extranet, Local Area Network, Wide Area Network. Assist in budget planning and recruitment Project Management, Coordination. Work with all levels of staff within and outside of Technology Function and external organization.\n\nKey Responsibilities\n• Architect, Designing, implementing, and managing network equipment\n• Maximize the network services availability and minimize the service disruptions\n• Configure and maintain firewalls, load balancers and Data Centre Network to maximize network efficiency and security\n• Troubleshooting, resolving the network problems and managing the vendor, local system integrator to identify the potential issues\n• Maintain configurations database integrity and up to date\n• Regular patching and updates as per schedule\n• Solid understanding of Cloud network components / concepts\n• Review and approve network and firewall change within internal and vendor\n• Implementing data, network security measures for multi-cloud architecture\n• Lead / Manage / Coordinate projects to deliver on time with periodic status reports to management.\n• Update Operation Documentation (technical, CMDB, etc...)\n• Monitor the tier 3 escalated issue and report to meet the vendor, service provider’s SLA.\n• Product and new technologies evaluation\n• Vendor / Supplier sourcing, procuring network equipment, network communication links\n• Work with vendors and consultants to ensure the desired level of requirements\n• Prepare Project Acquisition Requisitions, Root Cause Analysis\n• Developing network security and related procedures\n• Willing to work in extended hours and perform standby duty after office hours\n\nJob Requirements\n• Diploma in Network Engineering or bachelor’s degree in engineering / IT related field.\n• Prefer certified network professional in CISCO (CCNP/CCIE), Next Generation Firewalls\n• 7-10 years of experience in IT and/or Network related field\n• 5+ years of experience in Medium/Large enterprise networks.\n• Strong understanding of network hardware and technologies\n• Project Management and Coordination\n• MPLS, DPLC, BGP, VXLAN, SAN, QoS, VLAN, STP, NAT, DHCP, Static, Dynamic routing, VPC, SDN domain\n• Hub and spoke WAN topology, DMVPN, SDWAN\n• Clustered Enterprise firewalls, load-balancers setup and configuration.\n• Implementing Threat Preventions, Intrusion detection prevention system\n• Network Function Virtualization\n• Multi-Cloud connectivity environment\n• Data and Network Security\n\nBenefits\nQuarterly Bonus\nFerry (YGN area)\nUniform\nHealth Care Support\n\nမိမိအနေနဲ့စိတ်ပါဝင်စားတယ်ဆိုရင် လျှောက်ထားလိုတဲ့ ရာထူးအမည်၊ CV တို့နဲ့အတူ career@kbzbank.com ကိုပေးပို့လျှောက်ထားနိုင်ပါသည်။",
    mustHave: ["Performance","Next.js"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/ovTR82Ku",
    email: "career@kbzbank.com",
    postedAt: "2026-10-12T03:27:24.277Z",
    level: "Senior",
  },
  {
    id: "43f47312-73f7-47fa-b0db-358a71de56fd",
    title: "Data Engineer (Project-Based)",
    company: "Daiichi Life",
    location: "Yangon, Myanmar",
    description: "Daiichi Life နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nData Engineer (Project-Based)(M/F) 1 Post\n\nJob Description\nDevelop and maintain robust data pipelines that meet organizational standards for security, scalability, and performance across traditional and cloud platforms.\nEnhance data integration and consistency by collaborating with cross-functional teams and supporting enterprise-wide data reliability initiatives.\nSupport team members in agile methodologies, continuous delivery practices, and technical upskills to boost delivery speed.\nEnsure quality and compliance through precise design, code, and test reviews aligned with development standards and platform guardrails.\nProvide expert-level production support by troubleshooting incidents, performing root cause analysis, and contributing to system stability and resilience.\nDesign, build, test, and deploy consumable data pipelines in alignment with platform guardrails and standards for delivery, risk, and security.\nCollaborate with teams across DLMM to enhance data consistency and integration.\nSupport the Lead Data Engineer in improving data reliability and availability across the organization.\nContribute to the Pod’s delivery velocity by mentoring new team members on agile practices, continuous delivery, and team standards, while supporting upskilling of existing members.\nConduct design, code, and test reviews to ensure built-in quality and adherence to development standards.\nEnsure solutions are secure, reliable, scalable, and meet usability and performance expectations.\nProvide Level 3 support for production incidents, including troubleshooting and root cause analysis.\nActively participate in Scrum ceremonies, reporting on progress, dependencies, impediments, and next steps.\n\nRequirements\nDegree in a technical or analytical field with preferred focus on Data Science or Computer Science or Information Systems\nMinimum 5 years of proven experience in developing data pipelines using ETL methodologies in both traditional and cloud environments.\nPreferably with a good understanding of Financial Services, Insurance, or Life Insurance.\nPreferably with experience in Business Intelligence (BI) tools and visualization platforms such as Power BI or Tableau, — including dashboard design, data modeling, and performance optimization.\nAbility to organize/manage multiple priorities and projects coupled with the flexibility to adapt to changes in a fast-paced environment\nSelf-motivated team player. Must possess the ability to research and resolve issues independently while working across teams to acquire needed information\nStrong communication and collaboration skills.\nResults-driven with a focus on operational efficiency.\nHigh attention to detail and analytical rigor.\nProactive learner with a growth mindset and willingness to challenge the status quo\nMinimum 5 years of development experience, ideally with: Microsoft stack - SSIS, SSRS, SQL (Stored Procedures, Functions, Triggers), Azure technologies - Azure Data Factory (ADF), Azure SQL, Azure DevOps\n\nBonus experience in: Data Lake, Synapse, PySpark, etc.\n\nGood command of both spoken and written English and Burmese.\n\nသင့်ရဲ့ resume (အလုပ်လျှောက်လွှာ) ကို HR@daiichilife.com.mm သိုပေးပိုပြီး အခုပဲ လျှောက်ထားလိုက်ပါ။",
    mustHave: ["Performance","UI/UX","Next.js","ETL"],
    niceToHave: ["PostgreSQL"],
    sourceUrl: "https://techcareerweb.com/article-details/i1JYEvbB",
    email: "HR@daiichilife.com.mm",
    postedAt: "2026-10-11T04:34:36.249Z",
    level: "Mid",
  },
  {
    id: "b5f9f905-d672-45cb-8ab2-be93ec3f54d4",
    title: "System Security Engineer",
    company: "Myanmar Software Integrated Solutions (MSIS)",
    location: "Hlaing, Yangon",
    description: "Myanmar Software Integrated Solutions (MSIS) နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nSystem Security Engineer (M/F)\n\n𝐋𝐨𝐜𝐚𝐭𝐢𝐨𝐧: Hlaing Township, Yangon\n𝐒𝐚𝐥𝐚𝐫𝐲: Attractive\n𝐖𝐨𝐫𝐤𝐢𝐧𝐠 𝐇𝐨𝐮𝐫𝐬: 8:30 AM – 5:30 PM (Monday – Friday)\n𝐎𝐟𝐟 𝐃𝐚𝐲: Sat/Sun & Public Holidays\n\n𝐖𝐡𝐚𝐭 𝐘𝐨𝐮'𝐥𝐥 𝐁𝐞 𝐃𝐨𝐢𝐧𝐠\nImplement and maintain security best practices across systems and infrastructure\nMonitor, investigate, and respond to security events and incidents\nManage access controls, identity management, and security configurations\nSupport cloud and on-premises environments with a security-first mindset\nWork closely with development, infrastructure, and operations teams to strengthen security posture\nContribute to system hardening, vulnerability management, and compliance initiatives\n\n𝐖𝐡𝐚𝐭 𝐖𝐞'𝐫𝐞 𝐋𝐨𝐨𝐤𝐢𝐧𝐠 𝐅𝐨𝐫\nbachelor's degree in computer science, Information Technology, or a related field\nExperience in System Administration, Infrastructure, Security Operations, or related areas\nStrong understanding of Linux/Windows Server environments, networking, and cloud technologies\nKnowledge of security concepts such as Firewalls, IAM, SSL, Access Control, and Security Monitoring\nStrong troubleshooting, analytical, and problem-solving skills\nWillingness to learn and stay updated with evolving security technologies\n\nHow to Apply\nInterested candidates are invited to submit their CV to:\nsawghaylawla@atgsys.com\n09958649788 (𝐕𝐢𝐛𝐞𝐫)\n\n𝐉𝐨𝐢𝐧 𝐌𝐒𝐈𝐒 𝐚𝐧𝐝 𝐡𝐞𝐥𝐩 𝐛𝐮𝐢𝐥𝐝 𝐬𝐞𝐜𝐮𝐫𝐞, 𝐫𝐞𝐥𝐢𝐚𝐛𝐥𝐞, 𝐚𝐧𝐝 𝐢𝐧𝐧𝐨𝐯𝐚𝐭𝐢𝐯𝐞 𝐭𝐞𝐜𝐡𝐧𝐨𝐥𝐨𝐠𝐲 𝐬𝐨𝐥𝐮𝐭𝐢𝐨𝐧𝐬 𝐭𝐡𝐚𝐭 𝐝𝐫𝐢𝐯𝐞 𝐛𝐮𝐬𝐢𝐧𝐞𝐬𝐬 𝐬𝐮𝐜𝐜𝐞𝐬𝐬.",
    mustHave: ["Linux"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/T1rVHxLy",
    email: "sawghaylawla@atgsys.com",
    postedAt: "2026-10-11T04:18:32.452Z",
    level: "Mid",
  },
  {
    id: "1ff195da-f396-4b65-a0f1-3b1e9b641c48",
    title: "Java Instructor",
    company: "Knowledge Villa",
    location: "Yangon, Myanmar",
    description: "Knowledge Villa နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nJava Instructor (M/F)\n\nLocation - M tower\n\nလိုအပ်သောအရည်အချင်းများ\nIT အထူးပြုကောလိပ် ဘွဲ့ရရှိထားသူ သို့မဟုတ် IT နှင့် သက်ဆိုင်သော လုပ်ငန်းအတွေ့အကြုံ အနည်းဆုံး (၁) နှစ်ရှိသူ (သို့မဟုတ် Junior Level အဆင့်ရှိသူ)\nJavaဖြင့် softwre ရေးဖူးသူ\njava ကို ပြန်လည် သင်ကြား ပို့ချပေးနိုင်သူ\nProgramming အခြေခံဗဟုသုတ\nGit/GitHub အခြေခံ အသုံးပြုနိုင်ခြင်း\n\nအောက်ပါ အချက်များ ရှိပါက ပိုမို ဦးစားပေးပါမည်\nJava, Spring Boot, Vue.js စသည်တို့ဖြင့် ဆော့ဖ်ဝဲလ် ရေးဆွဲဖူးသည့် အတွေ့အကြုံ\nWebsite နှင့် Web Application တို့၏ အခြေခံ သဘောတရားကို နားလည်သူ\nDatabase ဆိုင်ရာ အခြေခံဗဟုသုတ ရှိသူ\n\nဘာသာစကား အရည်အချင်း\nအင်္ဂလိပ်စာ - အခြေခံအဆင့် (Basic Level)\n\nစိတ်ပါဝင်စား၍ လျှောက်ထားလိုပါက\nviber - 09420260874\nmail - kpko@knowledge-villa.com",
    mustHave: ["Git","Vue.js"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/cw9LSYAb",
    email: "kpko@knowledge-villa.com",
    postedAt: "2026-10-11T04:15:15.620Z",
    level: "Junior",
  },
  {
    id: "24302388-e1de-4938-83be-b63ffd035d4e",
    title: "Senior IT Support Engineer",
    company: "Mahar Bawga Finance Co., Ltd",
    location: "Yankin, Yangon",
    description: "Mahar Bawga Finance Co., Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nSenior IT Support Technician (M/F) 1 Post\n\nJob Descriptions\n• Support technical issues on LANs, WANs, and other systems.\n• Administer CCTV and provide end-user assistance.\n• Provide technical support for computer system, network, and software issues.\n• Network copier solution and End user support.\n• Manage and collaborate with outsourced service providers.\n• Provide user support with phone, remote software for other sites.\n• Provide software, antivirus installation, and configuration.\n• Deliver windows, office installation, email configuration.\n• Maintain and update antivirus programs and prevent viruses to office resources.\n• Maintain current list of IT inventory, filling the IT item damage report.\n• Analyze and recommend optimal solutions for any new problem.\n• Responsible for maintaining, repairing, and replacing computer hardware, software, and peripherals as needed.\n\nJob Requirements\n• Any Graduated.\n• IT professional Certificate in hardware and network engineering.\n• Minimum 5 years of experience in IT support or a similar role.\n• Strong understanding of computer hardware, software, tools and networking concepts.\n• Ability and desire to learn new things.\n• Strong technical knowledge.\n• Excellent troubleshooting and problem-solving skills.\n• Demonstrates positive personality, team spirit, good work ethics, and motivation.\n• Effective communication and interpersonal skills.\n• Ability to work independently and as part of a team.\n• Proficient in Microsoft Office Suite and other relevant software applications.\n• Willingness to learn and adapt to new technologies.\n\nBenefits: Salary + Attendance Bonus + Performance Bonus (2 times per year)\n\nLocation – No(4/5), 5th Floor, Myawaddi Media Center, Moe Kaung Road, Yankin Township, Yangon\nWorking Hours - 8:30 AM to 5:30 PM\nOff Day – One day per week\n\nIf you would like to apply this position, please share your CV to infohr@maharbawga.com\n\nFor more information, please contact to 09685201147",
    mustHave: ["Performance"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/1uGBQuAa",
    email: "infohr@maharbawga.com",
    postedAt: "2026-10-11T04:02:37.759Z",
    level: "Senior",
  },
  {
    id: "abbd9377-5b4c-4ff5-850c-b78b28b3ab4f",
    title: "Quality Assurance Tester",
    company: "Innovative Global Wave Technology Co., Ltd",
    location: "Thingangyun, Yangon",
    description: "Innovative Global Wave Technology Co., Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nQuality Assurance (QA) Tester (M/F)\n\nJob Overview\nWe are looking for a Quality Assurance Tester to join our Product Team, responsible for Manual Testing and QA process execution. This role will lead Functional, Regression, and Usability Testing for a web-based enterprise application (HR/Payroll domain). Candidates with a strong grasp of ISTQB Foundation Level standards — applied to test case design, defect analysis, and test coverage improvement — will be preferred.\n\nKey Responsibilities\nDesign test scenarios, test cases, and test data based on business requirements, applying ISTQB best practices (Equivalence Partitioning, Boundary Value Analysis, Decision Table Testing)\nExecute Functional, Regression, Integration, and UAT-support testing (web and API level)\nTrack and maintain test cases, execution results, and defects systematically in tools such as Jira, TestRail, or Xray\nWrite clear defect reports including bug descriptions, steps to reproduce, expected/actual result, severity, and priority\nParticipate in Agile ceremonies — Sprint Planning, Backlog Refinement, Daily Stand-ups, Sprint Reviews\nIdentify test coverage gaps, traceability issues, and process risks, and escalate/report to the QA Lead\nCollaborate with the Automation team to identify automation-worthy scenarios (Playwright/Selenium knowledge is a plus)\n\nRequirements\nExperience & Education\n1–2 years of experience in Software QA / Manual Testing\nBachelor's degree in Computer Science, IT, or a related field (or equivalent practical experience)\n\nTechnical Skills\nPractical knowledge of test case design techniques (Boundary Testing, Equivalence Partitioning, Decision Tables)\nExperience with Jira (or similar) bug/test tracking tools\nAPI testing experience (Postman) and familiarity with browser DevTools\nAbility to read/write basic SQL queries\nISTQB Foundation Level Certification preferred\n\nSoft Skills\nDetail-oriented with strong analytical thinking and risk-based prioritization skills\nEffective communicator across cross-functional teams (Dev, BA, PM)\nStrong written and verbal communication skills\n\nNice to Have\nExperience in HR/Payroll or enterprise SaaS domain\nBasic knowledge of automation testing (Playwright/Selenium)\n\nSalary: Based on experience\nLocation: Room #303, AKK Shopping Mall (3rd Floor), Thingangyun Market, Laydaukkan Road, Thingangyun Township, Yangon, Myanmar\n\nApply: career@globalwave.com.mm\nContact: +959254897165\n\nInnovative Global Wave Technology Co., Ltd - Let’s Innovate!",
    mustHave: ["Manual testing","Testing","UI/UX","Test automation"],
    niceToHave: ["PostgreSQL"],
    sourceUrl: "https://techcareerweb.com/article-details/SnJPplaB",
    email: "career@globalwave.com.mm",
    postedAt: "2026-10-09T06:52:02.780Z",
    level: "Senior",
    salary: "Based on experience",
  },
  {
    id: "2c51565b-2c06-4198-8bde-3093edde3144",
    title: "Angular Developer",
    company: "uab Bank",
    location: "Yangon, Myanmar",
    description: "uab Bank နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nAngular Developer (M/F)\n\nuab bank is looking for a passionate and skilled Angular Developer to join our Digital & Technology team.\n\nPosition: Angular Developer\nLocation: Yangon\nEmployment Type: Full-time\n\nWhat You’ll Do\nDevelop and maintain web applications using Angular & TypeScript\nBuild responsive and user-friendly interfaces\nIntegrate frontend applications with RESTful APIs\nCollaborate with UI/UX Designers, Backend Developers, QA, and Business Teams\nTroubleshoot and resolve application issues\nWrite clean, reusable, and maintainable code\nSupport testing, deployment, and continuous improvement\n\nWhat We’re Looking For\nBachelor’s degree in Computer Science, IT, Software Engineering, or a related field\n2+ years of experience in frontend development with Angular\nGood knowledge of Angular, TypeScript, JavaScript, HTML5, and CSS3\nExperience with REST APIs and JSON\nKnowledge of Git/version control\nGood problem-solving and communication skills\nBanking or Fintech experience is an advantage\n\nWhy uab bank?\nJoin uab bank and be part of a team driving digital banking, technology, and innovation.\n\nInterested candidates can send their CV to:\naungzawwin@uab.com.mm",
    mustHave: ["TypeScript","HTML/CSS","UI/UX","Testing"],
    niceToHave: ["JavaScript","REST APIs","Git"],
    sourceUrl: "https://techcareerweb.com/article-details/mWtfAdR3",
    email: "aungzawwin@uab.com.mm",
    postedAt: "2026-10-09T05:38:57.814Z",
    employment: "Full-time",
    level: "Mid",
  },
  {
    id: "4a28fcf5-d6a2-4e0c-b098-419f0f2a82dd",
    title: "Frontend & Mobile Application Developer",
    company: "Royal Venture Investment Group",
    location: "Yangon, Myanmar",
    description: "Royal Venture Investment Group နှင့်အတူ လက်တွဲလုပ်ကိုင်ရန်\nFinancial Services Sector\n\nFrontend & Mobile Application Developer (M/F)\n\nREQUIREMENTS\nBachelor's Degree in Computer Science/ Information Technology/Software Engineering or related field\n3+ years in front-end development and mobile application development.\nFrontend: Angular, HTML5, CSS3, JavaScript/TypeScript\nRESTful API integration\nVersion control (Git) and unit/integration testing\nCloud platform exposure (AWS, Azure, GCP), containerization (Docker/Kubernetes), experience. DevOps exposure, fintech/telecom\nStrong knowledge of Flutter and Dart.\nGood understanding of Clean Architecture, SOLID, and design patterns.\nGood knowledge of asynchronous programming and state management.\nExperience debugging and resolving Android/iOS build and deployment issues.\nUnderstanding of mobile security, secure storage, and application lifecycle.\nExperience with financial, wallet, payment, or banking applications.\n\nSend your CV and more information:\n09966318574\npyaepyae.chr@rvinvest.com.mm\nTimes City\n\nWorking Days: Monday to Friday (8:30 AM to 5:30 PM)\nOffice Location: Times City\nFerry provided",
    mustHave: ["HTML/CSS","JavaScript","TypeScript","Git"],
    niceToHave: ["Testing","AWS","Docker","Kubernetes","Flutter"],
    sourceUrl: "https://techcareerweb.com/article-details/YjtS8hVN",
    email: "pyaepyae.chr@rvinvest.com.mm",
    postedAt: "2026-10-09T05:32:13.831Z",
    level: "Mid",
  },
  {
    id: "a82a23f5-0e90-4c1c-8037-a6a1a5fd4166",
    title: "Backend Developer",
    company: "Royal Venture Investment Group",
    location: "Yangon, Myanmar",
    description: "Royal Venture Investment Group နှင့်အတူ လက်တွဲလုပ်ကိုင်ရန်\nFinancial Services Sector\n\nBackend Developer (M/F)\n\nWe are seeking a Backend Developer with strong expertise in NET Core and solid proficiency in Java/Spring Boot. The role involves designing, developing, and maintaining scalable, secure, and high-performance backend systems, and ensuring best practices across the backend architecture.\n\nREQUIREMENTS\nBachelor's Degree in Computer Science/ Information Technology/ Software Engineering or related field\n3-5 years in backend development.\nExpert in NET Core (C#, ASP.NET Core, WebAPI, MVC)\nProficient in Java/Spring Boot\nRESTful APIs / GraphQL\nSQL/NoSQL databases (MS SQL, PostgreSQL, MongoDB, etc.)\nCloud services (AWS, Azure, GCP)\nVersion control (Git) and unit/integration testing\nExperience with financial, wallet, payment, or banking applications.\n\nSend your CV to:\n09966318574\npyaepyae.chr@rvinvest.com.mm\nTimes City\n\nWorking Days: Monday to Friday (8:30 AM to 5:30 PM)\nOffice Location: Times City\nFerry provided",
    mustHave: ["Performance","GraphQL","PostgreSQL","AWS"],
    niceToHave: ["Git","Testing"],
    sourceUrl: "https://techcareerweb.com/article-details/r14B47ct",
    email: "pyaepyae.chr@rvinvest.com.mm",
    postedAt: "2026-10-09T05:28:00.375Z",
    level: "Mid",
  },
  {
    id: "02c5f14b-ede2-4cc5-884a-6b1175b2d8b2",
    title: "Junior Full-Stack AI / web Developer Engineer",
    company: "Boss & Bots",
    location: "Yangon, Myanmar",
    description: "Boss & Bots နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nJunior Full-Stack AI / web Developer Engineer (M/F) 3 Posts\n\nBoss & Bots တွင် မတူညီသော modern web application များ၊ AI/LLM API Integration များနှင့် Automation Workflow များကို ပူးပေါင်းပါဝင် တည်ဆောက်ရန်အတွက် တက်ကြွပြီး လေ့လာသင်ယူလိုစိတ်ရှိသော Junior Full-Stack / AI Developer ဝန်ထမ်းသစ်များ ခေါ်ယူနေပါသည်။\n\nရာထူး (Position): Junior Full-Stack AI / Web Developer Engineer\nရာထူးအဆင့် (Level): Junior / Entry-Level\nလုပ်ငန်းခွင်ပုံစံ (Work Type): Full-time (On-site)\nရုံးတည်နေရာ (Location): Yangon, Myanmar.\n\nအဓိက တာဝန်နှင့် ဝတ္တရားများ (Key Responsibilities):\n* React.js / Next.js နှင့် Node.js / Express များကို အသုံးပြု၍ Responsive ဖြစ်ပြီး စွမ်းဆောင်ရည်မြင့်မားသော Full-Stack Web Application များ ရေးသား/ထိန်းသိမ်းခြင်း\n* Secure REST APIs များ ရေးသားခြင်း၊ Database Schema design များနှင့် Query များ ရေးသားပြင်ဆင်ခြင်း (PostgreSQL / MySQL / Prisma ORM)\n* LLM APIs (OpenAI / Gemini APIs) များနှင့် RAG / Agentic AI Workflow များကို Web Project များအတွင်း ချိတ်ဆက်အသုံးပြုခြင်း\n* AI-assisted Coding Tools များ (Cursor, GitHub Copilot) အသုံးပြု၍ Code Quality နှင့် Development Speed တိုးတက်အောင် ဆောင်ရွက်ခြင်း\n* Senior Developer များနှင့် အဖွဲ့ဝင်များနှင့် ပူးပေါင်း၍ Project များကို အချိန်မီ ပြီးမြောက်အောင် လုပ်ဆောင်ဖြင်း\n\nလိုအပ်သော အရည်အချင်းများ (Requirements):\n* Computer Science / IT / Software Engineering ဘွဲ့ရရှိထားသူ သို့မဟုတ် နောက်ဆုံးနှစ် ကျောင်းသား/သူ (သို့မဟုတ် သက်ဆိုင်ရာ သင်တန်းဆင်း/အတွေ့အကြုံရှိသူ)\n* Frontend: React.js, Next.js, HTML/CSS, Tailwind CSS မကြာခဏ အသုံးပြုဖူးပြီး အခြေခံ ကျွမ်းကျင်မှုရှိခြင်း\n* Backend & Database: Node.js, Express, RESTful APIs, PostgreSQL / MySQL များကို အခြေခံ အဆင့် ရေးသားနိုင်ခြင်း\n* AI & Tools: LLM APIs, Prompt Engineering များကို လေ့လာစိတ်ဝင်စားပြီး Cursor သို့မဟုတ် GitHub Copilot အသုံးပြုဖူးသူများ ဦးစားပေးမည်\n* Version Control System (Git / GitHub) ကို အခြေခံအသုံးပြုနိုင်ခြင်း\n* ပြဿနာများကို စနစ်တကျ ဖြေရှင်းနိုင်စွမ်း (Problem-Solving Skills) နှင့် အဖွဲ့အစည်းနှင့် ပူးပေါင်းဆောင်ရွက်နိုင်စွမ်း ရှိခြင်း\n\nရရှိနိုင်မည့် ခံစားခွင့်များ (Benefits):\n* လစာ (Salary): 500,000 to 700,000 MMK\n* Modern Stack များနှင့် AI Agent Development ပိုင်းတွင် လက်တွေ့ အတွေ့အကြုံ ရရှိနိုင်ခြင်း\n* အပြိုင်အဆိုင် လစာနှင့် တိုးတက်နိုင်ခြေရှိသော Career Opportunity\n* သင်ယူလေ့လာနိုင်သော Professional & Friendly Team Environment\n\nလျှောက်ထားရန် နည်းလမ်း (How to Apply):\nစိတ်ပါဝင်စားပါက မိမိ၏ CV Form (Resume) နှင့် Portfolio / GitHub Project Links and contact များကို အောက်ပါ Email သို့ ပေးပို့ လျှောက်ထားနိုင်ပါသည်။\n\n* Email: pyisoneaung@utsmyanmar.com\n* Mobile/Viber/Telegram: +959421095465\n* Subject Format: Application for Junior Developer",
    mustHave: ["React","Next.js","Node.js","HTML/CSS"],
    niceToHave: ["REST APIs","PostgreSQL","MySQL","Git","Tailwind CSS"],
    sourceUrl: "https://techcareerweb.com/article-details/8vWE2qPM",
    email: "pyisoneaung@utsmyanmar.com",
    postedAt: "2026-10-09T04:36:02.922Z",
    employment: "Full-time",
    level: "Junior",
  },
  {
    id: "3cd73f73-9c87-4e4b-90b4-743aabd4b331",
    title: "Full-Stack Developer (Senior-Level)",
    company: "NetScriper Co., Ltd",
    location: "Hlaing, Yangon",
    description: "NetScriper Co., Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nFull Stack Developer (Senior-Level) (M/F)\n\n(1) Node.js, React.js, Next.js, PHP (Pure), PHP Laravel အထူး (အထူး) ကျွမ်းကျင်သူ ဖြစ်ရမည်\n(2) SQL and NoSQL Databases များ အထူးကျွမ်းကျင်ပြီး Database Indexing, Modelling, Query Optimisation, Performance Improvement များ အထူး ကျွမ်းကျင်သူ ဖြစ်ရမည်\n(3) Advanced API Development, JSON, Authentication (JWT/OAuth), and Web Security များ ကျွမ်းကျင်ရမည်\n(4) Queue System များ၊ Workers များ၊ Vector Database များ နားလည်ကျွမ်းကျင်ရမည်\n(5) Next.js + PostgreSQL နားလည်ရမည်\n(6) React Native အတွေ့အကြုံရှိသူ ဦးစားပေးမည်\n(7) Large Language Models (LLMs) ကို အသုံးပြု၍ AI Application များ တည်ဆောက်ခြင်း အတွေ့အကြုံရှိသူ ဦးစားပေးမည်\n(8 ) Web Developer လုပ်သက် (Commercial လုပ်သက်) အနည်းဆုံး (၅ နှစ်) ရှိသူ ဖြစ်ရမည်\n(9) နောက်ဆုံးပေါ် Technology များကို စိတ်ဝင်စားပြီး အမြဲလေ့လာသင်ယူလိုစိတ်ရှိရမည်\n\nInterview တွင် Laravel (Advanced Level) + Adv API + React.js - Code Test ရှိသည်။ 45mins ခန့်\nအလုပ်တစ်ခုတွင် အနည်းဆုံး ၂ နှစ် ခန့်လုပ်မည်ဟု Commitment ပေးနိုင်သူဖြစ်ရမည်\nအတွေ့အကြုံပေါ်မူတည်၍ လစာတောင်းနိုင်သည်။ တိုးတက်မှုရှိပါက လစာတိုးပေးသည်\n\nမည်သည့် Position ကိုမဆို လျှောက်ထားသူသည် အောက်ပါအချက်များကိုလိုက်နာရမည်။\nအမှန်တကယ် အလုပ်လုပ်လိုသူသာ လျှောက်ထားပါ\nပျက်ရက်မရှိလုပ်နိုင်သူ ဖြစ်ရမည်\nရုံးချိန် 9AM to 4:30PM (Mon ~ Fri)။ Saturday, Sunday & Public Holiday အမြဲပိတ်သည်\nရုံးနေရာ MICT Park လှိုင်မြို့နယ်အား နေ့စဉ် ရုံးချိန်မှန်အောင်လာနိုင်သူဖြစ်ရမည်\nပညာအရည်အချင်း - ကန့်သတ်ချက်မရှိ\nအသက်အရွယ် - ကန့်သတ်ချက်မရှိ\nအလုပ်တစ်ခုတွင် အနည်းဆုံး ၂ နှစ် ခန့်လုပ်မည်ဟု Commitment ပေးနိုင်သူဖြစ်ရမည်။ Contract ရှိသည်။ ရေရှည်လုပ်နိုင်သူ ဦးစားပေးမည်\nအတွေ့အကြုံပေါ်မူတည်၍ လစာတောင်းနိုင်သည်။ တိုးတက်မှုရှိပါက လစာတိုးပေးသည်။\n\nAbout NetScriper Co., Ltd:\nCompany အကြောင်းအသေးစိတ်အား အလုပ်မလျှောက်ခင်လေ့လာလိုပါက NetScriper (Myanmar) Company Website: www.netscriper.com တွင်ဝင်ရောက်လေ့လာနိုင်ပြီး NetScriper (UK) Company Website: www.netscriper.co.uk တွင်ဝင်ရောက်လေ့လာနိုင်ပါသည်။\n\nHow to apply:\nအထက်ပါ Position များ လျှောက်ထားရန်အတွက် HR Team Email: hr@netscriper.com သို့ CV attach လုပ်၍ပေးပို့နိုင်ပါသည်။ (Facebook/CB/Messenger မှ CV ပေးပို့ခြင်း မပြုရ)\nCV ပို့ရာတွင် လျှောက်ထားလိုသော Position အား Email Subject တွင်ရေသားပေးပါ။\n\nNetScriper Co., Ltd (Myanmar)\nBuilding 14, Room 601, MICT Park, Hlaing, Yangon.\nPhone: 012305191 , 09448444400 , 09448444411",
    mustHave: ["Node.js","React","Next.js","PHP"],
    niceToHave: ["Laravel","PostgreSQL","Performance","React Native"],
    sourceUrl: "https://techcareerweb.com/article-details/IMV3oHJ4",
    email: "hr@netscriper.com",
    postedAt: "2026-10-09T04:24:50.583Z",
    employment: "Contract",
    level: "Senior",
  },
  {
    id: "e1343d80-f711-428c-9d31-e72900d37b35",
    title: "Full-Stack Developer (Mid-Level)",
    company: "NetScriper Co., Ltd",
    location: "Hlaing, Yangon",
    description: "NetScriper Co., Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nFull Stack Developer (Mid-Level) (M/F)\n\n(1) Node.js, Next.js, PHP (Pure), PHP Laravel အထူး ကျွမ်းကျင်သူ ဖြစ်ရမည်\n(2) HTML, CSS, Bootstrap, React.js အထူး ကျွမ်းကျင်သူ ဖြစ်ရမည်\n(3) MySQL & PostgreSQL နှင့် Database Design, Structure, Relationships, Data Modelling အထူး ကျွမ်းကျင်သူ ဖြစ်ရမည်\n(4) External APIs, REST APIs, JSON, Authentication (JWT/OAuth) နှင့် API Development Best Practices များနားလည်ရမည်\n(5) React Native (or) Next.js အတွေ့အကြုံရှိသူ ဦးစားပေးမည်\n(6) Payment Gateway (or) 3rd Party API များ ချိတ်ဆက်လုပ်ဖူးသူ ဦးစားပေးမည်\n(7) Web Developer လုပ်သက် (Commercial လုပ်သက်) အနည်းဆုံး (၂ နှစ်) ရှိသူ ဖြစ်ရမည်\n(8 ) နောက်ဆုံးပေါ် Technology များကို စိတ်ဝင်စားပြီး အမြဲလေ့လာသင်ယူလိုစိတ်ရှိရမည်\n(9) Quick Learner / Independent Self Learner ဖြစ်ရမည်။ အထူးသဖြင့် Development နှင့်ပက်သက်၍ လျှင်မြန်စွာလေ့လာသင်ယူနိုင်သူဖြစ်ရမည်\n\nInterview တွင် Laravel (Mid Level) + React.js - Code Test ရှိသည်။ 45mins ခန့်\nအလုပ်တစ်ခုတွင် အနည်းဆုံး ၂ နှစ် ခန့်လုပ်မည်ဟု Commitment ပေးနိုင်သူဖြစ်ရမည်။ Contract ရှိသည်\nအတွေ့အကြုံပေါ်မူတည်၍ လစာတောင်းနိုင်သည်။ တိုးတက်မှုရှိပါက လစာတိုးပေးသည်\n\nမည်သည့် Position ကိုမဆို လျှောက်ထားသူသည် အောက်ပါအချက်များကိုလိုက်နာရမည်။\nအမှန်တကယ် အလုပ်လုပ်လိုသူသာ လျှောက်ထားပါ\nပျက်ရက်မရှိလုပ်နိုင်သူ ဖြစ်ရမည်\nရုံးချိန် 9AM to 4:30PM (Mon ~ Fri)။ Saturday, Sunday & Public Holiday အမြဲပိတ်သည်\nရုံးနေရာ MICT Park လှိုင်မြို့နယ်အား နေ့စဉ် ရုံးချိန်မှန်အောင်လာနိုင်သူဖြစ်ရမည်\nပညာအရည်အချင်း - ကန့်သတ်ချက်မရှိ\nအသက်အရွယ် - ကန့်သတ်ချက်မရှိ\nအလုပ်တစ်ခုတွင် အနည်းဆုံး ၂ နှစ် ခန့်လုပ်မည်ဟု Commitment ပေးနိုင်သူဖြစ်ရမည်။ Contract ရှိသည်။ ရေရှည်လုပ်နိုင်သူ ဦးစားပေးမည်\nအတွေ့အကြုံပေါ်မူတည်၍ လစာတောင်းနိုင်သည်။ တိုးတက်မှုရှိပါက လစာတိုးပေးသည်။\n\nAbout NetScriper Co., Ltd:\nCompany အကြောင်းအသေးစိတ်အား အလုပ်မလျှောက်ခင်လေ့လာလိုပါက NetScriper (Myanmar) Company Website: www.netscriper.com တွင်ဝင်ရောက်လေ့လာနိုင်ပြီး NetScriper (UK) Company Website: www.netscriper.co.uk တွင်ဝင်ရောက်လေ့လာနိုင်ပါသည်။\n\nHow to apply:\nအထက်ပါ Position များ လျှောက်ထားရန်အတွက် HR Team Email: hr@netscriper.com သို့ CV attach လုပ်၍ပေးပို့နိုင်ပါသည်။ (Facebook/CB/Messenger မှ CV ပေးပို့ခြင်း မပြုရ)\nCV ပို့ရာတွင် လျှောက်ထားလိုသော Position အား Email Subject တွင်ရေသားပေးပါ။\n\nNetScriper Co., Ltd (Myanmar)\nBuilding 14, Room 601, MICT Park, Hlaing, Yangon.\nPhone: 012305191 , 09448444400 , 09448444411",
    mustHave: ["Node.js","Next.js","PHP","Laravel"],
    niceToHave: ["HTML/CSS","Bootstrap","React","MySQL","PostgreSQL","REST APIs"],
    sourceUrl: "https://techcareerweb.com/article-details/SxeCo3NC",
    email: "hr@netscriper.com",
    postedAt: "2026-10-09T04:21:13.674Z",
    employment: "Contract",
    level: "Mid",
  },
  {
    id: "18a9fa3c-c5ff-40a2-b540-fe25a4004ebc",
    title: "Full-Stack Developer (Junior/Fresher)",
    company: "NetScriper Co., Ltd",
    location: "Hlaing, Yangon",
    description: "NetScriper Co., Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nFull Stack Developer (Junior/Fresher) (M/F)\n\n(1) PHP (Pure) နှင့် PHP Laravel ကျွမ်းကျင်သူ ဖြစ်ရမည် (hand-coding ရေးနိုင်ရမည်၊ AI Generate မလိုပါ)\n(2) HTML, CSS, Bootstrap ကျွမ်းကျင်သူ ဖြစ်ရမည်\n(3) MySQL နှင့် Basic Database Design/Structure များ နားလည်ရမည်\n(4) Node.js / React.js / Next.js အတွေ့အကြုံရှိသူ ဦးစားပေးမည်\n(5) Backend Laravel + Frontend React.js အတွေ့အကြုံရှိသူ ဦးစားပေးမည်\n(6) Commercial လုပ်သက် မလိုပါ (သို့သော်) ကိုယ်တိုင် ရေးဆွဲထားသော Personal/Student Project များ ပြနိုင်ရမည်\n(7) Laravel နှင့် ကိုယ်တိုင်ပါဝင်ရေးသားထားသော Project များ Web Link များ CV ထဲတွင် (သို့) Email ထဲတွင် ပါဝင်ရမည် (Source-code မလို)\n(8 ) အမှန်တကယ် Developer ဖြစ်လိုသူ၊ ကြိုးစားလေ့လာ သင်ယူချင်သူ ဖြစ်ရမည်\n(9) Quick Learner / Independent Self Learner ဖြစ်ရမည်။ အထူးသဖြင့် Development နှင့်ပက်သက်၍ လျှင်မြန်စွာလေ့လာသင်ယူနိုင်သူဖြစ်ရမည်\n\nInterview တွင် Laravel (Basic Level) - Code Test ရှိသည်။ 45mins ခန့်\nအလုပ်တစ်ခုတွင် အနည်းဆုံး ၂ နှစ် ခန့်လုပ်မည်ဟု Commitment ပေးနိုင်သူဖြစ်ရမည်။ Contract ရှိသည်\nအတွေ့အကြုံပေါ်မူတည်၍ လစာတောင်းနိုင်သည်။ တိုးတက်မှုရှိပါက လစာတိုးပေးသည်\n\nမည်သည့် Position ကိုမဆို လျှောက်ထားသူသည် အောက်ပါအချက်များကိုလိုက်နာရမည်။\nအမှန်တကယ် အလုပ်လုပ်လိုသူသာ လျှောက်ထားပါ\nပျက်ရက်မရှိလုပ်နိုင်သူ ဖြစ်ရမည်\nရုံးချိန် 9AM to 4:30PM (Mon ~ Fri)။ Saturday, Sunday & Public Holiday အမြဲပိတ်သည်\nရုံးနေရာ MICT Park လှိုင်မြို့နယ်အား နေ့စဉ် ရုံးချိန်မှန်အောင်လာနိုင်သူဖြစ်ရမည်\nပညာအရည်အချင်း - ကန့်သတ်ချက်မရှိ\nအသက်အရွယ် - ကန့်သတ်ချက်မရှိ\nအလုပ်တစ်ခုတွင် အနည်းဆုံး ၂ နှစ် ခန့်လုပ်မည်ဟု Commitment ပေးနိုင်သူဖြစ်ရမည်။ Contract ရှိသည်။ ရေရှည်လုပ်နိုင်သူ ဦးစားပေးမည်\nအတွေ့အကြုံပေါ်မူတည်၍ လစာတောင်းနိုင်သည်။ တိုးတက်မှုရှိပါက လစာတိုးပေးသည်။\n\nAbout NetScriper Co., Ltd:\nCompany အကြောင်းအသေးစိတ်အား အလုပ်မလျှောက်ခင်လေ့လာလိုပါက NetScriper (Myanmar) Company Website: https://www.netscriper.com တွင်ဝင်ရောက်လေ့လာနိုင်ပြီး NetScriper (UK) Company Website: www.netscriper.co.uk တွင်ဝင်ရောက်လေ့လာနိုင်ပါသည်။\n\nHow to apply:\nအထက်ပါ Position များ လျှောက်ထားရန်အတွက် HR Team Email: hr@netscriper.com သို့ CV attach လုပ်၍ပေးပို့နိုင်ပါသည်။ (Facebook/CB/Messenger မှ CV ပေးပို့ခြင်း မပြုရ)\nCV ပို့ရာတွင် လျှောက်ထားလိုသော Position အား Email Subject တွင်ရေသားပေးပါ။\n\nNetScriper Co., Ltd (Myanmar)\nBuilding 14, Room 601, MICT Park, Hlaing, Yangon.\nPhone: 012305191 , 09448444400 , 09448444411",
    mustHave: ["PHP","Laravel","HTML/CSS","Bootstrap"],
    niceToHave: ["MySQL","Node.js","React","Next.js"],
    sourceUrl: "https://techcareerweb.com/article-details/sLusVdIt",
    email: "hr@netscriper.com",
    postedAt: "2026-10-09T04:18:13.321Z",
    employment: "Contract",
    level: "Junior",
  },
  {
    id: "18583382-0bfb-4723-b9fd-4a626dbe4fb0",
    title: "In-House Full-Stack Developer",
    company: "PLUS TALENT Co.,Ltd",
    location: "Yangon, Myanmar",
    description: "PLUS TALENT Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nIn-House Full-Stack Developer (M/F)\n\n𝗝𝗼𝗯 𝗧𝘆𝗽𝗲: Full Time | On-site\n𝗪𝗼𝗿𝗸𝗶𝗻𝗴 𝗗𝗮𝘆𝘀: Mon – Fri (8AM ~ 5PM)\n𝗟𝗼𝗰𝗮𝘁𝗶𝗼𝗻: Kamaryut Township, Yangon\n\n𝙀𝙭𝙘𝙡𝙪𝙨𝙞𝙫𝙚 𝙤𝙥𝙥𝙤𝙧𝙩𝙪𝙣𝙞𝙩𝙮 𝙛𝙤𝙧 𝙈𝙮𝙖𝙣𝙢𝙖𝙧 𝙉𝙖𝙩𝙞𝙤𝙣𝙖𝙡𝙞𝙩𝙮\nWe’re looking for a Mid-Level to Senior Full-Stack Developer to join our in-house team and build modern, scalable web applications across both frontend and backend. You’ll have the opportunity to work on real-world technology projects, contribute to innovative solutions, and take ownership from development through deployment.\n\n𝗪𝗵𝗮𝘁 𝗬𝗼𝘂’𝗹𝗹 𝗗𝗼\n- Build & maintain modern web apps with JavaScript/TypeScript Framework\n- Design and optimize PostgreSQL databases, queries, transactions, and performance.\n- Take ownership of testing, debugging, code reviews, and system maintenance.\n- Collaborate with team members across the development lifecycle to deliver reliable solutions.\n- Apply strong debugging and root-cause analysis skills to solve technical challenges.\n- Communicate clearly and collaborate effectively with teams across different time zones.\n\n𝗪𝗵𝗮𝘁 𝗬𝗼𝘂 𝗕𝗿𝗶𝗻𝗴\n- 𝟯+ 𝘆𝗲𝗮𝗿𝘀 𝗼𝗳 professional experience with Full-Stack Development.\n- Strong hands-on experience with 𝗡𝗼𝗱𝗲.𝗷𝘀, 𝗘𝘅𝗽𝗿𝗲𝘀𝘀, 𝗥𝗘𝗦𝗧 𝗔𝗣𝗜𝘀, 𝗥𝗲𝗮𝗰𝘁, 𝗮𝗻𝗱 𝗡𝗲𝘅𝘁.𝗷𝘀.\n- Familiarity with 𝗔𝗪𝗦, 𝗗𝗼𝗰𝗸𝗲𝗿, 𝗮𝗻𝗱 𝗚𝗶𝘁𝗛𝘂𝗯 𝗔𝗰𝘁𝗶𝗼𝗻𝘀.\n- Experience writing and maintaining unit tests using 𝗝𝗲𝘀𝘁 𝗼𝗿 𝗩𝗶𝘁𝗲𝘀𝘁.\n- Strong English communication skills for technical discussions and documentation.\n\n𝗡𝗶𝗰𝗲 𝘁𝗼 𝗛𝗮𝘃𝗲\n-Experience with AI/LLM integration.\n-Knowledge of Playwright or E2E testing.\n-Understanding of API security, authorization, and PII protection.\n-Comfortable using AI coding tools, Slack, Jira, and GitHub in daily development.\n\n𝐀𝐩𝐩𝐥𝐲 𝐍𝐨𝐰: hiring.mm@plus-impact.co\n𝐂𝐨𝐧𝐭𝐚𝐜𝐭: 09792191211",
    mustHave: ["JavaScript","TypeScript","PostgreSQL","Performance"],
    niceToHave: ["Testing","Git"],
    sourceUrl: "https://techcareerweb.com/article-details/0kkKiiDw",
    email: "hiring.mm@plus-impact.co",
    postedAt: "2026-10-09T04:10:34.683Z",
    employment: "Full-time",
    level: "Senior",
  },
  {
    id: "18e4e503-7557-4d4c-9dab-f695c1b6605d",
    title: "Mid/Senior Mobile Developer",
    company: "AcePlus Solutions Co.,Ltd",
    location: "Hlaing, Yangon",
    description: "AcePlus Solutions Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nMid / Senior Mobile Developer (Flutter Expert + Native Skills) (M/F) 2 Posts\n\nType: Full-time\nLocation: MICT Park, Hlaing Township, Yangon (Onsite) at AcePlus Solutions Co., Ltd. Experience: 1-3+ Years\n\nKey Requirements\nFlutter and Dart: 1-3 years shipping production apps. Deep knowledge of Dart, State Management (Bloc / Riverpod / Provider), and complex UI/animations.\nNative Bridges: Strong hands-on experience in Kotlin (Android) and Swift (iOS). Skilled in Platform Channels and custom plugins.\nArchitecture and DevOps: Clean Architecture, MVVM, Git, Automated Testing, and CI/CD pipelines (Fastlane / Codemagic / GitHub Actions).\nSoft Skills: Strong problem-solving abilities, product mindset, and great team communication.\n\nWhat We Offer\nModern tech stack and continuous innovation,\nHigh-impact projects with real-world user reach,\nCareer growth and leadership opportunities,\nCompetitive salary, flexible work options, and team activities.\n\nHow to Apply:\nReady to build with us? Send your CV or Resume to recruitment@aceplussolutions.com and call 09777005811",
    mustHave: ["Flutter","Git","Testing","CI/CD"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/z0dc11ix",
    email: "recruitment@aceplussolutions.com",
    postedAt: "2026-10-08T07:17:47.063Z",
    employment: "Full-time",
    level: "Senior",
  },
  {
    id: "fadfe27c-fcee-46c2-b08d-18e7ed47438f",
    title: "Senior Cyber Security Specialist",
    company: "RITZ Co.,Ltd",
    location: "Yangon, Myanmar",
    description: "RITZ Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nSenior Cyber Security Specialist (M) - 1 Post\n\nJob Description\n- Perform vulnerability assessments and penetration tests (VAPT) on web applications, mobile applications, networks, and cloud environments.\n- Analyze vulnerabilities using automated tools (e.g., Nessus, Burp Suite, etc.) and manual testing techniques.\n- Develop detailed reports of findings with clear remediation steps and recommendations for improving security postures.\n- Collaborate with development, DevOps, and infrastructure teams to resolve security vulnerabilities.\n- Simulate attack scenarios and exploit vulnerabilities to understand the security risks and real-world impact.\n- Conduct red teaming exercises and work with incident response teams for simulated adversarial attacks.\n- Stay updated on the latest vulnerabilities, exploits, and security trends; share relevant knowledge with the team.\n- Support clients by explaining vulnerabilities and providing guidance on how to mitigate them.\n- Help establish and refine security testing methodologies and procedures in line with industry standards (e.g., OWASP).\n- Perform re-tests to validate fixes and assist with ongoing security monitoring efforts.\n\nJob Requirement\n- University graduate preferably in Computer Engineering, Computer Science, Information Technology, or a related field.\n- Exceptional communication, presentation, and consulting skills, with a proven ability to explain high-level technical risks and remediation steps clearly to clients and executive boards.\n- Strong hands-on expertise in web application security, mobile application security (iOS/Android), network security, Active Directory, and cloud environments (AWS, Azure, GCP).\n- Proficiency in using and customizing automated security testing tools (e.g., Burp Suite, OWASP ZAP, Metasploit, Kali Linux).\n- Deep understanding of security frameworks, methodologies, and vulnerability classifications (OWASP Top 10, SANS/CWE Top 25, MITRE ATT&CK, and CVSS).\n- Experience with scripting languages (Python, Bash, PowerShell) to automate tasks and develop custom testing tools.\n- Strong analytical and problem-solving mindset, with a proactive attitude toward client satisfaction.\n- Relevant professional security certifications (e.g., OSCP, CRTE, CRTP, GPEN) are highly preferred.\n\nOffice Hours: Mon to Fri (9 AM - 5 PM)\nOff Days: Sat, Sun and Gazette days\nAddress: 27th St, Pabeden Township, Yangon\nContact: 09452105039 (Within Office Hour)\n\nIf interested, please submit you CV to hr@ritz.com.mm with your expected salary.",
    mustHave: ["Manual testing","Testing","AWS","Linux"],
    niceToHave: ["Python"],
    sourceUrl: "https://techcareerweb.com/article-details/g9JjhBPx",
    email: "hr@ritz.com.mm",
    postedAt: "2026-10-08T06:07:25.458Z",
    level: "Senior",
  },
  {
    id: "2ed2b918-232e-460a-9cd0-893c1d208ba6",
    title: "Web Development Project Manager",
    company: "Royal Motor Co.,Ltd",
    location: "Thaketa, Yangon",
    description: "Royal Motor Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nWeb Developer Project Manager (M/F)\n\nPosition : Web Development Manager/ Project Manager\nSalary : Open For Negotiate\nIndustry : Trading\nLocation : Thaketa Township.\nOffice Days : Monday to Friday\nHolidays : Saturday, Sunday & Gazette Holidays\nTransportation : Ferry Provides\n\nRequirements\n• Bachelor’s Degree in Computer Science, IT, Web Development, or a related field.\n• 5+ years of experience in Web Development, IT, or Digital Technology, with at least 2 years in a managerial, project management, or team-lead role.\n• Strong understanding of web development technologies, and modern web development practices.\n• Experience managing web development projects from requirements gathering through development, testing, deployment, and maintenance.\n• Experience with CMS platforms such as WordPress is an advantage.\n• Good understanding of website SEO, analytics, performance optimization, web security, hosting, and databases.\n• Strong project planning, task management, problem-solving, and team leadership skills.\n• Experience working with internal development teams and external developers, agencies, and technology vendors.\n• Ability to communicate effectively with technical and non-technical stakeholders.\n• Strong organizational skills with the ability to manage multiple projects and priorities simultaneously.\n\nJob Responsibilities\n• Lead and manage the Web Development Team and ensure projects are delivered on time, within scope, and according to quality standards.\n• Plan, coordinate, and manage web development projects from requirements gathering to deployment and ongoing maintenance.\n• Work closely with Management, Marketing, IT, and other departments to understand business requirements and convert them into practical technical solutions.\n• Define project scope, requirements, timelines, priorities, deliverables, and development plans.\n• Assign tasks, monitor team progress, manage workloads, and provide guidance and support to development team members.\n• Coordinate website design, development, functionality, performance, security, SEO, and user experience improvements.\n• Review project progress, identify risks or technical issues, and ensure timely resolution.\n• Coordinate with UI/UX designers, developers, IT teams, external developers, agencies, and technology vendors when required.\n• Monitor website and web application performance and ensure systems are secure, stable, scalable, mobile-friendly, and up to date.\n• Manage and coordinate testing, deployment, backup, maintenance, system updates, and release activities.\n• Review development work, technical solutions, and project deliverables to ensure they meet business and technical requirements.\n• Monitor project budgets, resources, schedules, and priorities where applicable.\n• Prepare regular project status reports, website performance reports, and management updates.\n• Identify opportunities to improve development processes, team productivity, website performance, and overall digital operations.\n• Ensure proper documentation of project requirements, technical specifications, processes, and system changes.\n• Stay updated on web technologies, digital trends, project management practices, and development best practices.\n\nHow to Apply\nInterested candidates are invited to submit their CV to:\nEmail: hr@royalmotor.info\nViber: 09798236943\n\nWe look forward to welcoming creative and talented candidates to join our team.",
    mustHave: ["Testing","WordPress","Analytics","Performance"],
    niceToHave: ["UI/UX"],
    sourceUrl: "https://techcareerweb.com/article-details/hkVEAViG",
    email: "hr@royalmotor.info",
    postedAt: "2026-10-08T05:07:15.329Z",
    level: "Senior",
    salary: "Open For Negotiate",
  },
  {
    id: "97939373-3f5b-40d8-a8d2-adb01fb6da52",
    title: "Junior Full Stack Developer (Python/Web)",
    company: "Kaytumadi iSolution Ltd",
    location: "Yangon, Myanmar",
    description: "Kaytumadi iSolution Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nJunior Full Stack Developer (Python / Web) (M/F)\n\nEmployment Type: Full-Time\nSalary: Negotiable\nLocation: Yangon\n\nSat, Sun & public holidays off\nWorking hours: 8:30 AM – 4:30 PM\n\nKey Responsibilities\nUnderstand business workflows and collaborate smoothly with non-technical departments to translate operational requirements into practical software solutions.\nBuild, maintain, and support internal web applications and automation tools.\nDevelop backend services and integrate frontend interfaces with databases and RESTful APIs.\n\nRequired Qualifications & Skills\nBachelor’s degree or diploma in Computer Science, IT, Software Engineering, or a related field (fresh graduates with strong portfolio projects are welcome).\nHands-on basic to intermediate programming knowledge in Python.\nSolid understanding of frontend foundations (HTML5, CSS3, JavaScript).\nPractical knowledge of SQL and relational database design (MySQL or PostgreSQL).\nStrong grasp of core web concepts: HTTP lifecycle, RESTful API design/consumption, authentication, and CRUD operations.\nFamiliarity with Git/GitHub for version control and collaborative code management.\nSharp problem-solving mindset with the initiative to debug, research technical challenges, and learn new tools independently.\nProfessional communication skills and English reading/writing ability adequate for reviewing technical documentation and APIs.\n\nPreferred Qualifications (Nice-to-Have)\nFamiliarity with Python frameworks (Django, Flask, FastAPI) or modern UI/JavaScript toolkits (React, Vue, Bootstrap).\nExposure to Linux environments, Docker, cloud deployment, or Kotlin/Android development.\nHaving a portfolio, GitHub repository, or sample demo projects to showcase during the interview.\n\nHow to Apply\nSend your updated CV and portfolio/GitHub links to hr@ktmdisolution.com or inquire via Call/Viber at 09784101711 (Website: www.ktmdisolution.com ).",
    mustHave: ["Python","HTML/CSS","JavaScript","PostgreSQL"],
    niceToHave: ["MySQL","REST APIs","Git","React","Vue.js","Bootstrap"],
    sourceUrl: "https://techcareerweb.com/article-details/NmVN1xM2",
    email: "hr@ktmdisolution.com",
    postedAt: "2026-10-08T05:04:28.915Z",
    employment: "Full-time",
    level: "Junior",
    salary: "Negotiable",
  },
  {
    id: "4dfb89b7-fd4a-4c45-a0c4-1896a5ff239b",
    title: "Lead Network Engineer (Network & Security)",
    company: "Trust Force Myanmar",
    location: "Yangon, Myanmar",
    description: "Trust Force Myanmar နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nLead Network Engineer (Network & Security) (Male) 2 Posts\n\nOur company is rapidly growing, and we are looking for an experienced Lead Network Engineer to join our team. If you have strong expertise in Network Infrastructure & Security and are ready to take a leadership role, we would love to hear from you!\n\nKey Responsibilities\n• Provide strategic leadership, technical consultation, and operational support for enterprise-wide IT network infrastructure.\n• Assess current network environments and develop network architectures based on industry best practices and advanced Network & Cyber Security standards.\n• Lead strategic infrastructure projects and ensure timely and cost-effective project delivery.\n• Identify, analyze, and resolve complex networking issues using advanced technical expertise.\n• Take ownership of enterprise-wide network team tasks and project deliverables.\n• Provide technical training to team members and SI Partners.\n• Maintain proper documentation for Network Infrastructure & Security.\n• Manage and coordinate with vendors for Network Infrastructure & Security products.\n• Design and implement internal and external networks to ensure smooth, secure, and reliable operations.\n\nQualifications\n• Relevant industry certifications such as CCNP / PCNSE / NSE / MTCNA / MTCNE or equivalent.\n• Knowledge of Linux, VMware, and Microsoft operating systems.\n• Strong theoretical and practical knowledge of Layer 2 & Layer 3 Networking.\n• Experience with OSPF / MPLS / BGP / VXLAN / EVPN technologies.\n• 4+ years of experience in Network Engineering with strong Senior-level experience.\n• Strong hands-on project experience with Huawei / Cisco / Fortinet / Palo Alto / Ruijie / MikroTik.\n• Experience with Next-Generation Firewall (NGFW) implementation and migration for enterprise customers.\n• Strong leadership, problem-solving, communication, and project management skills.\n\nSalary - Negotiable\nLocation - INNO City\nWorking Hours - 9:00 AM – 5:00 PM\n\nBenefits\nAttendance Bonus, Rare Cost,OT Allowance\nUniform and Transportation Allowance provided after probation\nYearly Bonus,Annual Trip\n\nHow to Apply\nInterested candidates are kindly requested to send your updated CV/Resume to:\nHR@trustforcemm.com\n\nJoin our team and take your Network\n& Security career to the next level!",
    mustHave: ["Linux","Next.js"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/AplVM7f6",
    email: "HR@trustforcemm.com",
    postedAt: "2026-10-08T05:00:42.550Z",
    level: "Senior",
  },
  {
    id: "28f3f90d-c72c-47ca-b89f-c84d10598f5e",
    title: "Web Developer",
    company: "Royal Express",
    location: "North Okkalapa, Yangon",
    description: "Royal Express နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nWeb Developer (M/F) 1 Post\n\n| BUILD THE DIGITAL FUTURE WITH US\n\nLove Coding? Turn Your Ideas into Digital Experiences!\n\nRoyal Express တွင် Web Developer (1 Post) ခေါ်ယူနေပါသည်။\nWebsite ကို Build, Maintain, Improve & Scale လုပ်ရင်း Real Business Projects များတွင် ပါဝင်ဖန်တီးနိုင်မည့် အခွင့်အရေးကောင်းတစ်ခုပါ။\n\nKEY RESPONSIBILITIES\nDevelop clean, efficient & scalable web applications\nCreate responsive UI using HTML, CSS & JavaScript\nIntegrate APIs, Back-end Services & Databases\nMaintain, improve & optimize existing websites\nGather technical requirements and maintain documentation\nCollaborate with Web Designers & Internal Teams\nStay updated with the latest Web Technologies & Trends\n\nJOB REQUIREMENTS\nWeb Development experience\nStrong knowledge of HTML, CSS & JavaScript\nUnderstanding of APIs & Databases\nGood problem-solving & analytical skills\nTeamwork & communication skills\nPassion for learning new technologies\n\nIf you love building, creating & solving — WE WANT YOU!\n\nAPPLY NOW!\nEmail: humanresources26.rex@gmail.com\n09765661768\nViber: 09972655128\n\nNorth Okkalapa, A Wyne Bus Stop\nCorner of Padonama & Amara Street\n\nBUILD YOUR SKILLS. BUILD YOUR CAREER. BUILD WITH ROYAL EXPRESS.",
    mustHave: ["Node.js","HTML/CSS","JavaScript"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/8UXSj33Q",
    email: "humanresources26.rex@gmail.com",
    postedAt: "2026-10-08T04:07:58.183Z",
    level: "Mid",
  },
  {
    id: "a4a66037-f8a8-4b1b-a361-1a9842d8d01b",
    title: "Mid-level Laravel & React Developer",
    company: "Royal Motor Co.,Ltd",
    location: "Thaketa, Yangon",
    description: "Royal Motor Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nMid-Level Laravel & React\nDeveloper (M/F) 1 Post\n\nSalary : Open For Negotiate\nIndustry : Trading\nLocation : Thaketa Township.\nOffice Days : Monday to Friday\nHolidays : Saturday, Sunday & Gazette Holidays\nTransportation : Ferry Provides\n\nJob Requirements\n- 2–3 years of professional web development experience.\n- Strong knowledge of Laravel and PHP.\n- Good experience with React.js, JavaScript/TypeScript, HTML, and CSS.\n- Good knowledge of MySQL and database design.\n- Experience developing and consuming REST APIs.\n- Good understanding of Git/GitHub.\n- Understanding of authentication, authorization, and security best practices.\n- Ability to write clean, reusable, and maintainable code.\n- Good problem-solving and debugging skills.\nPreferred Skills\n- Laravel Repository/Service Pattern experience.\n- Experience with TanStack Query, Zustand, or similar React libraries.\n- Experience with Tailwind CSS.\n- Basic knowledge of Linux, Docker, AWS, or CI/CD.\n- Experience with ERP, accounting, or enterprise applications.\n\nKey Responsibilities\n- Develop RESTful APIs and backend features using Laravel/PHP.\n- Build responsive and reusable UI components using React.js.\n- Design and optimize MySQL databases and queries.\n- Integrate React applications with Laravel APIs.\n- Implement authentication, authorization, validation, and business logic.\n- Debug, test, optimize, and maintain existing applications.\n- Follow Git/GitHub development and code review practices.\n- Collaborate with Project Managers, UI/UX Designers, and other developers.\n\nIf you are looking for a position that will provide you with career development and a great work environment, apply today!\nEmail : hr@royalmotor.info\nViber Phone : 09798236943",
    mustHave: ["Laravel","React","PHP","JavaScript"],
    niceToHave: ["TypeScript","HTML/CSS","MySQL","REST APIs","Git","Tailwind CSS"],
    sourceUrl: "https://techcareerweb.com/article-details/xSOT0Nan",
    email: "hr@royalmotor.info",
    postedAt: "2026-10-08T03:56:48.651Z",
    level: "Mid",
    salary: "Open For Negotiate",
  },
  {
    id: "926e81ad-5fc5-46ee-97a5-732d5316683b",
    title: "Data Analyst",
    company: "SHWE Bank",
    location: "Kyauktada, Yangon",
    description: "SHWE Bank နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nData Analyst (M/F)\n\nPosition : Assistant Supervisor/ Supervisor\nIndustry : Banking\nWorkspace : Kyauktada Tsp, Yangon\n\nJob Purpose : To Provide intelligence analysis and Analytics\nCore Tasks:\nData Extraction from data sources\nTranslate into Business Language\nTransform into Visualization\n\nRequirements :\nBachelor of Computer Science, Statistic.\nMinimum 2-3 years of work experience in Banking.\nProficiency in SQL (MSSMS, PostgreSQL) & Power BI\nAttahed : Expected Salary\n\nDetail information and Apply here : https://mm.linkedin.com/jobs/view/business-intelligence-%E2%80%93-assistant-supervisor-supervisor-at-shwe-bank-4475154643?position=1&pageNum=0&refId=AgFFkiRdKA1FZyXU%2BBdgsA%3D%3D&trackingId=sExQWkKb3nnJY5opdnfU7g%3D%3D&_gl=1*vscesf*_gcl_au*NzcwNTc2ODc2LjE3OTEzNjY2Mzg.\n\nOr direct email to chamko.ko@shwebank.com.mm",
    mustHave: ["Analytics","PostgreSQL"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/Cq29Pk4u",
    email: "chamko.ko@shwebank.com.mm",
    postedAt: "2026-10-08T03:49:56.596Z",
    level: "Mid",
  },
  {
    id: "82337cb0-1612-4e67-80e6-2ad357c6da31",
    title: "Senior Technical Odoo Consultant",
    company: "Alpha International Co.,Ltd",
    location: "Thaketa, Yangon",
    description: "Alpha International Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nSenior Technical Odoo Consultant (M/F)\n(On-site | Thaketa Township)\n\nWe are looking for a Senior Technical Odoo Consultant to lead the architecture and engineering of custom, enterprise-grade ERP deployments.\n\nIf you excel at building scalable Python modules, optimizing complex PostgreSQL databases, and connecting Odoo seamlessly to external ecosystems, we want to hear from you.\n\nKey Details\nLocation: Thaketa Township, Yangon\nWorking Hours: Monday – Friday (9:00 AM – 5:00 PM)\nJob Type: Full-time (On-site)\n\nWhat You’ll Do\nCustom Module Development: Architect, write, and test high-performing custom Odoo modules and extensions in Python following strict Odoo standards.\nIntegrations & APIs: Design and deploy robust RESTful, XML-RPC, and JSON-RPC integrations connecting Odoo to e-commerce, POS hardware, banking systems, and messaging APIs (Telegram/Messenger).\nDatabase Engineering: Optimize PostgreSQL databases, tune complex SQL queries, and resolve performance bottlenecks in high-transaction setups.\nUpgrades & Migrations: Lead data migrations and refactor legacy code across Odoo versions (Enterprise v15 to v19).\nTechnical Leadership: Conduct code reviews, establish standards, and mentor junior developers.\nDevOps & Infrastructure: Manage Ubuntu/Linux server environments, Nginx configurations, deployment pipelines, and Odoo.sh or cloud hosting.\n\nWhat We’re Looking For\nEducation: Bachelor’s degree in Computer Science, Software Engineering, IT, or equivalent practical experience.\nExperience: 4–6+ years in backend development, with at least 3 years dedicated strictly to custom technical solutions in Odoo.\nCore Tech Stack: Expert Python skills; solid JavaScript (OWL framework, POS customization); deep PostgreSQL mastery.\nSystem Admin: Proficient in Linux (Ubuntu), Nginx, Git workflows, and CI/CD pipelines.\nLanguages: Professional communication skills in both Burmese and English.\n\nBonus Points If You Have:\nDeep customization experience in Odoo Accounting, POS, or Inventory modules.\nOfficial Odoo Technical Certification.\nHands-on experience with Docker for dev/staging environments.\n\nHow to Apply\nReady to build enterprise solutions with us? Send your CV or reach out directly:\n\nEmail: alpharecruitmentofficer@gmail.com\nViber: 09772202505",
    mustHave: ["Python","PostgreSQL","Performance","Linux"],
    niceToHave: ["Nginx","JavaScript","Git","CI/CD","Docker"],
    sourceUrl: "https://techcareerweb.com/article-details/ZJIFNsdJ",
    email: "alpharecruitmentofficer@gmail.com",
    postedAt: "2026-10-07T09:47:43.681Z",
    employment: "Full-time",
    level: "Senior",
  },
  {
    id: "8392d6b1-dc33-4158-8c35-a0eb775c2d6a",
    title: "Senior Software Developer",
    company: "Pay Plus Myanmar",
    location: "Yangon, Myanmar",
    description: "Pay Plus Myanmar နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nSenior Software Developer (M/F) 1 Post\n\nJob Summary\nWe are seeking an experienced Senior Software Developer to design, develop, and maintain scalable enterprise applications and transaction systems. The ideal candidate should have strong backend development experience, mobile application knowledge, leadership capability, and experience working in secure and high-availability environments.\n\nKey Responsibilities\n-Design, develop, and maintain enterprise-grade applications and APIs\n-Lead backend and system architecture design discussions\n-Develop and support mobile applications using Flutter\n-Ensure application performance, scalability, reliability, and security\n-Collaborate with product owners/project managers, QA teams, system engineering, and business stakeholders\n-Review code and enforce development best practices and coding standards\n-Troubleshoot and resolve complex technical and production issues\n-Mentor junior and mid-level developers\n-Participate in system deployment, release management, and production support\n-Prepare and maintain technical documentation\n\nRequired Qualifications\n-Bachelor’s degree in Computer Science, Information Technology, or related field\n-5+ years of software development experience\n-Strong experience in backend development using Java (Spring Boot) or C# (.NET Core)\n-Experience in mobile application development using Flutter\n-Strong understanding of RESTful APIs, system integration, and secure application development\n-Experience with relational databases such as PostgreSQL or MSSQL\n-Familiarity with microservices architecture and distributed systems\n-Knowledge of authentication, authorization, and API security best practices\n-Experience with Git, CI/CD processes, and Agile/Scrum methodologies\n-Strong analytical, troubleshooting, and leadership skills\n\nPreferred Skills and Nice to Have\n-Experience with high-volume transaction or payment systems\n-Familiarity with fintech, banking, or enterprise platforms\n-Experience with Redis, message queues, or caching technologies\n-Knowledge of Docker, Kubernetes, or containerization technologies\n-Experience with cloud platforms and deployment automation\n-Experience mentoring developers and leading technical initiatives\n-Experience with ISO 8583/20022, QR payment, or digital payment integrations\n-Familiarity with monitoring and logging tools\n-DevOps or infrastructure experience\n-Experience working in regulated or highly secured environments\n\nEmployment Type - Full-Time\nWorking Hour - 9:00 to 5:00 (Monday to Friday)\nDay Off - Sat, Sun & Public Holidays\nLocation - Sule Pagoda Road\n\nIf you are interested, please send your CV to hr@payplusmyanmar.com",
    mustHave: ["Flutter","Performance","PostgreSQL","Distributed systems"],
    niceToHave: ["Git","CI/CD","Redis","Docker","Kubernetes"],
    sourceUrl: "https://techcareerweb.com/article-details/Wt5T46aP",
    email: "hr@payplusmyanmar.com",
    postedAt: "2026-10-07T07:27:13.626Z",
    employment: "Full-time",
    level: "Senior",
  },
  {
    id: "6a53806b-5307-40b8-bc18-474df5df9263",
    title: "Full-Stack Developer",
    company: "Gindai Technologies",
    location: "Remote · Myanmar",
    description: "Gindai Technologies နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nFull-Stack Developer (M/F)\n\nFull-Stack Developer (Remote) — Immediate Start\nWe’re looking for a Full-Stack Developer to join our team and work on an existing production application with ongoing development.\n\nTech Stack:\nGo / Golang (Gin)\nNext.js / React / TypeScript\nPostgreSQL\nREST API\nGit / GitHub\nDocker (plus)\n\nRequirements:\nStrong experience with Go/Golang\nExperience with Next.js, React & TypeScript\nGood knowledge of PostgreSQL and REST APIs\nComfortable working with an existing codebase\nStrong problem-solving and debugging skills\nAble to work independently and communicate effectively\n\nPreferred: Experience with POS, inventory, retail, accounting, ERP, CRM, or other business-management systems.\n\nCompensation: Negotiable, based on experience and technical capability\n\nTo Apply: Please send:\nCV\nGitHub / Portfolio\nPrevious project experience\nExpected salary/rate\nAvailability\n\nContact: hrteam@gindai.tech",
    mustHave: ["Go","Next.js","React","TypeScript"],
    niceToHave: ["PostgreSQL","REST APIs","Git","Docker"],
    sourceUrl: "https://techcareerweb.com/article-details/b6XBC8MS",
    email: "hrteam@gindai.tech",
    postedAt: "2026-10-07T05:33:42.217Z",
    level: "Mid",
  },
  {
    id: "0cc20157-d20b-47b3-9208-48898b28ae61",
    title: "Senior Software Developer",
    company: "Myanmar Oplans Co.,Ltd",
    location: "Yangon, Myanmar",
    description: "Myanmar Oplans Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nSenior Software Developer (M/F)\n\nWe are looking for experienced Senior software developers who can participate in Foreign Projects.\n\nResponsibilities\n・Designing, Implementing\n・Software testing and bug fixes\n・Any other duties as and when assigned by team leader or project manager\n\nRequirements\n・Experience 3 years and above for Senior Level (JAVA, DB, HTML, CSS, JAVASCRIPT)\n・No need to have a Japanese Skill Level but having an interest in the Japanese Language is preferred\n\nCan negotiate your desired salary and we will consider according to the working experience and qualifications of the applicants.*\n\nPlease send CV to\nrecruit@mop-ygn.com",
    mustHave: ["Testing","HTML/CSS","JavaScript"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/qu3QbSQA",
    email: "recruit@mop-ygn.com",
    postedAt: "2026-10-07T04:53:43.545Z",
    level: "Senior",
  },
  {
    id: "634a5456-04af-482b-ad76-d6d527d6e2b3",
    title: "B2B Technical Support Engineer",
    company: "Myanmar HXCT Co.,Ltd",
    location: "Yangon, Myanmar",
    description: "Myanmar HXCT Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nB2B Technical Support Engineer (Managed Services) (M/F)\n\nLocation: Yangon, Myanmar\nDepartment: NOC / Managed Services\nEmployment Type: [Full-Time/Shift-based]\n\nWe are looking for a dedicated and technically skilled B2B Technical Support Engineer to join our Managed Services team at a leading Telecommunication Company. In this role, you will support enterprise clients by delivering prompt and effective technical solutions for a wide range of connectivity services.\n\nKey Responsibilities:\n- Troubleshoot and resolve enterprise network complaints for services such as DIA, IP Transit, DPLC, IPLC, IPVPN, SIP, and APN.\n- Understanding the enterprise network and providing technical solutions to the network issue in a timely manner.\n- Analyze service disruptions including downtime, packet loss, high latency, and bandwidth issues, and propose immediate technical remedies.\n- Collaborate with internal technical domains and third-party vendors (3PVs) to ensure trouble tickets are resolved within committed SLAs\n- Monitor and report critical incidents and outages, keeping customers and stakeholders actively informed\n- Daily reporting and active notification of critical incidents and network outages to customers and management\n- Understand customer network environments to provide accurate technical analysis and resolution.\n- Perform root cause analysis on recurring issues and recommend service improvement plans.\n- Maintain and report daily performance metrics, ensuring the team meets or exceeds KPIs and SLAs.\n\nQualifications:\n- Bachelor’s degree in Telecommunications, Computer Engineering, Information Technology, or a related field.\n- Minimum [2] years of experience in Enterprise technical support or NOC operations, preferably in the ISP or telecom sector.\n- Familiar with routing protocols - BGP, MPLS, ISIS, OSPF, VLAN, Route map, VPN, L2VPN, etc\n- Strong understanding of enterprise IP networks and WAN technologies. (CCNA Certified/ CCNP preferred)\n- Hands-on experience with troubleshooting tools (ping, traceroute, interface/port diagnostics, etc.).\n- Good knowledge of routing, switching, and Layer 2/3 protocols.\n- Strong analytical, communication, and coordination skills.\n- Good communication skills in English and Burmese\n- Good knowledge of Microsoft Office\n- Willing to work in shifts and handle on-call duties as required.\n\nSalary: Negotiable, based on experienced\n\nInterested candidates are encouraged to submit the resume and cover letter to ellymyint@hxcy.com.cn\nKyawThuSoe@hxcy.com.cn\nViber contact - 09265446493\n\nApplication Deadline (15 Oct 2026)",
    mustHave: ["Performance"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/5g5rRGUJ",
    email: "ellymyint@hxcy.com.cn",
    postedAt: "2026-10-07T04:44:56.281Z",
    employment: "Full-time",
    level: "Mid",
    salary: "Negotiable, based on experienced",
  },
  {
    id: "f8b42736-0121-4d01-bbe5-3a591567e31e",
    title: "Software Developer",
    company: "RITA IT-Solutions Myanmar",
    location: "Yangon, Myanmar",
    description: "RITA IT-Solutions Myanmar နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nSoftware Developer (M/F)\n\nWe are looking for a passionate and motivated Software Developer to join our growing team!\n\nKEY RESPONSIBILITIES\nDesign, develop, test, deploy, and maintain software applications and systems.\nAnalyze user requirements and translate them into system specifications.\nCollaborate with cross-functional teams to deliver high-quality solutions.\nParticipate in quality assurance activities, including writing and executing test cases.\nIdentify, troubleshoot, and resolve system or application issues.\nEnsure system performance, security, and reliability.\nPrepare technical documentation and support system operations.\nWork independently or as part of a team. to complete tasks assigned by the Project Manager.\n\nQUALIFICATIONS\nBachelor's degree holder.\nProfessional software development\nexperience: 2-3 years.\nJapanese language proficiency: JLPT N3 or above (N2 preferred)\nProficient in one or more programming languages (e.g., Java, C#, PHP, Python, etc.).\nKnowledge of database systems (e.g., MySQL, PostgreSQL, SQL Server).\nFamiliar with web technologies, APIs, and software development frameworks.\nBasic knowledge of software testing and Quality Assurance (QA) processes.\nExperience in writing and executing test cases and test scenarios.\nExperience in web application testing, API testing, or database validation is an advantage.\nStrong attention to detail, problem-solving mindset, and ability to work both independently and in a team.\nGood communication skills.\n\nSEND YOUR CV TO\nnandarlin.hr@nicemyanmartravel.com\nPHONE / VIBER\n09753539666",
    mustHave: ["Performance","PHP","Python","MySQL"],
    niceToHave: ["PostgreSQL","Testing"],
    sourceUrl: "https://techcareerweb.com/article-details/YnDKAU0B",
    email: "nandarlin.hr@nicemyanmartravel.com",
    postedAt: "2026-10-06T07:54:39.528Z",
    level: "Mid",
  },
  {
    id: "5aa97aec-50b8-456d-8fd3-c0da3ee685f9",
    title: "Junior SOC Engineer",
    company: "uab Bank",
    location: "Yangon, Myanmar",
    description: "uab Bank နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nJunior SOC Engineer (M/F)\n\nJoin uab bank and be part of our cybersecurity team! If you are interested in Security Operations, threat monitoring, and incident detection, we’d love to hear from you.\n\nPosition: Junior SOC Engineer\nLocation: Yangon, Myanmar\nExperience: 1–2 years\n\nKey Responsibilities\n• Monitor security alerts, events, and logs from servers, endpoints, and network devices.\n• Perform first-level analysis and triage of security alerts.\n• Investigate suspicious activities, including failed login attempts, brute-force attacks, malware detections, and unauthorized access.\n• Monitor and analyze unusual network activities and privilege-related events.\n• Perform vulnerability scanning and assessment using OpenVAS and other approved security tools.\n• Support incident detection, response, documentation, and security monitoring activities.\n\nRequirements\n• Bachelor’s degree in IT, Computer Science, Cybersecurity, or a related field.\n• 1–2 years of experience in cybersecurity, SOC operations, system/network administration, or a related field.\n• Basic knowledge of SOC operations, security monitoring, alert triage, and incident response.\n• Understanding of TCP/IP, DNS, HTTP/HTTPS, VPN, VLAN, firewalls, and common network attacks.\n• Basic knowledge of Windows/Linux, system and security logs, and network infrastructure.\n• Familiarity with malware, phishing, brute-force attacks, privilege escalation, endpoint security, and system hardening.\n• Familiarity with SIEM/XDR or security monitoring platforms is preferred.\n• Good analytical, troubleshooting, documentation, and communication skills.\n• Ability to work effectively with cross-functional teams.\n\nHow to Apply\nInterested candidates are invited to submit their updated CV to aungzawwin@uab.com.mm",
    mustHave: ["REST APIs","Linux"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/ElA23CBg",
    email: "aungzawwin@uab.com.mm",
    postedAt: "2026-10-06T04:57:02.307Z",
    level: "Junior",
  },
  {
    id: "6128b119-0c57-4188-87cf-e0833b3b4790",
    title: "Junior L2 Network Infra Engineer",
    company: "AGB Communication",
    location: "Kamayut, Yangon",
    description: "AGB Communication နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nJr. L2 Network Infra Engineer (1) post\n\nRoles & Responsibilities\nImplementing, maintaining and monitoring service provider MPLS backbone network to provide\nBroadband service, Metro Ethernet, IP Transit service and MPLS L2/L3 VPN service in Yangon.\nConfiguring and installing various network devices and services (e.g., routers, switches, L3/L2VPN, QoS, MPLS).\nTroubleshoot issues, ensure network availability and provide technical support and Internal office Network.\nMonitor network performance, integrity, reliability and system resource utilization daily.\nReceives e-mail or telephone requests from call center/technical support to resolve trouble ticket issues.\nCooperate with team members in network migration and implementing.\nDocumenting technical resources such as IP assignment, Metro and IP-VPN user list, equipment usage and etc.\nDrawing network design diagram for network integration and new project.\nActively participating via Microsoft team and SharePoint for inter department communication.\nReport regularly to Team leader, Operation Manager.\n\nQualifications & Requirements\nAbility to work collaboratively in a team environment.\nCertifications such as Cisco CCNA and CCNA-SP are preferred.\nDeep understanding of inter-networking protocols (e.g., MPLS L2/L3 VPN, BGP, OSPF, ISIS, QoS)\nSolid understanding of the OSI or TCP/IP model.\nKnowledge of coding languages for scripting (e.g., Python, Perl).\nHands-on experience with monitoring, network diagnostic and network analytics tools.\nDegree in Computer Science/technology/engineering or a related subject.\n\n\n19th Floor, Office Tower (3). Times City, No. 37, Kamayut Township, Yangon, Republic of the Union of\nPh: +959977878889 , +959797178889\nURL: www.agbeorumumication.com\n\nHow to Apply:\nSend your updated CV to:\nhr@agbcommunication.com\n\nLocation: Times City, Office Tower (3),19th floor\nWorking Hours: 8:45 AM - 5:15 PM\nOff Days: Saturday, Sunday & Public Holiday\nVb : 09968185475",
    mustHave: ["Performance","Python","Analytics"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/Htt7oQAU",
    email: "hr@agbcommunication.com",
    postedAt: "2026-10-06T04:53:01.241Z",
    level: "Junior",
  },
  {
    id: "52e9a382-b251-426f-a61c-044a935b7aeb",
    title: "Network Security Engineer",
    company: "Beyond Technology Group",
    location: "Yangon, Myanmar",
    description: "Beyond Technology Group နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nNetwork Security Engineer – Male (1) Post\n\nWe are seeking Network Security Engineers to deploy, maintain, and support enterprise security solutions.\n\nKey Responsibilities:\n• Install, configure, and troubleshoot security systems (Firewalls, IPS, Endpoint Security, etc.)\n• Provide technical support and resolve system-related issues\n• Ensure system stability, performance, and availability\n• Coordinate with vendors and internal teams for issue resolution\n• Prepare technical documentation and reports\n\nRequirements:\n• Bachelor’s degree in IT, Computer, or related field\n• 2–5 years of experience in networking, system, and security-related roles\n• Strong understanding of networking fundamentals (TCP/IP, routing, switching)\n• Hands-on experience with security systems and IT infrastructure\n• Strong knowledge of cybersecurity concepts\n• Good troubleshooting and problem-solving skills\n• Good communication and teamwork abilities\n\nPreferred:\n• Candidates currently residing in Nay Pyi Taw or willing to relocate to Nay Pyi Taw will be given priority\n• Experience with security products (e.g., Palo Alto, A10, Trend Micro, Fortinet, etc.)\n• Relevant certifications are a plus\n\nLocation: Nay Pyi Taw, Yangon\nEmployment Type: Full-time\nSalary & Benefits: Negotiable\n\nHow to Apply:\nSend your CV to: info@beyondtechgroup.com\nContact No: 09402235814",
    mustHave: ["Performance"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/LICro14o",
    email: "info@beyondtechgroup.com",
    postedAt: "2026-10-05T07:13:16.053Z",
    employment: "Full-time",
    level: "Mid",
  },
  {
    id: "b2b4f565-5696-4f05-843f-d324ae09b83f",
    title: "Junior Graphic Designer",
    company: "Cauldron Creative Cloud",
    location: "Remote · Myanmar",
    description: "Cauldron Creative Cloud နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nJunior Graphic Designer (M/F)\n\n(Fully remote)\n\nDigital Marketing လောကမှာ စိတ်ကူးသစ်တွေနဲ့ ရေးဆွဲဖန်တီးရတာကို ဝါသနာပါပြီး တက်ကြွမှုရှိတဲ့ Junior Graphic Designer တစ်ဦးကို Fully remote / WFH အဖြစ် အတူလက်တွဲရန် ဖိတ်ခေါ်ချင်ပါတယ်။\n\nJob Description\n- Social Media Content များ အတွက် ဆွဲဆောင်မှုရှိသော Graphics Design Visual များကို ဖန်တီးနိုင်ရမည်။\n- Marketing Team ၏ Campaign အယူအဆများကို ထိရောက်သော visual တစ်ခုအဖြစ် ပြောင်းလဲဖန်တီးနိုင်ရမည်။\n\nMinimum skills requirements\n- Adobe Photoshop, Illustrator, Canva/Figma စသည့် tools များကို ကျွမ်းကျင်စွာ အသုံးပြုနိုင်သူ ဖြစ်ရမည်။\n- Digital Marketing လောက၏ ဒီဇိုင်း Trend များကို စိတ်ဝင်စားပြီး လေ့လာသင်ယူလိုစိတ် ရှိသူ ဖြစ်ရမည်။\n- မတူညီသော Client များ၏ Brand Guidelines များကို Agency စံနှုန်းနှင့်အညီ ရေးဆွဲနိုင်ရမည်။\n\nExperience Requirement\n- လုပ်ငန်းအတွေ့အကြုံမလိုပါ။ ကြော်ငြာ agency workflow သဘောတရားကို အခြေခံနားလည်ပြီး ကြိုးစားသင်ယူလိုစိတ်ရှိလျှင်အဆင်ပြေပါသည်။\n\ninquiry@cauldroncreativecloud.com သို့ CV + Portfolio ကို မျှော်မှန်းလစာနှင့်အတူ ပေးပို့ လျှောက်ထားနိုင်ပါသည်။",
    mustHave: ["Figma"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/OUzERClY",
    email: "inquiry@cauldroncreativecloud.com",
    postedAt: "2026-10-05T07:03:54.202Z",
    level: "Junior",
  },
  {
    id: "1b080261-5488-49b1-ac77-9286d0aa6cd4",
    title: "IT Support",
    company: "Minn Shin Saw Co.,Ltd",
    location: "Yangon, Myanmar",
    description: "Minn Shin Saw Co.,Ltd နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nIT Support (M/F)\n\nလူတွေ အလုပ်လုပ်ရတာ ပိုလွယ်ကူအောင် Technology ကို Support ပေးချင်ပါသလား?\nMinn Shin Saw မှာ အသုံးပြုသူတွေရဲ့ Technical Issues တွေကို နားထောင်၊ စစ်ဆေး၊ ဖြေရှင်းပြီး အလုပ်လုပ်ငန်းစဉ်တွေ မရပ်တန့်အောင် ကူညီပေးမယ့် IT Support Team Member တစ်ဦးကို ရှာဖွေနေပါတယ်။\n\nဒီ Role မှာ PC၊ Laptop၊ Peripheral နဲ့ Network ဆိုင်ရာ အခက်အခဲတွေကို Troubleshoot လုပ်ပေးရမှာဖြစ်သလို User တွေကို ရိုးရှင်းတဲ့စကားနဲ့ ရှင်းပြပေးခြင်း၊ Service Request / Ticket တွေကို စနစ်တကျ Update လုပ်ခြင်း၊ Documentation ပြုစုခြင်းတွေလည်း ပါဝင်မှာဖြစ်ပါတယ်။\n\nResponsibilities\n- Answer technical questions regarding computer systems timely and effectively.\nUpdate users on the status of their service requests.\n- Gather and analyze data to diagnose PC hardware & Windows problems.\n- Diagnose hardware and software issues on desktops, laptops, and peripherals.\n- Change configurations, settings and permissions to fix the issues.\n- Install, configure, and update new software and hardware drivers as required.\n- Troubleshoot and resolve PC and Network support user requests.\n- Tacking all service requests and updating tickets as needed.\n- Monitor and report PC health and network performance metrics.\n- Identify system vulnerabilities, routine anti-malware, threat preventions update.\n- Documentation processes, routine updates of user activities, manuals, configuration steps.\n- Report to Managers and other departments as required.\n\nRequirements & Skills\n- Knowledge of commonly used software, hardware and applications.\n- Oral communication skills to gather information and explain technical concepts in simple language.\n- Written communication skills to create useful end-user manuals, documents.\n- Analytical and problem-solving skills to troubleshoot and diagnose issues.\n- Time management skills to provide updates and fixes within a promised time frame.\n- Multitasking skills to assist multiple users at once.\n- Communicate effectively with end-users to gather information and provide updates.\n- Interact professionally and positively with customers and coworkers.\n\nJob Description\n- A minimum 1 year experience in PC and network support.\n- Diploma, degree or equivalent certification in a relevant field.\n- Proficient in diagnosing and resolving hardware and software issues.\n- Knowledge of Windows and/or macOS operating systems.\n- Experience user account management and privileges.\n- Understand networking concepts and protocols (TCP/IP, DNS, DHCP).\n- Basic understanding of cybersecurity principles and best practices.\n- Good communication and interpersonal skills.\n- Problem-solving and troubleshooting abilities.\n- Ability to work independently and collaboratively within a team.\n- Customer-focused with a commitment to delivering high-quality support.\n- CompTIA A+, Network+, or similar certifications are advantages.\n\nWorking Conditions\n- May require occasional evening or weekend work for system maintenance or upgrades.\n- Physical ability to lift and move computer equipment as needed.\n- Being a member of fast-paced company challenging is a must to learn and apply DevOps, Web services and Cloud technologies.\n\nApply Now:\ninfo@minshinsaw.com\nwww.minnshinsaw.com",
    mustHave: ["Performance"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/O1SGpkQw",
    email: "info@minshinsaw.com",
    postedAt: "2026-10-05T06:53:32.275Z",
    level: "Mid",
  },
  {
    id: "b5583a35-72ab-4c31-893d-b50995624ba0",
    title: "IT Support Specialist",
    company: "Techxido",
    location: "Yangon, Myanmar",
    description: "Techxido နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nIT Support Specialist (M/F)\n\nJOIN THE TECHXIDO TEAM\nAre you passionate about technology, innovation, and career growth? Techxido Company Ltd. is expanding, and we are looking for talented, dynamic, and driven professionals to join our growing team in Yangon!\n\nWhy Join Techxido?\n• Growth Opportunities: Accelerate your career in a fast-paced, forward-thinking tech environment.\n• Collaborative Culture: Work alongside creative minds, passionate innovators, and a supportive team.\n• Impactful Work: Be a key player in delivering high-quality tech solutions and driving real market impact.\n\nLocation: Yangon, Myanmar\nJob Type: Full-time\n\nReady to Take the Next Step?\nSend your updated CV, expected salary, and cover letter to us!\n\n• Email: shop@techxido.com\n• Phone / Telegram: 09977999777",
    mustHave: ["Next.js"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/GjhbRiZ8",
    email: "shop@techxido.com",
    postedAt: "2026-10-04T05:04:33.346Z",
    employment: "Full-time",
    level: "Mid",
  },
  {
    id: "316a075a-f52a-429c-b017-e9869bad635b",
    title: "Junior Software Technician (POS Service)",
    company: "The Lnkits Technology",
    location: "Remote · Myanmar",
    description: "The Lnkits Technology နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nJunior Software Service Technician (POS Service) (M/F)\n\nThe Lnkits Technology တွင် POS Software & Hardware ပိုင်းအတွက် Junior Software Service Technician များကို အမြန်ခေါ်ယူနေပါသည်။\n\nတာဝန်များ\nPOS Software Installation & Configuration ပြုလုပ်ခြင်း\nPOS Hardware (Printer, Scanner, Cash Drawer) တပ်ဆင်ခြင်း\nCustomer များအား Software Training ပေးခြင်း\nOn-site / Remote Support ပေးခြင်း\nSoftware & Hardware ပြဿနာများကို စစ်ဆေးဖြေရှင်းပေးခြင်း\n\nလိုအပ်သောအရည်အချင်းများ\nComputer Hardware, Windows နှင့် Networking အခြေခံဗဟုသုတရှိသူ\nသင်ယူလိုစိတ်ရှိပြီး Customer Service ကောင်းမွန်သူ\nခရီးသွားလာနိုင်သူ\nအတွေ့အကြုံမရှိသူများလည်း လျှောက်ထားနိုင်ပါသည် (Training ပေးမည်)\n\nအကျိုးခံစားခွင့်များ\nအလုပ်ခွင်အတွင်း Training ပေးမည်\nလစာ + Performance Bonus\nCareer Development အခွင့်အလမ်း\nFriendly Working Environment\n\nအလုပ်နေရာ – Yan Kin Township, Yangon\n\nလျှောက်ထားလိုပါက -\nCV ကို Email ပို့၍ဖြစ်စေ၊ Viber မှတစ်ဆင့်ဖြစ်စေ ဆက်သွယ်လျှောက်ထားနိုင်ပါသည်။\n09760300995\ninfo@mmleox.com\n\nThe Lnkits Technology နှင့်အတူ သင့်ရဲ့ Career ကို စတင်လိုက်ပါ",
    mustHave: ["Performance"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/o3gvXWQ2",
    email: "info@mmleox.com",
    postedAt: "2026-10-04T04:02:26.917Z",
    level: "Junior",
  },
  {
    id: "c0678859-bae3-4de2-b897-1f3db615ae43",
    title: "Network Engineer",
    company: "ONE TMT Group Limited",
    location: "Yangon, Myanmar",
    description: "ONE TMT Group Limited နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nNetwork Engineer (M/F)\n\nONE TMT Group Limited is building and strengthening its network and infrastructure capabilities to support the next stage of broadband and telecommunications growth.\nWe are looking for a Network Engineer to join our Operation and Project Management Team and contribute to the design, deployment, and continuous improvement of scalable FTTx and transport network solutions.\n\nPosition: Network Engineer\nLocation: Lanthit Office Tower, Lanmadaw\nDepartment: Operation and Project Management\nSalary: 1,000,000 ~ 1,300,000 MMK\n\nWhat You’ll Do\n• Support the design and architecture of transport network solutions connecting FTTx access, IP/MPLS core, and optical transport backbone.\n• Develop HLD/LLD for FTTx rollout areas and DWDM/OTN core and metro transmission upgrades.\n• Evaluate and recommend network technologies, vendors, and equipment based on technical suitability, cost, and scalability.\n• Support network resilience, redundancy, and protection design including ring/mesh topologies, dual-homing, and fast reroute.\n• Contribute to FTTx expansion projects, RFPs, and enterprise/wholesale connectivity solutions.\n• Support the implementation of emerging technologies including Segment Routing, SDN/NFV, and network slicing.\n• Drive continuous improvement of engineering and operational processes across the FTTx project lifecycle.\n\nWhat We’re Looking For\nBachelor’s degree in Telecommunications, Electrical/Electronic Engineering, Computer Science, or a related field.\n3+ years of experience in transport/access network engineering.\nExperience in an ISP or telecommunications operator environment, particularly in FTTx/broadband network design.\nStrong knowledge of GPON/XGS-PON, DWDM/OTN, and IP/MPLS networks.\nVendor certifications such as Huawei, Nokia, ZTE, Ciena, or Cisco will be an advantage.\n\nWhy Join ONE TMT?\nBe part of a Growth & Leading company where you can contribute to building a stronger network infrastructure and take part in shaping the next stage of telecommunications development.\n\nCONNECTING TODAY. EMPOWERING TOMORROW.\n\nInterested candidates are invited to apply:\nEmail: onetmtrecruitment@gmail.com",
    mustHave: ["Next.js","Analytics"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/20HriFiK",
    email: "onetmtrecruitment@gmail.com",
    postedAt: "2026-10-02T05:39:55.119Z",
    level: "Mid",
    salary: "1,000,000 ~ 1,300,000 MMK",
  },
  {
    id: "181f3ccd-fce2-4359-993a-c40fd3194cce",
    title: "Graphic Designer",
    company: "GAC Myanmar",
    location: "Sanchaung, Yangon",
    description: "GAC Myanmar နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nGraphic Designer (M/F) 1 Post\n\nGAC Myanmar မှာ သင့်ရဲ့ Design စွမ်းရည်တွေကို အပြည့်အဝ ထုတ်ဖော်ပြသရင်း Career ကို နောက်တစ်ဆင့် တက်လှမ်းဖို့ ဖိတ်ခေါ်လိုက်ပါတယ်။\nYangon Showroom အတွက် တီထွင်ဖန်တီးနိုင်စွမ်းထက်မြက်တဲ့ 𝗚𝗿𝗮𝗽𝗵𝗶𝗰 𝗗𝗲𝘀𝗶𝗴𝗻𝗲𝗿 တစ်ဦး အမြန်လိုအပ်နေပါတယ်။\n\n𝗪𝗵𝗮𝘁 𝘆𝗼𝘂 𝘄𝗶𝗹𝗹 𝗱𝗼:\n• Design Creative Key Visuals, Social Media Content, and Showroom/Event Materials while maintaining brand standards.\n• Use Adobe Photoshop, Illustrator, and basic Premiere Pro for design and video editing tasks.\n• Generate fresh ideas and deliver quality work under tight deadlines.\n\n𝗪𝗵𝗮𝘁 𝘄𝗲 𝗼𝗳𝗳𝗲𝗿:\n• Attractive salary & benefits based on skills, portfolio, and experience.\n• Performance bonuses and career advancement opportunities.\n• A dynamic, creative, and energetic team culture.\n• Long-term career growth with a premium international automotive brand.\n\nAllowance : 3 months quarterly KPI Bonus, Ph Bill, Uniform\nLocation: Hanthawaddy Bus Stop, Pyay Road, Sanchaung Township\nWorking Hours: 9:00 AM – 5:00 PM\nOff Days: Alternate Saturday, Sunday & Public Holidays\n\nApply Now!\nသင့်ရဲ့ CV & Portfolio ကို အောက်ပါ Contact တွေကတစ်ဆင့် အမြန်ဆုံး အကြောင်းကြား ပေးပို့နိုင်ပါပြီ -\nPH - 09774307359\nG mail - thandarp064@gmail.com",
    mustHave: ["Performance"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/yvr0ZjFK",
    email: "thandarp064@gmail.com",
    postedAt: "2026-10-01T04:45:03.805Z",
    level: "Mid",
  },
  {
    id: "e0ff5c46-fd44-42f9-8406-082d8ac23575",
    title: "Junior Graphic Designer",
    company: "Khayah Academy",
    location: "Bahan, Yangon",
    description: "Khayah Academy နှင့်အတူလက်တွဲလုပ်ကိုင်ရန်\n\nJunior Graphic Designer (M/F)\n\nKhayah Academy နဲ့အတူ လက်တွဲလုပ်ကိုင်ဖို့ Creative ဖြစ်ပြီး သင်ယူတိုးတက်လိုစိတ်ရှိတဲ့ Junior Graphic Designer (Full-time) တစ်ဦးကို ခေါ်ယူနေပါတယ်ရှင်။\n\nInternational School Working Environment တစ်ခုမှာ အတွေ့အကြုံသစ်တွေ ရယူလိုသူ၊ International Team နဲ့အတူ ပူးပေါင်းလုပ်ကိုင်ရင်း မိမိရဲ့ Design Skills နဲ့ Professional Experience ကို တိုးတက်စေချင်သူများ လျှောက်ထားနိုင်ပါတယ်။\n\nလုပ်ငန်းအတွေ့အကြုံ မရှိသေးသော Fresh Graduates များလည်း လျှောက်ထားနိုင်ပါတယ်ရှင်။\n\nPosition: Junior Graphic Designer (Full-time)\nJob Description (JD)\n• Create engaging social media designs and marketing visuals, mainly for education-related content.\n• Develop creative visual content based on marketing briefs, campaigns, and content plans.\n• Design promotional materials for school programs, events, activities, and marketing campaigns.\n• Maintain consistency with the school’s brand identity, design guidelines, and visual standards.\n• Collaborate closely with the Marketing Team to develop creative concepts and visual directions.\n• Revise and improve designs based on feedback while maintaining quality and accuracy.\n• Manage assigned design tasks effectively and deliver work within agreed deadlines.\n\nJob Requirements (JR)\n• Proficiency in Adobe Photoshop and Adobe Illustrator.\n• Basic understanding of graphic design principles, typography, color, composition, and layout.\n• Creative mindset with strong attention to detail.\n• Ability to follow established brand guidelines, design systems, and templates.\n• Good time-management skills and ability to meet deadlines.\n• Good communication and teamwork skills.\n• Willingness to learn, accept feedback, and continuously improve design skills.\n• Fresh graduates and junior-level candidates are welcome to apply.\n\nEmployment Information\nWorking Hours: 8:30 AM – 5:00 PM\nOff Days: စနေ၊ တနင်္ဂနွေ နှင့် အစိုးရရုံးပိတ်ရက်များ\nSalary: Negotiable\nEmployment Type: Full-time\nWork Type: On-site\n\nOffice Location:\nRoom No. 2A, Second Floor, Grand Sayarsan Condominium, Sayar San Street, Bahan Township, Yangon, Myanmar\n\nHow to Apply\nစိတ်ပါဝင်စားသူများအနေဖြင့် မိမိ၏ CV (Resume) + Portfolio ကို အောက်ပါ Email သို့ ပေးပို့လျှောက်ထားနိုင်ပါသည်။\nEmail: khayahacademy@gmail.com\n\nImportant Note:\nJunior Graphic Designer Position အတွက် Portfolio မဖြစ်မနေ ပါဝင်ရပါမည်။ Portfolio မပါသော Applications များကို ထည့်သွင်းစဉ်းစားမည် မဟုတ်ပါရှင်။\n\nKhayah Academy International Early Years နဲ့အတူ သင့်ရဲ့ Creativity နဲ့ Design Skills တွေကို Professional Experience အဖြစ် တိုးတက်အောင် ဖန်တီးလိုက်ပါ။",
    mustHave: ["Design systems"],
    niceToHave: [],
    sourceUrl: "https://techcareerweb.com/article-details/ZcLVFpn0",
    email: "khayahacademy@gmail.com",
    postedAt: "2026-09-30T05:00:34.074Z",
    employment: "Full-time",
    level: "Junior",
    salary: "Negotiable",
  },
];
