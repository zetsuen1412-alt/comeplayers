/**
 * Parse admin-written FH3 order messages (plain text or Telegram photo captions).
 * Only operational fields are retained; never copy credential lines or photos.
 */
export type FH3ManualOrder = {
  orderRef: string;
  game: string;
  serverName: string;
  duration: string;
  task: string;
};

const privateField = /^\s*(?:id|user(?:name)?|login|pass(?:word)?|pwd|email|e-mail|otp|pin|token|secret|2fa|auth(?:enticator)?)\s*[:=]/i;
const inlineSecret = /\b(?:user(?:name)?|login|pass(?:word)?|pwd|email|e-mail|otp|pin|token|secret|2fa)\s*[:=]\s*\S+/gi;

function trimClean(value: string, max: number) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim().slice(0, max);
}

export function parseFH3ManualOrder(raw: string): FH3ManualOrder | null {
  if (!raw || raw.length > 8192) return null;
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.find(line => line.trim()) ?? "";
  const match = /^\s*(X\d{2,12})(?!\d)\b/i.exec(first);
  if (!match) return null;

  // A TASK label is mandatory. Unlabelled photos and proof screenshots
  // must not become order cards or override any existing instruction.
  const taskLine = lines.findIndex(line => /^\s*(?:task|tugas)\s*:/i.test(line));
  if (taskLine < 0) return null;
  const label = /^\s*(?:task|tugas)\s*:\s*/i;
  const taskParts = [lines[taskLine].replace(label, ""), ...lines.slice(taskLine + 1)]
    .filter(line => !privateField.test(line))
    .map(line => line.replace(inlineSecret, "[credential hidden]"));
  const task = trimClean(taskParts.join("\n"), 400);
  if (!task) return null;

  function field(pattern: RegExp, max: number): string {
    const line = lines.slice(0, taskLine).find(entry => pattern.test(entry));
    return trimClean(line?.replace(pattern, "") ?? "", max).replace(inlineSecret, "[credential hidden]");
  }

  return {
    orderRef: match[1].toUpperCase(),
    game: field(/^\s*game\s*[:=]\s*/i, 150),
    serverName: field(/^\s*server\s*[:=\-]?\s*/i, 150),
    duration: field(/^\s*duration\s*[:=\-]?\s*/i, 80),
    task,
  };
}
