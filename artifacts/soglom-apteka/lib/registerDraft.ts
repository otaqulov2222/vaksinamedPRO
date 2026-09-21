/** Ro‘yxat jarayoni uchun vaqtinchalik draft (parol URL da bo‘lmasin) */
let draft: { phone: string; firstName: string; password: string } | null = null;

export function setRegisterDraft(next: { phone: string; firstName: string; password: string }) {
  draft = next;
}

export function peekRegisterDraft() {
  return draft;
}

export function clearRegisterDraft() {
  draft = null;
}

export function takeRegisterDraft() {
  const value = draft;
  draft = null;
  return value;
}
