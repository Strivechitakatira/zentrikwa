export const metadata = {
  title: 'Privacy Policy — Conva',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: March 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-7 text-gray-700">
        <p>
          Conva (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is a WhatsApp Business AI
          platform operated by Zentrik Solutions. This Privacy Policy explains how we collect, use,
          and protect information when you use our service at{' '}
          <strong>ai.thegranite.co.zw</strong>.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">1. Information We Collect</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>Account information:</strong> name, email address, and password when you sign
            up.
          </li>
          <li>
            <strong>WhatsApp Business credentials:</strong> phone number ID, WhatsApp Business
            Account ID, and access tokens (encrypted at rest with AES-256).
          </li>
          <li>
            <strong>Message data:</strong> WhatsApp messages sent to and from your connected
            business number, stored to power AI responses and conversation history.
          </li>
          <li>
            <strong>Usage data:</strong> feature usage, session activity, and error logs used to
            improve the platform.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">2. How We Use Your Information</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>To provide and operate the Conva platform.</li>
          <li>To generate AI-powered responses to your customers via WhatsApp.</li>
          <li>To send transactional emails (account verification, password reset).</li>
          <li>To improve platform performance and fix issues.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">3. Data Sharing</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          We do not sell your data. We share data only with:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>Meta (Facebook):</strong> to send and receive WhatsApp messages via the
            WhatsApp Cloud API.
          </li>
          <li>
            <strong>Anthropic:</strong> message content is processed by Claude AI to generate
            responses.
          </li>
          <li>
            <strong>Supabase:</strong> database and authentication infrastructure.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">4. Data Retention</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          Conversation data is retained for as long as your account is active. You may request
          deletion of your data at any time by contacting us.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">5. Security</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          All data is transmitted over HTTPS. WhatsApp access tokens are encrypted using AES-256-GCM
          before storage. We follow industry best practices for securing tenant data.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">6. Your Rights</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          You may access, correct, or delete your personal data at any time. To exercise these
          rights, contact us at{' '}
          <a href="mailto:zentriksolutions@gmail.com" className="text-indigo-600 hover:underline">
            zentriksolutions@gmail.com
          </a>
          .
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">7. Contact</h2>
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
