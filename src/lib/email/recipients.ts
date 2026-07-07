interface InterviewRecipientInput {
  intervieweeEmail?: string | null;
  publicistEmail?: string | null;
  clientEmail?: string | null;
}

export interface InterviewEmailRecipients {
  recipient: string | null;
  cc: string[];
  ccDisplay: string | null;
}

function cleanEmail(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sameEmail(a?: string | null, b?: string | null): boolean {
  const cleanA = cleanEmail(a);
  const cleanB = cleanEmail(b);
  return Boolean(cleanA && cleanB && cleanA.toLowerCase() === cleanB.toLowerCase());
}

function addUniqueEmail(list: string[], email?: string | null) {
  const cleaned = cleanEmail(email);
  if (!cleaned) return;
  if (list.some((existing) => sameEmail(existing, cleaned))) return;
  list.push(cleaned);
}

export function buildInterviewEmailRecipients(
  interview: InterviewRecipientInput
): InterviewEmailRecipients {
  const recipient =
    cleanEmail(interview.intervieweeEmail) || cleanEmail(interview.publicistEmail);
  const cc: string[] = [];

  if (
    interview.intervieweeEmail &&
    interview.publicistEmail &&
    !sameEmail(interview.publicistEmail, interview.intervieweeEmail)
  ) {
    addUniqueEmail(cc, interview.publicistEmail);
  }

  if (interview.clientEmail && !sameEmail(interview.clientEmail, recipient)) {
    addUniqueEmail(cc, interview.clientEmail);
  }

  return {
    recipient,
    cc,
    ccDisplay: cc.length > 0 ? cc.join(", ") : null,
  };
}
