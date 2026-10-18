import { useShallow } from 'zustand/react/shallow';
import { Modal, Label, Segmented, Slider, Toggle, NxButton } from './primitives';
import { useUI } from './uiStore';
import { useSettings } from '../store/settings';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SettingsModal() {
  const close = useUI((s) => s.setSettings);
  const s = useSettings(
    useShallow((st) => ({
      intensity: st.intensity,
      speed: st.speed,
      masterVolume: st.masterVolume,
      musicVolume: st.musicVolume,
      sfxVolume: st.sfxVolume,
      muted: st.muted,
      showHints: st.showHints,
      autoMoveSingle: st.autoMoveSingle,
      cameraMode: st.cameraMode,
      screenShake: st.screenShake,
    })),
  );
  const set = useSettings((st) => st.set);

  return (
    <Modal
      title="SETTINGS"
      kicker="// SYSTEM CONFIG"
      onClose={() => close(false)}
      width={600}
      footer={
        <NxButton variant="primary" onClick={() => close(false)}>
          APPLY &amp; CLOSE
        </NxButton>
      }
    >
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <section className="space-y-3">
          <Label color="#00f0ff">{'// VISUALS'}</Label>
          <div data-anim>
            <div className="mb-1.5 font-display text-[11px] font-bold tracking-[0.16em] text-white/90">ANIMATION INTENSITY</div>
            <Segmented
              ariaLabel="Animation intensity"
              value={s.intensity}
              onChange={(intensity) => set({ intensity })}
              options={[
                { value: 'low', label: 'LOW' },
                { value: 'medium', label: 'MED' },
                { value: 'high', label: 'HIGH', accent: '#ff2bd6' },
              ]}
            />
          </div>
          <div data-anim>
            <div className="mb-1.5 font-display text-[11px] font-bold tracking-[0.16em] text-white/90">CAMERA MODE</div>
            <Segmented
              ariaLabel="Camera mode"
              value={s.cameraMode}
              onChange={(cameraMode) => set({ cameraMode })}
              options={[
                { value: 'auto', label: 'AUTO' },
                { value: 'free', label: 'FREE', accent: '#9d4dff' },
              ]}
            />
          </div>
          <div data-anim>
            <Toggle checked={s.screenShake} onChange={(screenShake) => set({ screenShake })} label="SCREEN SHAKE" desc="Impact jolts on captures & EMP" />
          </div>
        </section>

        <section className="space-y-3">
          <Label color="#ffb300">{'// GAMEPLAY'}</Label>
          <div data-anim>
            <Slider label="GAME SPEED" value={s.speed} min={0.5} max={2.5} step={0.1} onChange={(speed) => set({ speed })} format={(v) => `${v.toFixed(1)}×`} />
          </div>
          <div data-anim>
            <Toggle checked={s.showHints} onChange={(showHints) => set({ showHints })} label="TACTICAL HINTS" desc="Suggest the best unit to move" />
          </div>
          <div data-anim>
            <Toggle
              checked={s.autoMoveSingle}
              onChange={(autoMoveSingle) => set({ autoMoveSingle })}
              label="AUTO-MOVE SINGLE OPTION"
              desc="Move automatically when only one unit can"
            />
          </div>
        </section>

        <section className="space-y-2 sm:col-span-2">
          <Label color="#ff2bd6">{'// AUDIO'}</Label>
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-3">
            <div data-anim>
              <Slider label="MASTER" value={s.masterVolume} min={0} max={1} step={0.05} onChange={(masterVolume) => set({ masterVolume })} format={pct} disabled={s.muted} />
            </div>
            <div data-anim>
              <Slider label="MUSIC" value={s.musicVolume} min={0} max={1} step={0.05} onChange={(musicVolume) => set({ musicVolume })} format={pct} disabled={s.muted} />
            </div>
            <div data-anim>
              <Slider label="SFX" value={s.sfxVolume} min={0} max={1} step={0.05} onChange={(sfxVolume) => set({ sfxVolume })} format={pct} disabled={s.muted} />
            </div>
          </div>
          <div data-anim>
            <Toggle checked={s.muted} onChange={(muted) => set({ muted })} label="MUTE ALL" />
          </div>
        </section>
      </div>
    </Modal>
  );
}
