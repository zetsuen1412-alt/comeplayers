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

const privateField = /^\s*[^a-z0-9]*(?:id|user(?:name)?|login|pass(?:word)?|pwd|email|e-mail|otp|pin|token|secret|2fa|auth(?:enticator)?)\s*(?:[:=]|$)/i;
const inlineSecret = /\b(?:id|user(?:name)?|login|pass(?:word)?|pwd|email|e-mail|otp|pin|token|secret|2fa)\s*[:=].*$/gi;

export function manualFH3Reference(raw: string): string | null {
  return /^\s*(X\d{2,12})\s*$/i.exec(raw.split(/\r?\n/).find(line => line.trim()) ?? "")?.[1].toUpperCase() ?? null;
}

export function parseFH3Cancellation(raw: string): string | null {
  return /^\s*\/fh3_cancel(?:@[a-z0-9_]+)?\s+(X\d{2,12})\s*$/i.exec(raw)?.[1].toUpperCase() ?? null;
}

function trimClean(value: string, max: number) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim().slice(0, max);
}

export function parseFH3ManualOrder(raw: string): FH3ManualOrder | null {
  if (!raw || raw.length > 8192) return null;
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const orderRef = manualFH3Reference(raw);
  if (!orderRef) return null;

  // A TASK label is mandatory. Unlabelled photos and proof screenshots
  // must not become order cards or override any existing instruction.
  const taskLine = lines.findIndex(line => /^\s*(?:task|tugas)\s*:/i.test(line));
  if (taskLine < 0) return null;
  const label = /^\s*(?:task|tugas)\s*:\s*/i;
  const taskParts: string[] = [];
  let credentialContinuation = false;
  for (const line of [lines[taskLine].replace(label, ""), ...lines.slice(taskLine + 1)]) {
    if (privateField.test(line)) {
      credentialContinuation = /[:=]\s*$/.test(line) || !/[:=]/.test(line);
      continue;
    }
    if (credentialContinuation && line.trim()) { credentialContinuation = false; continue; }
    taskParts.push(line.replace(inlineSecret, "[credential hidden]"));
  }
  const task = trimClean(taskParts.join("\n"), 400);
  if (!task) return null;

  function field(pattern: RegExp, max: number): string {
    const line = lines.slice(0, taskLine).find(entry => pattern.test(entry));
    return trimClean((line?.replace(pattern, "") ?? "").replace(inlineSecret, "[credential hidden]"), max);
  }

  return {
    orderRef,
    game: field(/^\s*game\s*[:=]\s*/i, 150),
    serverName: field(/^\s*server\s*[:=\-]?\s*/i, 150),
    duration: field(/^\s*duration\s*[:=\-]?\s*/i, 80),
    task,
  };
}
