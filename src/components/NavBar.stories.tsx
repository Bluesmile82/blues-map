import type { Meta, StoryObj } from '@storybook/react'
import NavBar from './NavBar'
import { withJotai } from '../stories/JotaiDecorator'
import { mockUser } from '../stories/mockData'

const meta: Meta<typeof NavBar> = {
  title: 'UI Kit/NavBar',
  component: NavBar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: 64 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    view: 'influence',
    editMode: false,
    editModeEnabled: false,
    autoplay: false,
    onViewChange: () => {},
    onEditModeChange: () => {},
    onCreateNew: () => {},
    onRandom: () => {},
    onCredits: () => {},
    onAutoplayChange: () => {},
  },
}
export default meta

type Story = StoryObj<typeof NavBar>

export const LoggedOut: Story = {
  decorators: [withJotai({ user: null })],
}

export const LoggedIn: Story = {
  decorators: [withJotai({ user: mockUser })],
}

export const MapView: Story = {
  args: { view: 'map' },
  decorators: [withJotai({ user: null })],
}

export const AutoplayOn: Story = {
  args: { autoplay: true },
  decorators: [withJotai({ user: null })],
}

export const EditModeEnabled: Story = {
  args: { editModeEnabled: true, editMode: true },
  decorators: [withJotai({ user: null })],
}
