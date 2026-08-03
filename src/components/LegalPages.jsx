import { Link } from 'react-router-dom';

// Legally required: emails are collected from the public, and AdSense will not
// approve a site without a reachable policy. Voice rules apply in full here --
// this is about what a person is agreeing to, so it stays literal. Selecta-bot
// does not narrate someone's data rights.

// One place to change the address. It MUST route to a real inbox: a contact
// route in a privacy policy that bounces is worse than none.
const CONTACT = 'foxdogdevelopment@gmail.com';

// Kept in the exported constant so P3's retention cron and this page cannot
// drift apart silently -- the acceptance criterion is that the wording matches
// the implemented rule.
export const RETENTION_MONTHS = 6;
export const LEGACY_RETENTION_MONTHS = 12;

function Page({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-selecta-cream px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-lg bg-selecta-paper p-6 shadow-selecta sm:p-10">
        <Link
          to="/"
          className="text-sm text-selecta-teal underline hover:text-selecta-teal-dark"
        >
          ← Back to Room Selector 5000
        </Link>
        <h1 className="font-display mt-4 text-3xl font-bold text-selecta-ink">
          {title}
        </h1>
        <p className="mt-1 text-sm text-selecta-ink/60">Last updated {updated}</p>
        <div className="legal mt-6 space-y-5 text-selecta-ink/90">{children}</div>
      </div>
    </div>
  );
}

function H2({ children }) {
  return (
    <h2 className="font-display pt-2 text-xl font-bold text-selecta-ink">
      {children}
    </h2>
  );
}

export function PrivacyPolicy() {
  return (
    <Page title="Privacy Policy" updated="August 3, 2026">
      <p>
        Room Selector 5000 helps a group divide up beds and decide what each
        person pays. Running that fairly requires collecting a small amount of
        information. This page says exactly what, why, and for how long.
      </p>

      <H2>What we collect</H2>
      <p>From someone joining a trip:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Your email address.</strong> We send you a sign-in link to
          confirm the address belongs to you. This is what stops one person from
          submitting several times, or submitting as someone else.
        </li>
        <li>
          <strong>Your bed rankings and price adjustments</strong> — the beds you
          said you would accept, in order, and the amounts you nudged prices up
          or down.
        </li>
        <li>
          <strong>A partner&apos;s email address,</strong> if you declare that you
          are sharing a bed. That person has to declare you back before the two
          of you are treated as one party.
        </li>
      </ul>
      <p>From the person creating a trip: the trip name, the total cost, the
        list of beds, and anything typed into a bed description. If a listing
        document is uploaded to pre-fill that form, its contents are sent to
        Anthropic&apos;s API to extract the bed list and are not stored by us
        afterwards.</p>

      <H2>What we do with it</H2>
      <p>
        We use it to run the allocation and to email you your own result — which
        bed you were assigned and the exact amount you pay. That results email is
        the only message we send you that you did not ask for by clicking a
        sign-in link.
      </p>
      <p>
        <strong>We do not sell your information, and we do not add you to any
        marketing list.</strong> Email addresses are passed to our delivery
        provider only to send that one message. They are never synced into a
        contact database.
      </p>

      <H2>Who else sees it</H2>
      <p>
        Other people on your trip see the results: who got which bed and at what
        price. That is the point of the product — the allocation is only
        defensible if everyone can check it. They do not see your rankings or
        your price adjustments.
      </p>
      <p>
        We use Google Firebase for hosting, storage, and sign-in; Brevo to send
        email; and Anthropic&apos;s API for the optional listing-import feature.
      </p>

      <H2>How long we keep it</H2>
      <p>
        <strong>Trip data is deleted {RETENTION_MONTHS} months after the trip
        ends.</strong> That means the trip, its beds, every submission, the
        assignments, and the access codes. For older trips that never recorded an
        end date, we delete {LEGACY_RETENTION_MONTHS} months after the trip was
        created.
      </p>

      <H2>Advertising</H2>
      <p>
        This site may show ads from Google AdSense, which can use cookies to
        select what you see. Ads appear only at navigation points — after you
        create a trip, or after you join one. There are no ads on the pages where
        you rank beds, adjust prices, or read your result. Nothing goes between a
        person and the number they pay.
      </p>

      <H2>Your choices</H2>
      <p>
        You can ask us to delete your submission, or the whole trip if you
        organized it, before the retention window runs out. Write to{' '}
        <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>. Ask the
        organizer to remove you and they can do that too.
      </p>

      <H2>Contact</H2>
      <p>
        <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
        <br />
        Fox Dog Software Development, LLC
      </p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Use" updated="August 3, 2026">
      <p>
        Plain version: this is a free tool for splitting beds among people who
        already trust each other. Use it in good faith and it will do its job.
      </p>

      <H2>What the service does</H2>
      <p>
        One person lists the beds and the total cost. Everyone else ranks the
        beds they would accept and nudges prices. We then assign beds and set
        prices so that <strong>nobody prefers anyone else&apos;s bed at its
        price</strong>, judged by the numbers people actually submitted.
      </p>
      <p>
        That property is what we promise, and it is all we promise. It is a
        statement about the submitted numbers — not a claim that the outcome will
        feel fair to everyone, or that the numbers people submitted reflect what
        they truly wanted. If someone shades their bids, the result is still
        envy-free over what was submitted, which may not be what they meant.
      </p>

      <H2>Money</H2>
      <p>
        <strong>We never handle your money.</strong> We calculate what each person
        owes. Collecting it is between you and your group. We are not a party to
        that, and we cannot help recover it.
      </p>

      <H2>Access codes</H2>
      <p>
        Trip codes are the only thing protecting a trip. Anyone with the
        participant code can see the beds and submit; anyone with the admin code
        can run the allocation. Share them the way you would share a door code.
        We cannot tell whether someone using a code should have it.
      </p>

      <H2>Acceptable use</H2>
      <p>
        Do not submit on someone else&apos;s behalf, attempt to overwhelm the
        service, or use it to collect email addresses. We may remove trips or
        block access if we see this.
      </p>

      <H2>No warranty</H2>
      <p>
        The service is provided as is, without warranty of any kind. We do not
        guarantee it will be available, or that a trip&apos;s data will survive a
        failure. To the extent the law allows, Fox Dog Software Development, LLC
        is not liable for any loss arising from using it. Given that we handle no
        money and charge nothing, our liability is limited to nothing.
      </p>

      <H2>Changes</H2>
      <p>
        We may update these terms. The date at the top says when they last
        changed. Continuing to use the service means the current version applies.
      </p>

      <H2>Contact</H2>
      <p>
        <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
        <br />
        Fox Dog Software Development, LLC
      </p>
    </Page>
  );
}
