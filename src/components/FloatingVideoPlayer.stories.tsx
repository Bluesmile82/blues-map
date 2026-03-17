import type { Meta, StoryObj } from '@storybook/react'
import FloatingVideoPlayer from './FloatingVideoPlayer'
import { mockMusician } from '../stories/mockData'

const meta: Meta<typeof FloatingVideoPlayer> = {
  title: 'UI Kit/FloatingVideoPlayer',
  component: FloatingVideoPlayer,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#0a0805', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FloatingVideoPlayer>

/** Base args shared by all stories */
const baseArgs = {
  youtubeUrl: mockMusician.youtubeLink,
  albums: mockMusician.albums,
  musicianName: mockMusician.name,
  manualVideoUrl: null,
  panelOpen: true,
  onClose: () => {},
  autoplay: false,
} satisfies Partial<React.ComponentProps<typeof FloatingVideoPlayer>>

export const Default: Story = {
  args: baseArgs,
}

export const WithManualVideo: Story = {
  args: {
    ...baseArgs,
    manualVideoUrl: mockMusician.albums[0]?.youtubeLink ?? null,
  },
}

export const NoPanelSidebar: Story = {
  args: {
    ...baseArgs,
    panelOpen: false,
    initialPos: { x: 24, y: 56 },
    initialW: 360,
  },
}

export const SmallSize: Story = {
  args: {
    ...baseArgs,
    initialW: 200,
    initialPos: { x: 24, y: 56 },
  },
}

export const LargeSize: Story = {
  args: {
    ...baseArgs,
    initialW: 640,
    initialPos: { x: 40, y: 56 },
  },
}
