import { Experience } from './scene/Experience'
import { UIRoot } from './ui/UIRoot'
import { AudioManager } from './audio/AudioManager'

export default function App() {
  return (
    <div className="relative h-full w-full">
      <Experience />
      <UIRoot />
      <AudioManager />
    </div>
  )
}
