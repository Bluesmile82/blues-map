import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import SearchInput from './SearchInput'

const meta: Meta<typeof SearchInput> = {
  title: 'UI Kit/SearchInput',
  component: SearchInput,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof SearchInput>

function Controlled(props: { placeholder?: string; initialValue?: string }) {
  const [value, setValue] = useState(props.initialValue ?? '')
  return <SearchInput value={value} onChange={setValue} placeholder={props.placeholder} />
}

export const Empty: Story = {
  render: () => <Controlled placeholder="Find by name…" />,
}

export const WithValue: Story = {
  render: () => <Controlled placeholder="Find by name…" initialValue="Muddy Waters" />,
}

export const FilterText: Story = {
  render: () => <Controlled placeholder="Filter by description or albums…" />,
}
