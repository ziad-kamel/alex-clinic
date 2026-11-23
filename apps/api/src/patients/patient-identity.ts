export function normalizePatientPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0020') && digits.length === 14) {
    return `0${digits.slice(4)}`;
  }
  if (digits.startsWith('20') && digits.length === 12) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

export function normalizePatientName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\p{M}/gu, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/\u0629/g, '\u0647')
    .replace(/\s+/g, ' ');
}
