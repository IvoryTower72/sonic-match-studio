import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles.css'

class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: Error): { message: string } {
    return { message: error.message }
  }

  render() {
    if (this.state.message) {
      return <p className="fatal">The window hit a problem: {this.state.message}</p>
    }
    return this.props.children
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('The window root is missing.')
createRoot(root).render(
  <Boundary>
    <App />
  </Boundary>,
)
