export const metadata = {
  title: 'Terms of Service — Conva',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: March 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-7 text-gray-700">
        <p>
          By accessing or using Conva (&ldquo;the Service&rdquo;) at{' '}
          <strong>ai.thegranite.co.zw</strong>, operated by Zentrik Solutions, you agree to be
          bound by these Terms of Service. If you do not agree, do not use the Service.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">1. Description of Service</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          Conva is a multi-tenant SaaS platform that connects WhatsApp Business accounts to an
          AI-powered messaging assistant. The Service allows businesses to automate customer
          conversations via the Meta WhatsApp Cloud API.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">2. Eligibility</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          You must be at least 18 years old and have a valid WhatsApp Business Account to use this
          Service. By registering, you represent that all information you provide is accurate.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">3. Acceptable Use</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">You agree not to:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>Use the Service to send spam, unsolicited messages, or illegal content.</li>
          <li>Violate Meta&apos;s WhatsApp Business Policy or Commerce Policy.</li>
          <li>Attempt to reverse engineer, hack, or disrupt the platform.</li>
          <li>Impersonate another business or individual.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">4. WhatsApp & Meta Compliance</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          You are solely responsible for ensuring your use of WhatsApp through Conva complies with
          Meta&apos;s terms, policies, and applicable law. Zentrik Solutions is not liable for any
          suspension or termination of your WhatsApp Business Account by Meta.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">5. Subscription & Billing</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          Access to the Service may require a paid subscription. Fees are billed in advance.
          Refunds are handled on a case-by-case basis. We reserve the right to change pricing with
          30 days&apos; notice.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">6. Data & Privacy</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          Your use of the Service is also governed by our{' '}
          <a href="/privacy" className="text-indigo-600 hover:underline">
            Privacy Policy
          </a>
          , which is incorporated into these Terms.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">7. Limitation of Liability</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          To the maximum extent permitted by law, Zentrik Solutions shall not be liable for any
          indirect, incidental, or consequential damages arising from your use of the Service,
          including loss of data or business interruption.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">8. Termination</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          We reserve the right to suspend or terminate your account at any time for violation of
          these Terms. You may cancel your account at any time from your dashboard settings.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">9. Governing Law</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          These Terms are governed by the laws of Zimbabwe. Any disputes shall be resolved in the
          courts of Harare, Zimbabwe.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">10. Contact</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          Zentrik Solutions · Harare, Zimbabwe ·{' '}
          <a href="mailto:zentriksolutions@gmail.com" className="text-indigo-600 hover:underline">
            zentriksolutions@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
