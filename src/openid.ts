const tokenPattern = /^[a-f0-9]{32}$/i;

export const extractOpenId = (input: string, allowRaw = true): string | undefined => {
  const text = input.trim();
  if (allowRaw && tokenPattern.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.hostname !== 'v18.teachermate.cn' ||
        url.username || url.password || url.port) return;
    const values = [...url.searchParams.entries()]
      .filter(([key]) => key.toLowerCase() === 'openid')
      .map(([, value]) => value);
    if (values.length === 1 && tokenPattern.test(values[0])) return values[0];
  } catch {
    // Pasted contents need not be a URL.
  }
  return undefined;
};
