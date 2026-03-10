import musiciansData from '../data/musicians.json';

interface CreditsPageProps {
  onClose: () => void;
}

// Musicians whose photos are most likely still under copyright (died after 1954 or still living)
// grouped for display purposes only — each image should be individually verified.
const CONTACT_EMAIL = 'pursuance@gmail.com';

export default function CreditsPage({ onClose }: CreditsPageProps) {
  const musicians = musiciansData as Array<{ id: string; name: string; deathDate: string | null }>;

  return (
    <div className="fixed inset-0 z-[200] bg-[#0a0805] flex flex-col overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#2a1e0e]">
        <h1 className="text-lg font-bold text-white tracking-wide">Credits &amp; Legal</h1>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1a1208] border border-[#3a2a15] text-[#999] text-sm hover:text-white hover:border-accent transition-all"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-10 max-w-3xl mx-auto w-full">

        {/* Disclaimer */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">Disclaimer</h2>
          <div className="bg-[#111008] border border-[#2a1e0e] rounded-xl p-5 text-sm leading-relaxed text-[#ccc] space-y-3">
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
              please contact us and we will respond promptly.
            </p>
          </div>
        </section>

        {/* DMCA / Contact */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">DMCA &amp; Copyright Contact</h2>
          <div className="bg-[#111008] border border-[#2a1e0e] rounded-xl p-5 text-sm leading-relaxed text-[#ccc] space-y-3">
            <p>
              If you are a copyright holder and believe that any image or text on this site infringes your
              rights, please send a takedown notice to:
            </p>
            <p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-accent2 font-medium hover:text-accent3 underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>Please include in your message:</p>
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
          <div className="bg-[#111008] border border-[#2a1e0e] rounded-xl p-5 text-sm text-[#ccc] space-y-3">
            <p>
              Musician photographs are sourced from publicly available historical archives, Wikimedia Commons,
              and other online sources. Images of musicians who died before 1928 are believed to be in the
              public domain in the United States. For all other images, rights belong to the respective
              photographers, record labels, or estates.
            </p>
            <p>
              If you are the rights holder for any image below and wish it to be attributed, corrected,
              or removed, please contact{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent2 hover:text-accent3 underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>.
            </p>
          </div>

          <div className="mt-4 border border-[#2a1e0e] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#151009] border-b border-[#2a1e0e]">
                  <th className="text-left px-4 py-2.5 text-[#888] font-medium">Musician</th>
                  <th className="text-left px-4 py-2.5 text-[#888] font-medium hidden sm:table-cell">Image Status</th>
                </tr>
              </thead>
              <tbody>
                {musicians.map((m, i) => {
                  const deathYear = m.deathDate ? parseInt(m.deathDate.toString().slice(0, 4)) : null;
                  const isPublicDomain = deathYear !== null && deathYear < 1928;
                  const status = isPublicDomain
                    ? 'Public domain (US)'
                    : '© Respective rights holders';

                  return (
                    <tr
                      key={m.id}
                      className={[
                        'border-b border-[#1a1208] last:border-0',
                        i % 2 === 0 ? 'bg-[#0d0a06]' : 'bg-[#0a0805]',
                      ].join(' ')}
                    >
                      <td className="px-4 py-2 text-[#ddd]">{m.name}</td>
                      <td className="px-4 py-2 hidden sm:table-cell">
                        <span
                          className={[
                            'text-xs px-2 py-0.5 rounded-full',
                            isPublicDomain
                              ? 'bg-[#1a2a1a] text-[#6abf6a]'
                              : 'bg-[#1a1a2a] text-[#8888cc]',
                          ].join(' ')}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* YouTube */}
        <section>
          <h2 className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">Video Links</h2>
          <div className="bg-[#111008] border border-[#2a1e0e] rounded-xl p-5 text-sm text-[#ccc]">
            <p>
              This site links to YouTube videos but does not host any audio or video content. All videos
              are the property of their respective copyright holders and are embedded via the standard
              YouTube API under YouTube's Terms of Service.
            </p>
          </div>
        </section>

        <p className="text-center text-xs text-[#555] pb-4">
          Blues Map — Non-commercial educational project. For inquiries:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent2 hover:text-accent3">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
