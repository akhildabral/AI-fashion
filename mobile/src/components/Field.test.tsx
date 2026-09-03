import { fireEvent, screen } from '@testing-library/react-native'
import { Field } from './Field'
import { renderWithTheme } from '@/src/test/render'

describe('Field', () => {
  it('shows its label and reaches the input by testID', async () => {
    const onChangeText = jest.fn()
    await renderWithTheme(<Field label="Email" testID="email" value="" onChangeText={onChangeText} />)
    expect(screen.getByText('Email')).toBeTruthy()
    const input = screen.getByTestId('email')
    expect(input.props.accessibilityLabel).toBe('Email')
    await fireEvent.changeText(input, 'sam@zauq.app')
    expect(onChangeText).toHaveBeenCalledWith('sam@zauq.app')
  })

  it('prefers the error to the helper beneath', async () => {
    const { rerender } = await renderWithTheme(<Field label="City" helper="Where mornings happen" />)
    expect(screen.getByText('Where mornings happen')).toBeTruthy()
    await rerender(<Field label="City" helper="Where mornings happen" error="Not a city we know." />)
    expect(screen.getByText('Not a city we know.')).toBeTruthy()
    expect(screen.queryByText('Where mornings happen')).toBeNull()
  })

  it('hides a password until the toggle shows it', async () => {
    await renderWithTheme(<Field label="Password" password testID="password" />)
    const input = screen.getByTestId('password')
    expect(input.props.secureTextEntry).toBe(true)
    expect(input.props.autoCapitalize).toBe('none')

    await fireEvent.press(screen.getByLabelText('Show password'))
    expect(screen.getByTestId('password').props.secureTextEntry).toBe(false)
    expect(screen.getByText('Hide')).toBeTruthy()

    await fireEvent.press(screen.getByLabelText('Hide password'))
    expect(screen.getByTestId('password').props.secureTextEntry).toBe(true)
  })

  it('has no toggle on an ordinary field', async () => {
    await renderWithTheme(<Field label="Name" />)
    expect(screen.queryByLabelText('Show password')).toBeNull()
  })
})
