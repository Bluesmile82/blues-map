import type { Meta, StoryObj } from '@storybook/react'
import { Provider, createStore } from 'jotai'
import AuthButton from './AuthButton'
import { withJotai } from '../../stories/JotaiDecorator'
import { mockUser } from '../../stories/mockData'
import { authLoadingAtom } from '../../atoms/auth'

const meta: Meta<typeof AuthButton> = {
  title: 'UI Kit/AuthButton',
  component: AuthButton,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof AuthButton>

export const SignedOut: Story = {
  decorators: [withJotai({ user: null })],
}

export const SignedIn: Story = {
  decorators: [withJotai({ user: mockUser })],
}

export const Loading: Story = {
  decorators: [
    (Story) => {
      const store = createStore()
      store.set(authLoadingAtom, true)
      return (
        <Provider store={store}>
          <Story />
        </Provider>
      )
    },
  ],
}
