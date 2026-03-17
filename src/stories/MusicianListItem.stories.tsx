import type { Meta, StoryObj } from '@storybook/react'
import { mockMusician, mockMusicianWithConnections, mockUser } from './mockData'
import { withJotai } from './JotaiDecorator'
import { getStyleColor, getStyleHex } from '../utils/colors'

const meta: Meta = {
  title: 'UI Kit/MusicianListItem',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320, backgroundColor: '#0a0805', padding: '16px' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj

function MusicianItem({
  musician,
  selected = false,
  hovered = false,
  favorited = false,
}: {
  musician: typeof mockMusician
  selected?: boolean
  hovered?: boolean
  favorited?: boolean
}) {
  const hex = getStyleHex(musician.bluesStyle)
  const [r, g, b] = getStyleColor(musician.bluesStyle) as [number, number, number]

  return (
    <button
      className={`w-full flex items-center gap-2 px-4 py-2 transition-all duration-200 text-left mb-1 rounded ${
        selected
          ? 'bg-primary/10 border border-primary/30'
          : hovered
          ? 'bg-bg-elevated'
          : 'bg-bg-subtle border border-transparent'
      }`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <img
          src={musician.image}
          alt={musician.name}
          className="w-11 h-11 rounded-full object-cover"
          style={{ filter: 'sepia(8%) contrast(1.02)' }}
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=40`
          }}
        />
        <div
          className="absolute inset-0 rounded-full pointer-events-none border-2"
          style={{ borderColor: hex, opacity: selected || hovered ? 1 : 0.6 }}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-sm font-medium truncate ${selected || hovered ? 'text-ink' : 'text-ink2'}`}>
            {musician.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-2xs font-medium px-2 py-0.5 rounded-md"
            style={{
              color: hex,
              background: `rgba(${r},${g},${b},0.12)`,
              border: `1px solid rgba(${r},${g},${b},0.25)`,
            }}
          >
            {musician.bluesStyle}
          </span>
          <span className="text-xs text-ink3 truncate">{musician.birthPlace}</span>
        </div>
      </div>

      {/* Favorite star */}
      {favorited && (
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: '#c8872a' }}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      )}

      {/* Selection dot */}
      {selected && (
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: hex, boxShadow: `0 0 10px rgba(${r},${g},${b},0.7)` }}
        />
      )}
    </button>
  )
}

function DecadeHeader({ decade }: { decade: number }) {
  return (
    <div className="sticky -top-4 z-10 py-1 px-3 bg-bg border-b border-border mb-1">
      <span className="text-xs font-bold text-accent tracking-wide">
        <span className="uppercase">Active in</span> {decade}s
      </span>
    </div>
  )
}

export const Default: Story = {
  decorators: [withJotai({ user: null })],
  render: () => (
    <div className="flex flex-col">
      <MusicianItem musician={mockMusician} />
    </div>
  ),
}

export const Hovered: Story = {
  decorators: [withJotai({ user: null })],
  render: () => (
    <div className="flex flex-col">
      <MusicianItem musician={mockMusician} hovered />
    </div>
  ),
}

export const Selected: Story = {
  decorators: [withJotai({ user: null })],
  render: () => (
    <div className="flex flex-col">
      <MusicianItem musician={mockMusician} selected />
    </div>
  ),
}

export const Favorited: Story = {
  decorators: [withJotai({ user: mockUser, favoritedIds: [mockMusician.id] })],
  render: () => (
    <div className="flex flex-col">
      <MusicianItem musician={mockMusician} favorited />
    </div>
  ),
}

export const FullList: Story = {
  decorators: [withJotai({ user: null })],
  render: () => (
    <div className="flex flex-col">
      <DecadeHeader decade={1930} />
      <MusicianItem musician={mockMusician} />
      <MusicianItem musician={mockMusician} selected />
      <DecadeHeader decade={1950} />
      <MusicianItem musician={mockMusicianWithConnections} />
      <MusicianItem musician={mockMusicianWithConnections} hovered />
      <MusicianItem musician={mockMusicianWithConnections} favorited />
    </div>
  ),
  parameters: { layout: 'centered' },
}
