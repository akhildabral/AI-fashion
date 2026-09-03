import { fireEvent, screen } from '@testing-library/react-native'
import { Button } from './Button'
import { renderWithTheme } from '@/src/test/render'

type Json = { type?: string; children?: (Json | string)[] | null } | string | null

/** Whether a host element of this type is anywhere in the rendered tree. */
function hasType(node: Json | Json[], type: string): boolean {
  if (!node) return false
  if (Array.isArray(node)) return node.some((n) => hasType(n, type))
  if (typeof node === 'string') return false
  return node.type === type || hasType(node.children ?? [], type)
}

describe('Button', () => {
  it('fires on press and carries its label as the accessible name', async () => {
    const onPress = jest.fn()
    await renderWithTheme(<Button label="Wearing it" onPress={onPress} testID="wear" />)
    await fireEvent.press(screen.getByTestId('wear'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Wearing it' })).toBeTruthy()
  })

  it('does nothing while disabled and says so', async () => {
    const onPress = jest.fn()
    await renderWithTheme(<Button label="Continue" disabled onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Continue' })
    await fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
    expect(button.props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('swaps the label for a spinner while loading and blocks presses', async () => {
    const onPress = jest.fn()
    await renderWithTheme(<Button label="See it on me" loading onPress={onPress} testID="render" />)
    expect(screen.queryByText('See it on me')).toBeNull()
    expect(hasType(screen.toJSON() as Json, 'ActivityIndicator')).toBe(true)
    const button = screen.getByTestId('render')
    await fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
  })

  it('keeps an explicit accessibilityLabel for icon buttons', async () => {
    await renderWithTheme(<Button variant="icon" accessibilityLabel="More" onPress={() => undefined} />)
    expect(screen.getByLabelText('More')).toBeTruthy()
  })
})
