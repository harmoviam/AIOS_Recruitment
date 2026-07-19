import type { ContentGeneratorService } from '../ports.js';
import type { ContentChannel, ContentPack, ContentRequest } from '../../../types/sourcing.js';

const MAX_VARIANTS = 5;

interface TemplateContext {
  request: ContentRequest;
  salary: string;
  exp: string;
  langs: string;
  source: string;
}

type TemplateBuilder = (ctx: TemplateContext) => string;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const channelTemplates: Array<{ channel: ContentChannel; title: string; builders: TemplateBuilder[] }> = [
  {
    channel: 'FACEBOOK',
    title: 'Facebook Post',
    builders: [
      ({ request, salary, exp, langs, source }) =>
        `🚀 Hiring Alert${source}!\n\nWe are hiring ${request.hiringCount} ${request.roleName} for ${request.cityName}.\n\n✔ ${exp}\n✔ Salary: ${salary}\n✔ Shift: ${request.shift || 'Rotational / Night (as applicable)'}\n✔ Languages: ${langs}\n\nInterested? Comment "INTERESTED" or DM your updated CV + location.\nImmediate joiners preferred.`,
      ({ request, salary, exp, langs }) =>
        `📢 ${request.cityName} job seekers — this one's for you!\n\n${request.hiringCount} openings for ${request.roleName}.\n\n💰 Salary: ${salary}\n🎓 ${exp}\n🗣 Languages: ${langs}\n\nTag a friend who needs this or drop "JOB" in the comments and we'll reach out. Walk-ins welcome — immediate joining!`,
      ({ request, salary, exp, langs, source }) =>
        `Looking for a career move in ${request.cityName}?${source ? ` (${request.sourceName})` : ''}\n\nWe have ${request.hiringCount} open positions for ${request.roleName}.\n\nWhat we offer:\n• Salary ${salary}\n• ${exp}\n• Supportive team & fast-track growth\n• Languages: ${langs}\n\nApply now — send your CV via DM. Limited slots, first come first served!`,
      ({ request, salary, exp }) =>
        `⭐ MEGA HIRING DRIVE — ${request.cityName} ⭐\n\nRole: ${request.roleName}\nOpenings: ${request.hiringCount}\nSalary: ${salary}\nEligibility: ${exp}\n\nSpot offers for shortlisted candidates. Comment "INTERESTED" with your city to get the interview details. Share this post — someone's job search ends today!`,
    ],
  },
  {
    channel: 'WHATSAPP',
    title: 'WhatsApp Message',
    builders: [
      ({ request, salary, exp, langs }) =>
        `Hi! We have an opening for *${request.roleName}* in *${request.cityName}* (${request.hiringCount} positions).\nSalary: ${salary}\nExperience: ${exp}\nLanguages: ${langs}\n\nIf interested, reply with your name, city, and CV. Quick process — joining soon.`,
      ({ request, salary, exp }) =>
        `Hello 👋\n\nQuick update — we're hiring *${request.hiringCount} ${request.roleName}* in *${request.cityName}*.\n\n✅ Salary: ${salary}\n✅ ${exp}\n✅ Fast interview process\n\nReply *YES* if you'd like the interview details, or share this with someone who's looking.`,
      ({ request, salary, exp, langs }) =>
        `*Job Opportunity — ${request.cityName}*\n\nRole: ${request.roleName}\nOpenings: ${request.hiringCount}\nSalary: ${salary}\nEligibility: ${exp}\nLanguages: ${langs}\n\nInterested? Send your CV here and we'll schedule a quick screening call today itself.`,
    ],
  },
  {
    channel: 'LINKEDIN',
    title: 'LinkedIn Post',
    builders: [
      ({ request, salary, exp, langs }) =>
        `We are hiring ${request.hiringCount} ${request.roleName} professionals in ${request.cityName}.\n\nRequirements: ${exp}; ${langs}; salary ${salary}.\n\nIf you or someone in your network is looking, please comment or send a connection note with CV. #Hiring #${request.cityName.replace(/\s/g, '')} #BPO`,
      ({ request, salary, exp, langs }) =>
        `🔎 Now Hiring: ${request.roleName} | ${request.cityName}\n\nWe're expanding our team with ${request.hiringCount} new positions.\n\nWhat you bring: ${exp}, ${langs}\nWhat we offer: ${salary}, structured training, and clear growth paths.\n\nInterested? Apply via DM or drop a comment below. Referrals appreciated!\n\n#Hiring #Jobs #${request.cityName.replace(/\s/g, '')} #Careers`,
      ({ request, salary, exp }) =>
        `Hiring announcement 📣\n\nOur ${request.cityName} team is growing — ${request.hiringCount} openings for ${request.roleName}.\n\nEligibility: ${exp}\nCompensation: ${salary}\n\nKnow someone who'd be a great fit? Tag them or share this post. DMs open for CVs.\n\n#NowHiring #${request.cityName.replace(/\s/g, '')} #JobOpening`,
    ],
  },
  {
    channel: 'CALLING_SCRIPT',
    title: 'Recruiter Calling Script',
    builders: [
      ({ request, salary, exp }) =>
        `Hi {{name}}, this is {{recruiter}} calling regarding a ${request.roleName} opportunity in ${request.cityName}.\nWe are hiring ${request.hiringCount} candidates, salary around ${salary}, ${exp}.\nAre you currently looking / open to night shift if required?\nIf yes, can we schedule a short screening today?`,
      ({ request, salary, exp }) =>
        `Hello {{name}}, {{recruiter}} here from the hiring team.\nI came across your profile for a ${request.roleName} role we're filling in ${request.cityName} — ${request.hiringCount} openings, salary in the range of ${salary}.\nEligibility is ${exp}. Does that match your current situation?\n(If yes) Great — I can book you a quick 10-minute screening call today or tomorrow. Which works better?`,
      ({ request, salary }) =>
        `Hi {{name}}, this is {{recruiter}}. Am I catching you at an okay time?\nWe're urgently hiring for ${request.roleName} in ${request.cityName} and your profile stood out.\nThe package is around ${salary} with immediate joining. Are you open to exploring this?\n(If interested) Perfect — I'll WhatsApp you the details and lock in an interview slot. What time suits you?`,
    ],
  },
  {
    channel: 'POSTER',
    title: 'Poster Text',
    builders: [
      ({ request, salary, exp }) =>
        `NOW HIRING\n${request.roleName}\n${request.cityName}\n${request.hiringCount} Openings\nSalary ${salary}\n${exp}\nApply Today`,
      ({ request, salary, exp }) =>
        `WE'RE HIRING!\n${request.hiringCount}x ${request.roleName}\n📍 ${request.cityName}\n💰 ${salary}\n🎓 ${exp}\nWalk in with your CV — Immediate joining`,
      ({ request, salary }) =>
        `JOB ALERT — ${request.cityName.toUpperCase()}\n${request.roleName}\n${request.hiringCount} positions | Salary ${salary}\nSpot offers for shortlisted candidates\nScan / Call to apply now`,
    ],
  },
  {
    channel: 'INTERVIEW_INVITE',
    title: 'Interview Invitation',
    builders: [
      ({ request }) =>
        `Dear {{name}},\n\nYou are invited for a screening interview for ${request.roleName} – ${request.cityName}.\nDate/Time: {{slot}}\nMode: {{mode}}\nPlease confirm attendance and keep your ID ready.\n\nRegards,\n{{recruiter}}`,
      ({ request }) =>
        `Hi {{name}},\n\nGood news — your profile has been shortlisted for the ${request.roleName} position (${request.cityName}).\n\n📅 Interview: {{slot}}\n📍 Mode: {{mode}}\n\nPlease reply "CONFIRMED" to lock your slot. Carry a govt ID and an updated CV.\n\nBest,\n{{recruiter}}`,
    ],
  },
  {
    channel: 'FOLLOW_UP',
    title: 'Follow-up Message',
    builders: [
      ({ request }) =>
        `Hi {{name}}, following up on the ${request.roleName} role in ${request.cityName}. Please share your availability for a quick call today, or reply YES if still interested.`,
      ({ request }) =>
        `Hi {{name}}, just checking in — the ${request.roleName} opening in ${request.cityName} is still available and slots are filling fast. Reply YES and I'll book your interview right away.`,
      ({ request }) =>
        `Hello {{name}}, we haven't heard back on the ${request.roleName} opportunity (${request.cityName}). If you're still interested, reply with a good time to call. If not, no worries — let us know and we'll keep you posted on future roles.`,
    ],
  },
];

export const templateContentGeneratorService: ContentGeneratorService = {
  async generate(request) {
    const salary =
      request.salaryMin && request.salaryMax
        ? `₹${request.salaryMin}–₹${request.salaryMax}`
        : request.salaryMax
          ? `₹${request.salaryMax}`
          : 'as per industry standards';
    const exp = request.experienceLabel || 'Freshers / relevant experience';
    const langs = (request.languages || ['English']).join(', ');
    const source = request.sourceName ? ` via ${request.sourceName}` : '';

    const ctx: TemplateContext = { request, salary, exp, langs, source };
    const variantCount = Math.min(Math.max(request.variantCount || 1, 1), MAX_VARIANTS);

    const pack: ContentPack = {
      provider: 'TEMPLATE',
      items: channelTemplates.map(({ channel, title, builders }) => {
        const picked = shuffle(builders).slice(0, Math.min(variantCount, builders.length));
        const variants = picked.map((build) => build(ctx));
        return { channel, title, body: variants[0], variants };
      }),
    };
    return pack;
  },
};
