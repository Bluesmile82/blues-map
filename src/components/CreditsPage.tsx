import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CreditsPageProps {
  onClose: () => void;
}

interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

export default function CreditsPage({ onClose }: CreditsPageProps) {
  const [formData, setFormData] = useState<ContactFormData>({ name: '', email: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { t } = useTranslation();

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSubmitStatus('success');
        setFormData({ name: '', email: '', message: '' });
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-bg flex flex-col overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <h1 className="text-lg font-bold text-ink tracking-wide">{t('credits.title')}</h1>
        <button
          onClick={onClose}
          aria-label={t('credits.close')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-hover border border-border text-ink3 text-sm hover:text-ink hover:border-accent transition-all"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-10 max-w-3xl mx-auto w-full">

        {/* Disclaimer */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">{t('credits.disclaimer')}</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm leading-relaxed text-ink2 space-y-3">
            <p dangerouslySetInnerHTML={{ __html: t('credits.disclaimerText1') }} />
            <p>{t('credits.disclaimerText2')}</p>
            <p>{t('credits.disclaimerText3')}</p>
          </div>
        </section>

        {/* Contact Form */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">{t('credits.contactUs')}</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm text-ink2">
            <p className="mb-4">
              {t('credits.contactPrompt')}
            </p>

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-xs font-medium text-ink3 mb-1">
                  {t('credits.nameLabel')}
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                  placeholder={t('credits.namePlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-xs font-medium text-ink3 mb-1">
                  {t('credits.emailLabel')}
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                  placeholder={t('credits.emailPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-xs font-medium text-ink3 mb-1">
                  {t('credits.messageLabel')}
                </label>
                <textarea
                  id="message"
                  required
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-bg border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent transition-colors resize-none"
                  placeholder={t('credits.messagePlaceholder')}
                />
              </div>

              {submitStatus === 'success' && (
                <div className="p-3 bg-success-bg border border-success/50 rounded-lg text-success text-xs">
                  ✓ {t('credits.messageSent')}
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="p-3 bg-danger-bg border border-danger/50 rounded-lg text-danger text-xs">
                  ✕ {t('credits.messageFailed')}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 bg-accent text-bg font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isSubmitting ? t('credits.sending') : t('credits.sendMessage')}
              </button>
            </form>
          </div>
        </section>

        {/* DMCA / Copyright */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">{t('credits.copyrightInquiries')}</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm leading-relaxed text-ink2 space-y-3">
            <p>{t('credits.copyrightText')}</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>{t('credits.copyrightItem1')}</li>
              <li>{t('credits.copyrightItem2')}</li>
              <li>{t('credits.copyrightItem3')}</li>
              <li>{t('credits.copyrightItem4')}</li>
            </ul>
            <p>{t('credits.copyrightResponse')}</p>
          </div>
        </section>

        {/* Image Credits */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">{t('credits.imageCredits')}</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm text-ink2 space-y-3">
            <p>{t('credits.imageCreditsText1')}</p>
            <p>{t('credits.imageCreditsText2')}</p>
          </div>
        </section>

        {/* YouTube */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">{t('credits.videoLinks')}</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm text-ink2">
            <p>{t('credits.videoLinksText')}</p>
          </div>
        </section>

        <p className="text-center text-xs text-ink3 pb-4">
          {t('credits.footer')}
          {' '}{t('credits.footerAuthor')}{" "}
          <a href="https://github.com/bluesmile82" className="text-accent underline">GitHub</a>
        </p>
      </div>
    </div>
  );
}
