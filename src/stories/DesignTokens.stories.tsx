import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'UI Kit/Design Tokens',
  parameters: { layout: 'padded' },
}
export default meta

type Swatch = { name: string; var: string; label?: string }

const backgrounds: Swatch[] = [
  { name: 'bg', var: '--color-bg', label: 'Deepest background' },
  { name: 'bg2 / bg-subtle', var: '--color-bg2', label: 'Panel backgrounds' },
  { name: 'bg3 / bg-elevated', var: '--color-bg3', label: 'Chips, elevated surfaces' },
  { name: 'bg-hover', var: '--color-bg-hover', label: 'Hover / active backgrounds' },
  { name: 'bg-deep', var: '--color-bg-deep', label: 'Deep hover (close buttons)' },
]

const borders: Swatch[] = [
  { name: 'border-subtle', var: '--color-border-subtle', label: 'Subtle dividers' },
  { name: 'border', var: '--color-border', label: 'Standard border' },
  { name: 'border-hover', var: '--color-border-hover', label: 'Hover border' },
]

const text: Swatch[] = [
  { name: 'ink', var: '--color-ink', label: 'Primary text' },
  { name: 'ink2', var: '--color-ink2', label: 'Secondary text' },
  { name: 'ink3', var: '--color-ink3', label: 'Muted / metadata' },
  { name: 'ink-warm', var: '--color-ink-warm', label: 'Warm hover text' },
]

const accent: Swatch[] = [
  { name: 'accent', var: '--color-accent', label: 'Active state, links' },
  { name: 'accent2', var: '--color-accent2', label: 'Accent hover' },
  { name: 'accent3', var: '--color-accent3', label: 'Accent active' },
]

const primary: Swatch[] = [
  { name: 'primary', var: '--color-primary', label: 'CTA button' },
  { name: 'primary2', var: '--color-primary2', label: 'CTA hover' },
]

function SwatchRow({ swatches, onDark = false }: { swatches: Swatch[]; onDark?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {swatches.map((s) => (
        <div key={s.var} className="flex flex-col gap-1.5 w-36">
          <div
            className="w-full h-12 rounded-lg border border-border-subtle"
            style={{ background: `var(${s.var})` }}
          />
          <div>
            <p className="text-xs font-mono font-semibold" style={{ color: onDark ? 'var(--color-ink)' : 'var(--color-bg)' }}>
              {s.name}
            </p>
            <p className="text-2xs font-mono opacity-60" style={{ color: onDark ? 'var(--color-ink)' : 'var(--color-bg)' }}>
              {s.var}
            </p>
            {s.label && (
              <p className="text-2xs opacity-50 mt-0.5" style={{ color: onDark ? 'var(--color-ink)' : 'var(--color-bg)' }}>
                {s.label}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold tracking-widest uppercase text-ink3 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function ButtonShowcase() {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <button className="px-4 py-2 rounded-lg bg-primary hover:bg-primary2 transition-colors text-sm font-medium text-ink">
        Primary CTA
      </button>
      <button className="px-4 py-2 rounded-lg bg-accent/20 border border-accent text-accent text-sm font-medium">
        Active Tab
      </button>
      <button className="px-4 py-2 rounded-lg border border-border text-ink3 text-sm font-medium hover:bg-bg-hover hover:border-border-hover hover:text-ink transition-all">
        Default Button
      </button>
      <button className="px-4 py-2 rounded-lg border border-border text-ink3 text-sm font-medium opacity-50 cursor-not-allowed">
        Disabled
      </button>
      <button className="px-3 py-1.5 rounded-lg border border-border-subtle text-ink3 text-sm hover:bg-bg-hover transition-colors">
        Small Button
      </button>
    </div>
  )
}

function InputShowcase() {
  return (
    <div className="flex flex-col gap-3 max-w-xs">
      <input
        type="text"
        placeholder="Default input"
        className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-subtle text-ink placeholder-ink3 focus:border-accent focus:outline-none transition-colors"
      />
      <input
        type="text"
        defaultValue="With value"
        className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-accent text-ink focus:outline-none"
      />
      <select className="text-sm bg-bg-subtle border border-border-subtle rounded px-2 py-1.5 text-ink focus:border-accent focus:outline-none">
        <option>Select option</option>
        <option>Option 2</option>
      </select>
    </div>
  )
}

function BadgeShowcase() {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-label font-semibold tracking-wide uppercase px-3 py-1 rounded-lg"
        style={{ color: '#c8872a', background: 'rgba(200,135,42,0.12)', border: '1px solid rgba(200,135,42,0.25)' }}>
        Delta Blues
      </span>
      <span className="text-2xs font-medium tracking-wide uppercase px-2.5 py-0.5 rounded-lg opacity-75"
        style={{ color: '#4a90d9', border: '1px solid #4a90d955', background: '#4a90d912' }}>
        Chicago Blues
      </span>
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border border-border-subtle bg-bg-elevated text-ink2">
        Musician Chip
      </span>
    </div>
  )
}

function TokensPage() {
  return (
    <div className="bg-bg min-h-screen p-8">
      <h1 className="text-2xl font-bold text-ink mb-2">Blues Map · Design Tokens</h1>
      <p className="text-sm text-ink3 mb-10">
        All colors are defined as Tailwind v4 <code className="bg-bg-elevated px-1 py-0.5 rounded text-accent">@theme</code> tokens
        in <code className="bg-bg-elevated px-1 py-0.5 rounded text-accent">src/index.css</code>.
      </p>

      <Section title="Backgrounds">
        <SwatchRow swatches={backgrounds} onDark />
      </Section>

      <Section title="Borders">
        <SwatchRow swatches={borders} onDark />
      </Section>

      <Section title="Text">
        <SwatchRow swatches={text} onDark />
      </Section>

      <Section title="Accent (Steel Blue)">
        <SwatchRow swatches={accent} onDark />
      </Section>

      <Section title="Primary CTA (Warm Amber)">
        <SwatchRow swatches={primary} onDark />
      </Section>

      <Section title="Buttons">
        <ButtonShowcase />
      </Section>

      <Section title="Inputs">
        <InputShowcase />
      </Section>

      <Section title="Badges & Chips">
        <BadgeShowcase />
      </Section>
    </div>
  )
}

export const Tokens: StoryObj = {
  render: () => <TokensPage />,
}
