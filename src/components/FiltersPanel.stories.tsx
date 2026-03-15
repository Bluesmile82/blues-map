import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import FiltersPanel from './FiltersPanel'
import { withJotai } from '../stories/JotaiDecorator'
import { mockUser } from '../stories/mockData'
import { CANONICAL_STYLES } from '../utils/colors'

const meta: Meta<typeof FiltersPanel> = {
  title: 'UI Kit/FiltersPanel',
  component: FiltersPanel,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ padding: 16, backgroundColor: '#0a0805', minHeight: 400 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FiltersPanel>

const availableStyles = [...CANONICAL_STYLES]

function Controlled() {
  const [search, setSearch] = useState('')
  const [text, setText] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [listId, setListId] = useState<string | null>(null)
  const [style, setStyle] = useState<string | null>(null)
  const [yearRange, setYearRange] = useState<[number, number] | null>(null)

  return (
    <FiltersPanel
      searchValue={search}
      onSearchChange={setSearch}
      textFilterValue={text}
      onTextFilterChange={setText}
      showFavoritesOnly={favOnly}
      onFavoritesOnlyChange={setFavOnly}
      filterListId={listId}
      onFilterListIdChange={setListId}
      styleFilter={style}
      onStyleFilterChange={setStyle}
      availableStyles={availableStyles}
      yearRange={yearRange}
      minYear={1890}
      maxYear={2020}
      onYearRangeChange={setYearRange}
      displayMusiciansCount={42}
    />
  )
}

export const LoggedOut: Story = {
  render: () => <Controlled />,
  decorators: [withJotai({ user: null })],
}

export const LoggedIn: Story = {
  render: () => <Controlled />,
  decorators: [withJotai({ user: mockUser })],
}

export const Collapsed: Story = {
  render: () => {
    const [collapsed, setCollapsed] = useState(true)
    return (
      <FiltersPanel
        searchValue=""
        onSearchChange={() => {}}
        textFilterValue=""
        onTextFilterChange={() => {}}
        showFavoritesOnly={false}
        onFavoritesOnlyChange={() => {}}
        filterListId={null}
        onFilterListIdChange={() => {}}
        styleFilter={null}
        onStyleFilterChange={() => {}}
        availableStyles={availableStyles}
        yearRange={null}
        minYear={1890}
        maxYear={2020}
        onYearRangeChange={() => {}}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      />
    )
  },
  decorators: [withJotai({ user: null })],
}
