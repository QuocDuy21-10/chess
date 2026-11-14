import { NodeIO, type Accessor, type Node, type Scene } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, joinPrimitives, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';

// node scripts/kaykit-pawn.ts <KayKit_Adventurers_2.0_FREE dir> <KayKit_Character_Animations_1.1 dir> <out.glb>
// Builds the pawn from KayKit's CC0 packs: the Knight holding a sword and a badge shield, its red cloth
// repainted magenta for GlbPiece's team recolour, and four clips copied in from the animation sets.
// The animation sets share the Knight's skeleton (Rig_Medium), so channels bind by node name.

const CLIPS = {
  idle: ['General', 'Idle_A'],
  walk: ['MovementBasic', 'Walking_A'],
  attack: ['CombatMelee', 'Melee_1H_Attack_Chop'],
  die: ['General', 'Death_A'],
} as const;
const WEAPONS = [
  ['sword_1handed', 'handslot.r'],
  ['shield_badge_color', 'handslot.l'],
] as const;
// The atlas is a grid of 8 × 4 gradient swatches; these two are the red ones (cloth and shield face).
const RED_CELLS: [number, number][] = [
  [0, 1],
  [2, 2],
];

const [adventurers, animations, out] = process.argv.slice(2);
if (!out) throw new Error('usage: node scripts/kaykit-pawn.ts <adventurers dir> <animations dir> <out.glb>');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(`${adventurers}/Characters/gltf/Knight.glb`);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const named = (name: string): Node => {
  const node = root.listNodes().find((candidate) => candidate.getName() === name);
  if (!node) throw new Error(`the Knight has no node named ${name}`);
  return node;
};

for (const [file, slot] of WEAPONS) {
  const source = await io.read(`${adventurers}/Assets/gltf/${file}.gltf`);
  const map = mergeDocuments(doc, source);
  const scene = map.get(source.getRoot().listScenes()[0]) as Scene;
  for (const child of scene.listChildren()) named(slot).addChild(child);
  scene.dispose();
}

for (const [name, [set, clip]] of Object.entries(CLIPS)) {
  const source = await io.read(`${animations}/Animations/gltf/Rig_Medium/Rig_Medium_${set}.glb`);
  const animation = source.getRoot().listAnimations().find((candidate) => candidate.getName() === clip);
  if (!animation) throw new Error(`Rig_Medium_${set} has no clip named ${clip}`);
  const copy = doc.createAnimation(name);
  const accessor = (from: Accessor) =>
    doc.createAccessor().setType(from.getType()).setArray(from.getArray()!.slice()).setBuffer(buffer);
  for (const channel of animation.listChannels()) {
    const from = channel.getSampler()!;
    const sampler = doc
      .createAnimationSampler()
      .setInput(accessor(from.getInput()!))
      .setOutput(accessor(from.getOutput()!))
      .setInterpolation(from.getInterpolation());
    copy
      .addSampler(sampler)
      .addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(named(channel.getTargetNode()!.getName()))
          .setTargetPath(channel.getTargetPath()!)
          .setSampler(sampler),
      );
  }
}

// The Knight's nine body meshes share one skin, one material and identity transforms (skinned vertices live in
// bind space), so they join into one: a pawn is then three draw calls (body, sword, shield), not eleven.
// gltf-transform's join() leaves skinned meshes alone, hence the explicit joinPrimitives.
const body = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
const joined = joinPrimitives(body.map((node) => node.getMesh()!.listPrimitives()[0]));
body[0].setName('Knight_Joined').setMesh(doc.createMesh('Knight').addPrimitive(joined));
for (const node of body.slice(1)) node.dispose();
await doc.transform(dedup(), prune(), unpartition());

const textures = root.listTextures();
if (textures.length !== 1) throw new Error(`expected the one shared atlas, found ${textures.length} textures`);
const { data, info } = await sharp(Buffer.from(textures[0].getImage()!)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cellW = info.width / 8;
const cellH = info.height / 4;
for (const [cx, cy] of RED_CELLS) {
  const pixels: number[] = [];
  for (let y = cy * cellH; y < (cy + 1) * cellH; y++) for (let x = cx * cellW; x < (cx + 1) * cellW; x++) pixels.push((y * info.width + x) * 4);
  const light = (i: number) => Math.max(data[i], data[i + 1], data[i + 2]);
  const lo = Math.min(...pixels.map(light));
  const hi = Math.max(...pixels.map(light));
  for (const i of pixels) {
    // keep the swatch's gradient, but no darker than 0.65, so the shader's magenta test still keys it
    const level = Math.round(255 * (0.65 + (0.35 * (light(i) - lo)) / Math.max(1, hi - lo)));
    data[i] = level;
    data[i + 1] = 0;
    data[i + 2] = level;
  }
}
textures[0].setImage(new Uint8Array(await sharp(data, { raw: info }).png().toBuffer()));

await io.write(out, doc);
console.log(`wrote ${out}: ${root.listAnimations().map((a) => a.getName()).join(', ')}`);
