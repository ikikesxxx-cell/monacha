/** Subject and preservation constraints precede style so short encoders retain them. */
export function portraitPrompt({ subject, change = "", editing = false, hasReference = false, learning = "" }: {
  subject: string; change?: string; editing?: boolean; hasReference?: boolean; learning?: string;
}) {
  const intent = editing
    ? `Edit the supplied photograph: ${change}. Preserve the same identity, facial structure, skin tone, age, pose, clothes, lighting and background except where the requested change requires it.`
    : hasReference
      ? `Create an original portrait inspired by the supplied reference. Subject: ${subject}. Preserve the described identity, skin tone, age and distinctive features.`
      : `Documentary portrait photograph. Subject: ${subject}. Follow the described skin tone, ethnicity, age, hair, eyes, expression and setting exactly.`;
  return [
    intent,
    "Real camera photograph, believable anatomy, coherent eyes and hands, precise focus on the subject, natural depth of field. Keep the requested lighting and location; if unspecified use soft window light, gentle shadows and true-to-life colors.",
    "Age-appropriate natural skin texture, subtle pores and facial asymmetry, fine stray hairs, restrained sensor grain. Preserve distinctive freckles or scars when described, do not add exaggerated blemishes, aging or identical imperfections to every face.",
    "No beauty filter, airbrushing, waxy or plastic skin, CGI, doll face, oversharpened edges, artificial glow, text or watermark.",
    editing ? "" : learning,
  ].filter(Boolean).join(" ");
}

export function environmentPrompt(location: string) {
  return `Wide documentary photograph of ${location}. Preserve the story's architecture, geography, weather and time of day; do not replace a fictional world with a generic Earth street. Eye-level composition, coherent perspective, physically plausible ambient lighting, detailed materials, natural depth and restrained film grain. No prominent people, text, watermark, borders or interface. Avoid artificial glow, CGI smoothness and oversaturated colors.`;
}