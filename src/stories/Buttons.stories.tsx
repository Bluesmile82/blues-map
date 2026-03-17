import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'UI Kit/Buttons',
  parameters: { layout: 'padded' },
}
export default meta

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-2xs text-accent tracking-widest uppercase font-semibold mb-4">{title}</h2>
      <div className="flex flex-wrap gap-3 items-center">{children}</div>
    </div>
  )
}

function ButtonsPage() {
  return (
    <div className="bg-bg min-h-screen p-8">
      <h1 className="text-2xl font-bold text-ink mb-2">Blues Map · Buttons</h1>
      <p className="text-sm text-ink3 mb-10">All button variants used across the app.</p>

      <Section title="Primary CTA">
        <button className="px-4 py-2 rounded-lg bg-primary hover:bg-primary2 transition-colors text-sm font-medium text-ink">
          Save Changes
        </button>
        <button className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary2 transition-colors text-xs font-medium text-ink">
          Small CTA
        </button>
        <button className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary2 transition-colors text-base font-semibold text-ink">
          Large CTA
        </button>
        <button disabled className="px-4 py-2 rounded-lg bg-primary/40 text-sm font-medium text-ink/40 cursor-not-allowed">
          Disabled
        </button>
      </Section>

      <Section title="Secondary / Default">
        <button className="px-4 py-2 rounded-lg border border-border text-ink3 text-sm font-medium hover:bg-bg-hover hover:border-border-hover hover:text-ink transition-all">
          Default
        </button>
        <button className="px-3 py-1.5 rounded-lg border border-border text-ink3 text-xs font-medium hover:bg-bg-hover hover:border-border-hover hover:text-ink transition-all">
          Small
        </button>
        <button disabled className="px-4 py-2 rounded-lg border border-border text-ink3/50 text-sm font-medium cursor-not-allowed opacity-50">
          Disabled
        </button>
      </Section>

      <Section title="Ghost">
        <button className="px-4 py-2 rounded-lg text-ink3 text-sm font-medium hover:bg-bg-hover hover:text-ink transition-all">
          Ghost
        </button>
        <button className="px-3 py-1.5 rounded-lg text-ink3 text-xs hover:bg-bg-hover hover:text-ink transition-colors">
          Small Ghost
        </button>
      </Section>

      <Section title="Accent (Active state)">
        <button className="px-4 py-2 rounded-lg bg-accent/20 border border-accent text-accent text-sm font-medium">
          Active Tab
        </button>
        <button className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold">
          Filled Accent
        </button>
        <button className="px-3 py-1.5 rounded-lg border border-accent/40 text-accent text-xs hover:bg-accent/10 transition-colors">
          Outline Accent
        </button>
      </Section>

      <Section title="Danger">
        <button className="px-4 py-2 rounded-lg bg-danger-bg border border-danger/30 text-danger text-sm font-medium hover:bg-danger/20 transition-colors">
          Delete
        </button>
        <button className="px-4 py-2 rounded-lg border border-border text-ink3 text-sm font-medium hover:bg-danger-bg hover:text-danger hover:border-danger/30 transition-all">
          Hover → Danger
        </button>
      </Section>

      <Section title="Icon Buttons">
        <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg-elevated border border-border text-ink3 hover:text-ink hover:border-border-hover hover:bg-bg-hover transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg-elevated border border-border text-ink3 hover:text-danger hover:border-danger/30 hover:bg-danger-bg transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-primary hover:bg-primary2 transition-colors text-ink">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
          </svg>
        </button>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
            <rect x="3" y="2" width="4" height="12" rx="1" />
            <rect x="9" y="2" width="4" height="12" rx="1" />
          </svg>
        </button>
      </Section>

      <Section title="With Icon + Label">
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary2 transition-colors text-sm font-medium text-ink">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add to list
        </button>
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-ink3 text-sm hover:bg-bg-hover hover:text-ink transition-all">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Favourite
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ink3 text-xs hover:bg-bg-hover hover:text-ink transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          Filters
        </button>
      </Section>

      <Section title="Tab / Segmented control">
        <div className="flex items-center bg-bg-elevated border border-border-subtle rounded-lg p-0.5 gap-0.5">
          {['Style', 'Instrument', 'Region'].map((tab, i) => (
            <button
              key={tab}
              className={`px-3 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-all ${
                i === 0 ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Close / Dismiss">
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-hover border border-border hover:bg-bg-deep hover:text-ink transition-all text-ink3 text-base">
          ✕
        </button>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-ink3 text-xs hover:text-ink hover:bg-bg-hover transition-all">
          ✕ Close
        </button>
      </Section>
    </div>
  )
}

export const All: StoryObj = {
  render: () => <ButtonsPage />,
}
