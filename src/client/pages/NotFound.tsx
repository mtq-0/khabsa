import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="font-display text-8xl text-gradient">404</p>
      <h1 className="mt-2 font-display text-3xl">ضعنا بالخبصة!</h1>
      <p className="mt-2 text-ink-300">هالصفحة مش موجودة. يمكن الرابط غلط أو انشال.</p>
      <Link to="/" className="mt-6 inline-flex h-11 min-h-10 items-center justify-center rounded-xl bg-gradient-to-l from-brand-500 to-brand-700 px-5 font-semibold text-[#fff] shadow-glow hover:brightness-110">
        ارجع للرئيسية
      </Link>
    </div>
  );
}
