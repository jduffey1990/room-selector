import { Link } from 'react-router-dom';

// AdSense will not approve a site whose privacy policy is not reachable from
// every page, and the policy is legally required regardless because emails are
// collected from the public. Rendered outside <Routes> so it is on all of them.
export default function Footer() {
  return (
    <footer className="border-t border-selecta-ink/10 bg-selecta-cream px-4 py-6 text-center">
      <p className="text-sm text-selecta-ink/70">
        <Link to="/privacy" className="underline hover:text-selecta-ink">
          Privacy
        </Link>
        <span className="mx-2" aria-hidden="true">·</span>
        <Link to="/terms" className="underline hover:text-selecta-ink">
          Terms
        </Link>
      </p>
      <p className="mt-2 text-xs text-selecta-ink/50">
        Room Selector 5000 — Fox Dog Software Development, LLC
      </p>
    </footer>
  );
}
