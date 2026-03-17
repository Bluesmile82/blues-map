import type { Meta, StoryObj } from '@storybook/react'
import { Tooltip, TooltipProvider } from '../components/ui/Tooltip'

const meta: Meta = {
  title: 'UI Kit/Tooltip',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ padding: 80, backgroundColor: '#0a0805' }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
}
export default meta

type Story = StoryObj

export const Top: Story = {
  render: () => (
    <Tooltip content="Opens musician details panel" side="top">
      <button className="px-4 py-2 rounded-lg border border-border text-ink3 text-sm hover:bg-bg-hover hover:text-ink transition-all">
        Hover me (top)
      </button>
    </Tooltip>
  ),
}

export const Bottom: Story = {
  render: () => (
    <Tooltip content="Opens musician details panel" side="bottom">
      <button className="px-4 py-2 rounded-lg border border-border text-ink3 text-sm hover:bg-bg-hover hover:text-ink transition-all">
        Hover me (bottom)
      </button>
    </Tooltip>
  ),
}

export const Left: Story = {
  render: () => (
    <Tooltip content="Collapse filter panel" side="left">
      <button className="px-4 py-2 rounded-lg border border-border text-ink3 text-sm hover:bg-bg-hover hover:text-ink transition-all">
        Hover me (left)
      </button>
    </Tooltip>
  ),
}

export const Right: Story = {
  render: () => (
    <Tooltip content="Collapse filter panel" side="right">
      <button className="px-4 py-2 rounded-lg border border-border text-ink3 text-sm hover:bg-bg-hover hover:text-ink transition-all">
        Hover me (right)
      </button>
    </Tooltip>
  ),
}

export const OnIconButtons: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Tooltip content="Zoom in" side="bottom">
        <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg-elevated border border-border-subtle text-ink3 hover:text-ink hover:border-accent/60 text-2xl transition-colors">
          +
        </button>
      </Tooltip>
      <Tooltip content="Zoom out" side="bottom">
        <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg-elevated border border-border-subtle text-ink3 hover:text-ink hover:border-accent/60 text-2xl transition-colors">
          −
        </button>
      </Tooltip>
      <Tooltip content="Reset view" side="bottom">
        <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg-elevated border border-border-subtle text-ink3 hover:text-ink hover:border-accent/60 text-xl transition-colors">
          ⟳
        </button>
      </Tooltip>
      <Tooltip content="Add to favorites" side="bottom">
        <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-ink3 hover:bg-bg-hover hover:text-ink transition-all">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      </Tooltip>
    </div>
  ),
}

export const WithRichContent: Story = {
  render: () => (
    <Tooltip
      content={
        <span>
          <strong className="text-ink">Scatter</strong> — distribute musicians using a hash-based seed for organic placement
        </span>
      }
      side="top"
    >
      <button className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-semibold tracking-wide uppercase">
        Scatter
      </button>
    </Tooltip>
  ),
}
