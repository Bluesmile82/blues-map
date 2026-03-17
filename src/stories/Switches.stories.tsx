import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'

const meta: Meta = {
  title: 'UI Kit/Switches',
  parameters: { layout: 'padded' },
}
export default meta

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-2xs text-accent tracking-widest uppercase font-semibold mb-5">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

/** Native checkbox styled to match the app's design token system */
function CheckboxRow({
  label,
  hint,
  defaultChecked = false,
  disabled = false,
}: {
  label: string
  hint?: string
  defaultChecked?: boolean
  disabled?: boolean
}) {
  const [checked, setChecked] = useState(defaultChecked)
  const id = label.replace(/\s+/g, '-').toLowerCase()

  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => !disabled && setChecked(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 w-4 h-4 rounded border-border-subtle bg-bg-subtle text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer"
      />
      <label htmlFor={id} className={`text-sm ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="text-ink">{label}</span>
        {hint && <p className="text-xs text-ink3 mt-0.5">{hint}</p>}
      </label>
    </div>
  )
}

/** Toggle pill — CSS-only, no extra library */
function ToggleRow({
  label,
  hint,
  defaultChecked = false,
  disabled = false,
}: {
  label: string
  hint?: string
  defaultChecked?: boolean
  disabled?: boolean
}) {
  const [on, setOn] = useState(defaultChecked)

  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <p className="text-sm text-ink">{label}</p>
        {hint && <p className="text-xs text-ink3 mt-0.5">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => !disabled && setOn((v) => !v)}
        className={`relative inline-flex w-10 h-5.5 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-accent/50 ${
          on ? 'bg-accent' : 'bg-border-hover'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ height: 22, width: 40 }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform"
          style={{ transform: on ? 'translateX(18px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  )
}

/** Radio group */
function RadioGroup({ options, label }: { options: string[]; label: string }) {
  const [selected, setSelected] = useState(options[0])
  return (
    <div>
      <p className="text-sm text-ink mb-3">{label}</p>
      <div className="flex flex-col gap-2.5">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name={label}
              value={opt}
              checked={selected === opt}
              onChange={() => setSelected(opt)}
              className="w-4 h-4 text-accent border-border-subtle bg-bg-subtle focus:ring-accent focus:ring-offset-0"
            />
            <span className="text-sm text-ink">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function SwitchesPage() {
  return (
    <div className="bg-bg min-h-screen p-8 max-w-md">
      <h1 className="text-2xl font-bold text-ink mb-2">Blues Map · Switches</h1>
      <p className="text-sm text-ink3 mb-10">Checkboxes, toggles and radio groups.</p>

      <Section title="Checkboxes">
        <CheckboxRow label="Show favorites only" />
        <CheckboxRow label="Include secondary styles" hint="Show musicians with this as a secondary style" />
        <CheckboxRow label="Auto-play videos" defaultChecked />
        <CheckboxRow label="Disabled option" disabled />
        <CheckboxRow label="Disabled + checked" defaultChecked disabled />
      </Section>

      <Section title="Toggle switches">
        <ToggleRow label="Scatter layout" hint="Distribute musicians using random hash seed" defaultChecked />
        <ToggleRow label="Natural positions" hint="Let relationships determine node positions freely" />
        <ToggleRow label="Show labels" defaultChecked />
        <ToggleRow label="Disabled option" disabled />
      </Section>

      <Section title="Radio groups">
        <RadioGroup
          label="Group by"
          options={['Style', 'Instrument', 'Region']}
        />
      </Section>

      <Section title="In context (filter card)">
        <div className="bg-bg-elevated border border-border-subtle rounded-lg px-3 py-3 flex flex-col gap-3">
          <p className="text-2xs text-accent tracking-widest uppercase">Filters</p>
          <CheckboxRow label="Show favorites only" />
          <div className="flex flex-col gap-1.5 pl-7">
            <select className="text-label bg-bg-subtle border border-border-subtle rounded px-2 py-1.5 text-ink focus:border-accent focus:outline-none">
              <option>All lists</option>
              <option>Delta Legends (12)</option>
              <option>Chicago Icons (8)</option>
            </select>
          </div>
          <div className="border-t border-border-subtle pt-2">
            <ToggleRow label="Auto-play" defaultChecked />
          </div>
        </div>
      </Section>
    </div>
  )
}

export const All: StoryObj = {
  render: () => <SwitchesPage />,
}
