import type { Meta, StoryObj } from '@storybook/react'
import { mockMusician, mockMusicianWithConnections, mockUser } from './mockData'
import { getStyleHex } from '../utils/colors'

const meta: Meta = {
  title: 'UI Kit/Avatar',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ padding: 32, backgroundColor: '#0a0805' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj

/** User avatar (from AuthButton) */
function UserAvatar({
  user,
  size = 'md',
}: {
  user: typeof mockUser | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const dim = size === 'sm' ? 'w-6 h-6 text-3xs' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-7 h-7 text-2xs'

  if (!user) {
    return (
      <div className={`${dim} rounded-full bg-bg-elevated border border-border flex items-center justify-center text-ink3`}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    )
  }

  return (
    <div className={`${dim} rounded-full bg-primary flex items-center justify-center font-semibold text-ink`}>
      {user.email?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

/** Musician portrait (circular with style-colored ring) */
function MusicianAvatar({
  musician,
  size = 'md',
  selected = false,
}: {
  musician: typeof mockMusician
  size?: 'sm' | 'md' | 'lg' | 'xl'
  selected?: boolean
}) {
  const dim =
    size === 'sm' ? 'w-8 h-8' :
    size === 'lg' ? 'w-16 h-16' :
    size === 'xl' ? 'w-24 h-24' :
    'w-11 h-11'

  const hex = getStyleHex(musician.bluesStyle)

  return (
    <div className="relative inline-block">
      <img
        src={musician.image}
        alt={musician.name}
        className={`${dim} rounded-full object-cover`}
        style={{ filter: 'sepia(8%) contrast(1.02)' }}
        onError={(e) => {
          ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=80`
        }}
      />
      <div
        className="absolute inset-0 rounded-full pointer-events-none border-2"
        style={{ borderColor: hex, opacity: selected ? 1 : 0.6 }}
      />
    </div>
  )
}

/** Avatar with name + style badge below */
function MusicianCard({ musician }: { musician: typeof mockMusician }) {
  const hex = getStyleHex(musician.bluesStyle)
  return (
    <div className="flex flex-col items-center gap-2">
      <MusicianAvatar musician={musician} size="xl" />
      <div className="text-center">
        <p className="text-sm font-semibold text-ink">{musician.name}</p>
        <p className="text-xs" style={{ color: hex }}>{musician.bluesStyle}</p>
        <p className="text-2xs text-ink3">{musician.birthPlace}</p>
      </div>
    </div>
  )
}

export const UserAvatars: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-2xs text-accent tracking-widest uppercase mb-4">User — logged out</p>
        <div className="flex items-center gap-4">
          <UserAvatar user={null} size="sm" />
          <UserAvatar user={null} size="md" />
          <UserAvatar user={null} size="lg" />
        </div>
      </div>
      <div>
        <p className="text-2xs text-accent tracking-widest uppercase mb-4">User — logged in (initials)</p>
        <div className="flex items-center gap-4">
          <UserAvatar user={mockUser} size="sm" />
          <UserAvatar user={mockUser} size="md" />
          <UserAvatar user={mockUser} size="lg" />
        </div>
      </div>
    </div>
  ),
}

export const MusicianAvatars: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-2xs text-accent tracking-widest uppercase mb-4">Sizes</p>
        <div className="flex items-end gap-4">
          <MusicianAvatar musician={mockMusician} size="sm" />
          <MusicianAvatar musician={mockMusician} size="md" />
          <MusicianAvatar musician={mockMusician} size="lg" />
          <MusicianAvatar musician={mockMusician} size="xl" />
        </div>
      </div>
      <div>
        <p className="text-2xs text-accent tracking-widest uppercase mb-4">Selected state</p>
        <div className="flex items-end gap-4">
          <MusicianAvatar musician={mockMusician} size="md" />
          <MusicianAvatar musician={mockMusician} size="md" selected />
          <MusicianAvatar musician={mockMusicianWithConnections} size="md" />
          <MusicianAvatar musician={mockMusicianWithConnections} size="md" selected />
        </div>
      </div>
    </div>
  ),
}

export const MusicianCards: Story = {
  render: () => (
    <div className="flex gap-8 flex-wrap">
      <MusicianCard musician={mockMusician} />
      <MusicianCard musician={mockMusicianWithConnections} />
    </div>
  ),
}

export const AvatarGroup: Story = {
  render: () => {
    const musicians = [mockMusician, mockMusicianWithConnections, mockMusician, mockMusicianWithConnections]
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-2xs text-accent tracking-widest uppercase mb-3">Overlapping group</p>
          <div className="flex">
            {musicians.map((m, i) => (
              <div key={i} className="relative" style={{ marginLeft: i === 0 ? 0 : -10 }}>
                <MusicianAvatar musician={m} size="md" />
              </div>
            ))}
            <div className="relative w-11 h-11 rounded-full bg-bg-elevated border-2 border-border flex items-center justify-center text-xs text-ink3 font-semibold" style={{ marginLeft: -10 }}>
              +12
            </div>
          </div>
        </div>
        <div>
          <p className="text-2xs text-accent tracking-widest uppercase mb-3">In-panel context</p>
          <div className="flex items-center gap-3 p-3 bg-bg-elevated rounded-lg border border-border-subtle">
            <MusicianAvatar musician={mockMusician} size="lg" selected />
            <div>
              <p className="text-sm font-semibold text-ink">{mockMusician.name}</p>
              <p className="text-xs text-ink3">{mockMusician.birthPlace} · {mockMusician.activeFrom}</p>
            </div>
          </div>
        </div>
      </div>
    )
  },
}
