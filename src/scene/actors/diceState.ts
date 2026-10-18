// Shared, mutable live position of the 3D die (written by <Dice/> every frame)
// so VFX handlers (e.g. `six`) can anchor effects to where the die really is.
import { Vector3 } from 'three';

export const diceAnchor = new Vector3(0, 0.4, 0);
