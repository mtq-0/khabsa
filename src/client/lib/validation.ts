/**
 * Arabic text for the browser's built-in form validation bubbles (otherwise they show in the
 * browser's own language, e.g. English "Please fill out this field."). Installed once for the
 * whole app: every `required` / `minLength` / `type="email"` / `pattern` input gets an Arabic message.
 */
function messageFor(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const v = el.validity;
  if (v.valueMissing) {
    if (el.type === 'password') return 'اكتب كلمة السر';
    if (el.type === 'email') return 'اكتب الإيميل';
    if (el.id === 'nick' || el.id === 'dn') return 'اكتب اسمك (حرفين على الأقل)';
    return 'عبّي هالخانة أول';
  }
  if (v.typeMismatch) return el.type === 'email' ? 'اكتب إيميل صحيح مثل name@example.com' : 'القيمة مش صحيحة';
  if (v.tooShort) return `لازم ${'minLength' in el ? el.minLength : 2} أحرف على الأقل`;
  if (v.tooLong) return 'النص طويل كتير';
  if (v.patternMismatch) return el.title || 'الصيغة مش صحيحة';
  return 'القيمة مش صحيحة';
}

export function installArabicValidation() {
  // `invalid` does not bubble, so listen in the capture phase
  document.addEventListener(
    'invalid',
    (e) => {
      const el = e.target as HTMLInputElement;
      el.setCustomValidity('');
      el.setCustomValidity(messageFor(el));
    },
    true,
  );
  // clear the custom message as soon as the player edits the field, so validity is re-evaluated
  const clear = (e: Event) => (e.target as HTMLInputElement).setCustomValidity?.('');
  document.addEventListener('input', clear, true);
  document.addEventListener('change', clear, true);
}
