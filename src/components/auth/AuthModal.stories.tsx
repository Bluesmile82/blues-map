import type { Meta, StoryObj } from '@storybook/react'
import { Provider, createStore } from 'jotai'
import AuthModal from './AuthModal'
import { withJotai } from '../../stories/JotaiDecorator'
import { authErrorAtom, authLoadingAtom } from '../../atoms/auth'

const meta: Meta<typeof AuthModal> = {
  title: 'UI Kit/AuthModal',
  component: AuthModal,
  parameters: { layout: 'fullscreen' },
  decorators: [withJotai({ user: null })],
  args: {
    onClose: () => {},
  },
}
export default meta

type Story = StoryObj<typeof AuthModal>

export const SignIn: Story = {}

export const WithError: Story = {
  decorators: [
    (Story: React.ComponentType) => {
      const store = createStore()
      store.set(authLoadingAtom, false)
      store.set(authErrorAtom, 'Invalid email or password.')
      return (
        <Provider store={store}>
          <Story />
        </Provider>
      )
    },
  ],
}
