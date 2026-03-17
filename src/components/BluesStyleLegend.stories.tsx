import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import BluesStyleLegend from './BluesStyleLegend'
import { CANONICAL_STYLES } from '../utils/colors'

const meta: Meta<typeof BluesStyleLegend> = {
  title: 'UI Kit/BluesStyleLegend',
  component: BluesStyleLegend,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ padding: 24, backgroundColor: '#0a0805', minWidth: 220 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof BluesStyleLegend>

function Controlled({
  initialOpen = true,
  initialFilter = null,
  embedded = false,
}: {
  initialOpen?: boolean
  initialFilter?: string | null
  embedded?: boolean
}) {
  const [open, setOpen] = useState(initialOpen)
  const [filter, setFilter] = useState<string | null>(initialFilter)
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className={embedded ? 'bg-bg-elevated border border-border-subtle rounded-lg px-3 py-2' : ''}>
      <BluesStyleLegend
        isOpen={open}
        onToggle={() => setOpen((o) => !o)}
        styleFilter={filter}
        onStyleFilterChange={setFilter}
        onHoverStyle={setHovered}
        hoveredStyle={hovered}
        availableStyles={[...CANONICAL_STYLES]}
        embedded={embedded}
      />
    </div>
  )
}

export const Expanded: Story = {
  render: () => <Controlled initialOpen />,
}

export const Collapsed: Story = {
  render: () => <Controlled initialOpen={false} />,
}

export const WithFilter: Story = {
  render: () => <Controlled initialOpen initialFilter="Delta Blues" />,
}

export const Embedded: Story = {
  render: () => <Controlled initialOpen embedded />,
  parameters: { layout: 'padded' },
}

export const FewStyles: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    const [filter, setFilter] = useState<string | null>(null)
    const [hovered, setHovered] = useState<string | null>(null)
    return (
      <BluesStyleLegend
        isOpen={open}
        onToggle={() => setOpen((o) => !o)}
        styleFilter={filter}
        onStyleFilterChange={setFilter}
        onHoverStyle={setHovered}
        hoveredStyle={hovered}
        availableStyles={['Delta Blues', 'Chicago Blues', 'Texas Blues', 'Piedmont Blues']}
      />
    )
  },
}
