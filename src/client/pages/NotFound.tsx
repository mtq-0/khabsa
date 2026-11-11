import { Link } from 'react-router';
import { Button } from '../components/ui.tsx';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="font-display text-8xl text-gradient">404</p>
      <h1 className="mt-2 font-display text-3xl">ضعنا بالخبصة!</h1>
      <p className="mt-2 text-ink-300">هالصفحة مش موجودة. يمكن الرابط غلط أو انشال.</p>
      <Link to="/">
        <Button className="mt-6">ارجع للرئيسية</Button>
      </Link>
    </div>
  );
}
