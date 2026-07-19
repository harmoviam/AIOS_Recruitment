import type { ContentGeneratorService } from '../ports.js';
import type { ContentPack } from '../../../types/sourcing.js';

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

    const pack: ContentPack = {
      provider: 'TEMPLATE',
      items: [
        {
          channel: 'FACEBOOK',
          title: 'Facebook Post',
          body: `🚀 Hiring Alert${source}!\n\nWe are hiring ${request.hiringCount} ${request.roleName} for ${request.cityName}.\n\n✔ ${exp}\n✔ Salary: ${salary}\n✔ Shift: ${request.shift || 'Rotational / Night (as applicable)'}\n✔ Languages: ${langs}\n\nInterested? Comment "INTERESTED" or DM your updated CV + location.\nImmediate joiners preferred.`,
        },
        {
          channel: 'WHATSAPP',
          title: 'WhatsApp Message',
          body: `Hi! We have an opening for *${request.roleName}* in *${request.cityName}* (${request.hiringCount} positions).\nSalary: ${salary}\nExperience: ${exp}\nLanguages: ${langs}\n\nIf interested, reply with your name, city, and CV. Quick process — joining soon.`,
        },
        {
          channel: 'LINKEDIN',
          title: 'LinkedIn Post',
          body: `We are hiring ${request.hiringCount} ${request.roleName} professionals in ${request.cityName}.\n\nRequirements: ${exp}; ${langs}; salary ${salary}.\n\nIf you or someone in your network is looking, please comment or send a connection note with CV. #Hiring #${request.cityName.replace(/\s/g, '')} #BPO`,
        },
        {
          channel: 'CALLING_SCRIPT',
          title: 'Recruiter Calling Script',
          body: `Hi {{name}}, this is {{recruiter}} calling regarding a ${request.roleName} opportunity in ${request.cityName}.\nWe are hiring ${request.hiringCount} candidates, salary around ${salary}, ${exp}.\nAre you currently looking / open to night shift if required?\nIf yes, can we schedule a short screening today?`,
        },
        {
          channel: 'POSTER',
          title: 'Poster Text',
          body: `NOW HIRING\n${request.roleName}\n${request.cityName}\n${request.hiringCount} Openings\nSalary ${salary}\n${exp}\nApply Today`,
        },
        {
          channel: 'INTERVIEW_INVITE',
          title: 'Interview Invitation',
          body: `Dear {{name}},\n\nYou are invited for a screening interview for ${request.roleName} – ${request.cityName}.\nDate/Time: {{slot}}\nMode: {{mode}}\nPlease confirm attendance and keep your ID ready.\n\nRegards,\n{{recruiter}}`,
        },
        {
          channel: 'FOLLOW_UP',
          title: 'Follow-up Message',
          body: `Hi {{name}}, following up on the ${request.roleName} role in ${request.cityName}. Please share your availability for a quick call today, or reply YES if still interested.`,
        },
      ],
    };
    return pack;
  },
};
