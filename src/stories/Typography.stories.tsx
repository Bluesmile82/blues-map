import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'UI Kit/Typography',
  parameters: { layout: 'padded' },
}
export default meta

const SCALE = [
  { name: 'text-3xs', cls: 'text-3xs', val: '0.55rem / 8.8px', label: 'Smallest badges, icons' },
  { name: 'text-2xs', cls: 'text-2xs', val: '0.65rem / 10.4px', label: 'Metadata, secondary badges' },
  { name: 'text-label', cls: 'text-label', val: '0.70rem / 11.2px', label: 'Filter labels, legend text' },
  { name: 'text-xs',   cls: 'text-xs',   val: '0.75rem / 12px',   label: 'Captions, secondary info' },
  { name: 'text-sm',   cls: 'text-sm',   val: '0.875rem / 14px',  label: 'Body text, list items' },
  { name: 'text-ui',   cls: 'text-ui',   val: '0.85rem / 13.6px', label: 'UI labels, panel text' },
  { name: 'text-base', cls: 'text-base', val: '1rem / 16px',      label: 'Default body' },
  { name: 'text-lg',   cls: 'text-lg',   val: '1.125rem / 18px',  label: 'Subheadings' },
  { name: 'text-xl',   cls: 'text-xl',   val: '1.25rem / 20px',   label: 'Section titles' },
  { name: 'text-2xl',  cls: 'text-2xl',  val: '1.5rem / 24px',    label: 'Page headings' },
  { name: 'text-3xl',  cls: 'text-3xl',  val: '1.875rem / 30px',  label: 'Hero titles' },
]

const COLORS = [
  { name: 'text-ink',      label: 'Primary text' },
  { name: 'text-ink2',     label: 'Secondary text' },
  { name: 'text-ink3',     label: 'Muted / metadata' },
  { name: 'text-ink-warm', label: 'Warm hover' },
  { name: 'text-accent',   label: 'Accent / links' },
  { name: 'text-accent2',  label: 'Accent hover' },
  { name: 'text-primary',  label: 'CTA / primary' },
  { name: 'text-danger',   label: 'Error / danger' },
  { name: 'text-success',  label: 'Success' },
]

const WEIGHTS = [
  { name: 'font-normal',    label: 'Normal 400' },
  { name: 'font-medium',    label: 'Medium 500' },
  { name: 'font-semibold',  label: 'Semibold 600' },
  { name: 'font-bold',      label: 'Bold 700' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-12">
      <h2 className="text-2xs text-accent tracking-widest uppercase font-semibold mb-5 pb-2 border-b border-border-subtle">{title}</h2>
      {children}
    </div>
  )
}

function TypographyPage() {
  return (
    <div className="bg-bg min-h-screen p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-ink mb-2">Blues Map · Typography</h1>
      <p className="text-sm text-ink3 mb-10">Font scale, weights, colors and families.</p>

      <Section title="Type Scale">
        {SCALE.map(({ name, cls, val }) => (
          <div key={name} className="flex items-baseline gap-4 mb-4">
            <span className="w-24 text-3xs text-ink3 font-mono shrink-0">{name}</span>
            <span className={`${cls} text-ink leading-tight flex-1`}>
              The blues ain't nothing but a good man feeling bad
            </span>
            <span className="text-3xs text-ink3 font-mono shrink-0 hidden sm:block">{val}</span>
          </div>
        ))}
        <p className="text-2xs text-ink3 mt-2 italic">
          {SCALE.map(s => s.label).join(' · ')}
        </p>
      </Section>

      <Section title="Font Families">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-2xs text-ink3 font-mono mb-2">font-sans (default)</p>
            <p className="font-sans text-base text-ink">
              The blues is the roots; everything else is the fruits.
            </p>
            <p className="font-sans text-sm text-ink2 mt-1">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
            </p>
          </div>
          <div>
            <p className="text-2xs text-ink3 font-mono mb-2">font-serif</p>
            <p className="font-serif text-base text-ink">
              The blues is the roots; everything else is the fruits.
            </p>
            <p className="font-serif text-sm text-ink2 mt-1">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
            </p>
          </div>
          <div>
            <p className="text-2xs text-ink3 font-mono mb-2">font-mono</p>
            <p className="font-mono text-sm text-ink">
              --color-accent: #4c93a9;  /* steel blue */
            </p>
          </div>
        </div>
      </Section>

      <Section title="Font Weights">
        <div className="flex flex-col gap-3">
          {WEIGHTS.map(({ name, label }) => (
            <div key={name} className="flex items-center gap-4">
              <span className="w-32 text-3xs text-ink3 font-mono shrink-0">{name}</span>
              <span className={`${name} text-base text-ink`}>{label} · Delta Blues</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Text Colors">
        <div className="flex flex-col gap-2.5">
          {COLORS.map(({ name, label }) => (
            <div key={name} className="flex items-center gap-4">
              <span className="w-32 text-3xs text-ink3 font-mono shrink-0">{name}</span>
              <span className={`${name} text-sm`}>The blues is a natural fact — {label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Usage Patterns">
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-2xs text-accent tracking-widest uppercase font-semibold mb-2">Section heading</p>
            <h2 className="text-lg font-bold text-ink">Robert Johnson</h2>
            <p className="text-sm text-ink2 mt-1">Delta Blues · Guitar · 1911–1938</p>
            <p className="text-xs text-ink3 mt-1">Active from 1930 · Hazlehurst, Mississippi</p>
          </div>
          <div>
            <p className="text-2xs text-accent tracking-widest uppercase font-semibold mb-2">Body text</p>
            <p className="text-ui text-ink2 leading-relaxed">
              Robert Leroy Johnson was an American blues singer-songwriter and musician.
              His landmark recordings in 1936 and 1937 display a remarkably complex style.
            </p>
          </div>
          <div>
            <p className="text-2xs text-accent tracking-widest uppercase font-semibold mb-2">Mono / code</p>
            <code className="font-mono text-xs text-accent bg-bg-elevated px-2 py-1 rounded">
              --color-primary: #c8872a
            </code>
          </div>
        </div>
      </Section>
    </div>
  )
}

export const All: StoryObj = {
  render: () => <TypographyPage />,
}
