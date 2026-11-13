import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { PieceSymbol } from 'chess.js';
import { Component, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import {
  AnimationMixer,
  Box3,
  Color,
  LoopOnce,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { noRaycast } from '../courtyardLayout';
import { HEIGHT, MODELS, type Clips } from './models';
import { clipTime, keys, type PieceModelProps } from './rig';

type Clip = keyof Clips;

// Texels whose red and blue are high and green low (the magenta painted in Meshy) take the team's colour,
// at the texel's brightness so the shading baked into the texture survives.
const RECOLOUR = /* glsl */ `
#include <map_fragment>
float keyed = smoothstep(0.15, 0.35, min(diffuseColor.r, diffuseColor.b) - diffuseColor.g);
diffuseColor.rgb = mix(diffuseColor.rgb, teamColor * max(diffuseColor.r, diffuseColor.b), keyed);
`;

const teamMaterials = new Map<Material, Map<string, Material>>();

/** `material` with its magenta replaced by `color`: one copy per material and team, shared by all their pieces. */
function teamMaterial(material: Material, color: string): Material {
  let byColor = teamMaterials.get(material);
  if (!byColor) teamMaterials.set(material, (byColor = new Map()));
  let copy = byColor.get(color);
  if (!copy) {
    copy = material.clone();
    const teamColor = { value: new Color(color) };
    copy.onBeforeCompile = (shader) => {
      shader.uniforms.teamColor = teamColor;
      shader.fragmentShader = `uniform vec3 teamColor;\n${shader.fragmentShader.replace('#include <map_fragment>', RECOLOUR)}`;
    };
    copy.customProgramCacheKey = () => 'team-recolour';
    byColor.set(color, copy);
  }
  return copy;
}

/** Scale and offset that make `scene` `height` tall, standing on y = 0, centred on the square. */
function fit(scene: Object3D, height: number) {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const scale = height / size.y;
  const offset: [number, number, number] = [-(box.min.x + size.x / 2) * scale, -box.min.y * scale, -(box.min.z + size.z / 2) * scale];
  return { scale, offset };
}

/** One action per clip, or null when a clip is missing (the piece then uses whole-model poses). */
function animate(model: Object3D, animations: AnimationClip[], clips: Clips | undefined) {
  if (!clips) return null;
  const mixer = new AnimationMixer(model);
  const actions = {} as Record<Clip, AnimationAction>;
  for (const key of Object.keys(clips) as Clip[]) {
    const clip = animations.find((candidate) => candidate.name === clips[key]);
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    if (key === 'attack' || key === 'die') {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();
    actions[key] = action;
  }
  return { mixer, actions };
}

/** Weights `clip` in and every other clip out. */
function only(actions: Record<Clip, AnimationAction>, clip: Clip) {
  for (const key of Object.keys(actions) as Clip[]) actions[key].setEffectiveWeight(key === clip ? 1 : 0);
}

/** Plays the idle clip on in real time. */
function idle({ mixer, actions }: NonNullable<ReturnType<typeof animate>>, delta: number) {
  only(actions, 'idle');
  actions.idle.paused = false;
  mixer.update(delta);
}

let warned = false;

/** Shows `fallback` (the built-in model) when a model fails to load, so the game stays playable. */
export class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (!warned) console.warn('A piece model failed to load; using the built-in model instead.', error);
    warned = true;
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** A piece drawn from its .glb model (listed in MODELS). Faces +z, like the built-in models. */
export function GlbPiece({ type, color, ref }: PieceModelProps & { type: PieceSymbol }) {
  const entry = MODELS[type]!;
  const gltf = useGLTF(entry.url, false, true);
  const root = useRef<Group>(null!);
  const size = useMemo(() => fit(gltf.scene, HEIGHT[type]), [gltf.scene, type]);

  const model = useMemo(() => {
    const copy = clone(gltf.scene);
    copy.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // a posed skinned mesh leaves its bind-pose bounds
      mesh.raycast = noRaycast; // clicks hit the cylinder below; raycasting a skinned mesh is slow
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => teamMaterial(material, color))
        : teamMaterial(mesh.material, color);
    });
    return copy;
  }, [gltf.scene, color]);

  const anim = useMemo(() => animate(model, gltf.animations, entry.clips), [model, gltf.animations, entry.clips]);
  useEffect(() => () => anim?.mixer.uncacheRoot(model), [anim, model]);

  const posed = useRef(false); // true while the actor holds a clip at a time; otherwise the idle clip plays

  useFrame((_, delta) => {
    if (anim && !posed.current) idle(anim, delta);
  });

  useImperativeHandle(ref, () => {
    // Without clips: whole-model poses (a bob, a lunge, a fall backward).
    if (!anim) {
      return {
        stride(phase) {
          root.current.position.y = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.05;
        },
        attack(t) {
          root.current.position.z = keys(t, 0, -0.1, 0.3, 0);
        },
        die(t) {
          root.current.rotation.x = -t * (Math.PI / 2);
          root.current.position.y = t * 0.12;
        },
      };
    }
    /** Holds `clip` at `value` (see clipTime), with every other clip weighted out. */
    const hold = (clip: Clip, value: number, loop: boolean) => {
      const action = anim.actions[clip];
      only(anim.actions, clip);
      action.enabled = true;
      action.paused = true;
      action.time = clipTime(value, action.getClip().duration, loop);
      anim.mixer.update(0);
    };
    return {
      stride(phase) {
        posed.current = phase !== 0;
        if (posed.current) hold('walk', phase, true);
      },
      attack(t) {
        posed.current = t < 1; // back to idle at the end
        if (posed.current) hold('attack', t, false);
      },
      die(t) {
        posed.current = true; // the last pose stays until the piece is removed
        hold('die', t, false);
      },
    };
  }, [anim]);

  return (
    <group ref={root}>
      <primitive object={model} scale={size.scale} position={size.offset} />
      {/* the click target: invisible, but the raycaster still hits it */}
      <mesh visible={false} position={[0, HEIGHT[type] / 2, 0]}>
        <cylinderGeometry args={[0.35, 0.35, HEIGHT[type], 8]} />
      </mesh>
    </group>
  );
}
