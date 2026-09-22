import { Whiteboard } from './components/Whiteboard'

export default function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">ASPRO</p>
          <h1>Pick up a marker.</h1>
        </div>
        <p className="app-note">A tiny whiteboard that behaves like the real thing.</p>
      </header>
      <Whiteboard />
    </main>
  )
}
