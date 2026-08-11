import { Component } from 'react'
import i18n from '../i18n'

// Without this, any render-time error anywhere in the tree silently unmounts
// the whole app — React's default behavior with no boundary — leaving a
// blank white page and zero clue what happened. This catches that, shows
// what broke, and offers a way back instead of a dead end.
//
// Class component, so it can't use the useTranslation() hook — calls the
// i18next singleton's t() directly instead. That's fine here: this screen
// has no language switcher of its own and isn't expected to re-render on a
// language change while showing an error.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-svh flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
          <h1 className="text-lg font-bold text-gray-900">{i18n.t('errorBoundary.title')}</h1>
          <p className="text-sm text-gray-600">
            {i18n.t('errorBoundary.message')}
          </p>
          <pre className="text-xs text-red-600 bg-red-50 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
            {this.state.error?.message ?? String(this.state.error)}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
            className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-400 active:bg-brand-700 transition-colors"
          >
            {i18n.t('errorBoundary.backToDashboard')}
          </button>
        </div>
      </div>
    )
  }
}
