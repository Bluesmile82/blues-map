import type { Meta, StoryObj } from '@storybook/react'
import MusicianPanel from './MusicianPanel'
import { withJotai } from '../stories/JotaiDecorator'
import { mockMusician, mockMusicianWithConnections, mockUser } from '../stories/mockData'

const meta: Meta<typeof MusicianPanel> = {
  title: 'UI Kit/MusicianPanel',
  component: MusicianPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    musician: mockMusician,
    musicians: [mockMusician, mockMusicianWithConnections],
    editMode: false,
    autoplay: false,
    onClose: () => {},
    onNavigate: () => {},
    onEdit: () => {},
    onPlayVideo: () => {},
  },
}
export default meta

type Story = StoryObj<typeof MusicianPanel>

export const LoggedOut: Story = {
  decorators: [withJotai({ user: null })],
}

export const LoggedIn: Story = {
  decorators: [withJotai({ user: mockUser })],
}

export const Favorited: Story = {
  decorators: [withJotai({ user: mockUser, favoritedIds: [mockMusician.id] })],
}

export const WithConnections: Story = {
  args: {
    musician: mockMusicianWithConnections,
    musicians: [mockMusician, mockMusicianWithConnections],
  },
  decorators: [withJotai({ user: null })],
}

export const DeltaBlues: Story = {
  args: { musician: mockMusician },
  decorators: [withJotai({ user: null })],
}
