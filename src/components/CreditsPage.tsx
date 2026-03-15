import { useState } from 'react';

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
        <h1 className="text-lg font-bold text-white tracking-wide">Credits &amp; Legal</h1>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-hover border border-border text-ink3 text-sm hover:text-white hover:border-accent transition-all"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-10 max-w-3xl mx-auto w-full">

        {/* Disclaimer */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">Disclaimer</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm leading-relaxed text-ink2 space-y-3">
            <p>
              <strong className="text-white">Blues Map</strong> is a non-commercial, educational fan project
              dedicated to documenting the history, geography, and influence networks of blues musicians.
            </p>
            <p>
              No revenue is generated from this website. All content is provided for informational and
              educational purposes only. Musician names, biographical facts (birth/death dates and locations),
              and influence relationships are factual data not protected by copyright.
            </p>
            <p>
              Written descriptions and musician photographs are used in good faith for educational purposes.
              If you are a rights holder and believe your content is used without proper authorization,
              please use the contact form below and we will respond promptly.
            </p>
          </div>
        </section>

        {/* Contact Form */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">Contact Us</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm text-ink2">
            <p className="mb-4">
              Have questions, suggestions, or copyright concerns? Please fill out the form below and we'll get back to you.
            </p>

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-xs font-medium text-ink3 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-border-subtle rounded-lg text-white text-sm focus:outline-none focus:border-accent transition-colors"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-xs font-medium text-ink3 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-border-subtle rounded-lg text-white text-sm focus:outline-none focus:border-accent transition-colors"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-xs font-medium text-ink3 mb-1">
                  Message *
                </label>
                <textarea
                  id="message"
                  required
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-bg border border-border-subtle rounded-lg text-white text-sm focus:outline-none focus:border-accent transition-colors resize-none"
                  placeholder="Describe your inquiry, copyright concern, or suggestion..."
                />
              </div>

              {submitStatus === 'success' && (
                <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-green-300 text-xs">
                  ✓ Message sent successfully! We'll get back to you soon.
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-xs">
                  ✕ Failed to send message. Please try again later.
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 bg-accent text-bg font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </section>

        {/* DMCA / Copyright */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">Copyright Inquiries</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm leading-relaxed text-ink2 space-y-3">
            <p>
              If you are a copyright holder and believe that any image or text on this site infringes your
              rights, please use the contact form above. Include in your message:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Identification of the copyrighted work claimed to be infringed</li>
              <li>The specific URL or musician name where the content appears</li>
              <li>Your contact information</li>
              <li>A statement that you are the rights holder or authorized to act on their behalf</li>
            </ul>
            <p>We will remove or replace the content as quickly as possible upon receiving a valid notice.</p>
          </div>
        </section>

        {/* Image Credits */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">Image Credits</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm text-ink2 space-y-3">
            <p>
              Musician photographs are sourced from publicly available historical archives, Wikimedia Commons,
              and other online sources. Images of musicians who died before 1928 are believed to be in the
              public domain in the United States. For all other images, rights belong to the respective
              photographers, record labels, or estates.
            </p>
            <p>
              If you are the rights holder for any image and wish it to be attributed, corrected,
              or removed, please use the contact form above.
            </p>
          </div>
        </section>

        {/* YouTube */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">Video Links</h2>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5 text-sm text-ink2">
            <p>
              This site links to YouTube videos but does not host any audio or video content. All videos
              are the property of their respective copyright holders and are embedded via the standard
              YouTube API under YouTube's Terms of Service.
            </p>
          </div>
        </section>

        <p className="text-center text-xs text-ink3 pb-4">
          Blues Map — Non-commercial educational project.
        </p>
      </div>
    </div>
  );
}
