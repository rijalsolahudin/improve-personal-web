import { AppState, type AppStateStatus } from 'react-native'

import { isAppInForeground, subscribeAppLifecycle } from './app-state'

type ChangeHandler = (state: AppStateStatus) => void

function captureAppState(initial: AppStateStatus) {
  let handler: ChangeHandler | null = null
  const remove = jest.fn()
  Object.defineProperty(AppState, 'currentState', { value: initial, configurable: true })
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    handler = listener as ChangeHandler
    return { remove }
  })
  return {
    emit: (state: AppStateStatus) => handler?.(state),
    remove,
  }
}

describe('subscribeAppLifecycle', () => {
  afterEach(() => jest.restoreAllMocks())

  it('background -> active memanggil onForeground; masuk background memanggil onBackground', () => {
    const appState = captureAppState('active')
    const onForeground = jest.fn()
    const onBackground = jest.fn()
    subscribeAppLifecycle({ onForeground, onBackground })

    appState.emit('background')
    appState.emit('active')

    expect(onBackground).toHaveBeenCalledTimes(1)
    expect(onForeground).toHaveBeenCalledTimes(1)
  })

  it('interupsi iOS (inactive -> active) bukan siklus latar', () => {
    const appState = captureAppState('active')
    const onForeground = jest.fn()
    const onBackground = jest.fn()
    subscribeAppLifecycle({ onForeground, onBackground })

    appState.emit('inactive')
    appState.emit('active')

    expect(onBackground).not.toHaveBeenCalled()
    expect(onForeground).not.toHaveBeenCalled()
  })

  it('dibuka dari background: active pertama memanggil onForeground sekali', () => {
    const appState = captureAppState('background')
    const onForeground = jest.fn()
    subscribeAppLifecycle({ onForeground })

    appState.emit('background')
    appState.emit('active')
    appState.emit('active')

    expect(onForeground).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe melepas listener AppState', () => {
    const appState = captureAppState('active')
    const unsubscribe = subscribeAppLifecycle({})

    unsubscribe()

    expect(appState.remove).toHaveBeenCalledTimes(1)
  })

  it('isAppInForeground mengikuti AppState.currentState', () => {
    captureAppState('active')
    expect(isAppInForeground()).toBe(true)
    captureAppState('background')
    expect(isAppInForeground()).toBe(false)
  })
})
