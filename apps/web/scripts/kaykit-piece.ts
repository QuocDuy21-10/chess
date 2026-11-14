import { NodeIO, type Accessor, type Node, type Scene } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, joinPrimitives, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';

// node scripts/kaykit-piece.ts <KayKit_Adventurers_2.0_FREE dir> <KayKit_Character_Animations_1.1 dir> <out dir>
// Builds every piece from KayKit's CC0 packs into <out dir>/<piece>.glb: a character holding its weapons, its
// cloth repainted magenta for GlbPiece's team recolour, and four clips copied in from the animation sets.
// The animation sets share the characters' skeleton (Rig_Medium), so channels bind by node name.

type Clip = readonly [set: string, name: string];
interface Piece {
  character: string;
  weapons: readonly (readonly [file: string, slot: 'handslot.r' | 'handslot.l'])[];
  clips: { idle: Clip; walk: Clip; attack: Clip; die: Clip };
  cloth: readonly (readonly [column: number, row: number])[]; // swatches of the 8 × 4 atlas that take the team colour
}

const IDLE: Clip = ['General', 'Idle_A'];
const WALK: Clip = ['MovementBasic', 'Walking_A'];
const PIECES: Record<string, Piece> = {
  pawn: {
    character: 'Knight',
    weapons: [['sword_1handed', 'handslot.r'], ['shield_badge_color', 'handslot.l']],
    clips: { idle: IDLE, walk: WALK, attack: ['CombatMelee', 'Melee_1H_Attack_Chop'], die: ['General', 'Death_A'] },
    cloth: [[0, 1], [2, 2]],
  },
  knight: {
    character: 'Ranger',
    weapons: [['bow', 'handslot.l']],
    clips: { idle: IDLE, walk: WALK, attack: ['CombatRanged', 'Ranged_Bow_Release'], die: ['General', 'Death_B'] },
    cloth: [[0, 1]],
  },
  bishop: {
    character: 'Mage',
    weapons: [['staff', 'handslot.r']],
    clips: { idle: IDLE, walk: WALK, attack: ['CombatRanged', 'Ranged_Magic_Shoot'], die: ['General', 'Death_A'] },
    cloth: [[0, 1], [1, 1], [2, 1]], // robe and hat (one two-column swatch), and the cape
  },
  rook: {
    character: 'Rogue_Hooded',
    weapons: [['dagger', 'handslot.r']],
    clips: { idle: IDLE, walk: WALK, attack: ['CombatMelee', 'Melee_1H_Attack_Stab'], die: ['General', 'Death_B'] },
    cloth: [[0, 1], [1, 1]],
  },
  queen: {
    character: 'Rogue',
    weapons: [['crossbow_1handed', 'handslot.r']],
    clips: { idle: IDLE, walk: WALK, attack: ['CombatRanged', 'Ranged_1H_Shoot'], die: ['General', 'Death_A'] },
    cloth: [[0, 1], [1, 1]],
  },
  king: {
    character: 'Barbarian',
    weapons: [['axe_1handed', 'handslot.r'], ['shield_round_barbarian', 'handslot.l']],
    clips: { idle: IDLE, walk: WALK, attack: ['CombatMelee', 'Melee_1H_Attack_Chop'], die: ['General', 'Death_A'] },
    cloth: [[2, 1], [7, 0]], // the kilt, and the bear pelt over the head and shoulders
  },
};

const [adventurers, animations, outDir] = process.argv.slice(2);
if (!outDir) throw new Error('usage: node scripts/kaykit-piece.ts <adventurers dir> <animations dir> <out dir>');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const [piece, { character, weapons, clips, cloth }] of Object.entries(PIECES)) {
  const doc = await io.read(`${adventurers}/Characters/gltf/${character}.glb`);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const named = (name: string): Node => {
    const node = root.listNodes().find((candidate) => candidate.getName() === name);
    if (!node) throw new Error(`${character} has no node named ${name}`);
    return node;
  };

  for (const [file, slot] of weapons) {
    const source = await io.read(`${adventurers}/Assets/gltf/${file}.gltf`);
    const map = mergeDocuments(doc, source);
    const scene = map.get(source.getRoot().listScenes()[0]) as Scene;
    for (const child of scene.listChildren()) named(slot).addChild(child);
    scene.dispose();
  }

  for (const [name, [set, clip]] of Object.entries(clips)) {
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

  // The body meshes share one skin, one material and identity transforms (skinned vertices live in bind space),
  // so they join into one: a piece is then one draw call per weapon plus one. join() leaves skinned meshes alone.
  const body = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
  const prims = body.map((node) => node.getMesh()!.listPrimitives()[0]);
  if (new Set(prims.map((prim) => prim.getMaterial())).size !== 1) throw new Error(`${character}: body meshes differ in material`);
  body[0].setName(`${character}_Joined`).setMesh(doc.createMesh(character).addPrimitive(joinPrimitives(prims)));
  for (const node of body.slice(1)) node.dispose();
  await doc.transform(dedup(), prune(), unpartition());

  const textures = root.listTextures();
  if (textures.length !== 1) throw new Error(`${character}: expected one shared atlas, found ${textures.length} textures`);
  const { data, info } = await sharp(Buffer.from(textures[0].getImage()!)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cellW = info.width / 8;
  const cellH = info.height / 4;
  for (const [cx, cy] of cloth) {
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

  await io.write(`${outDir}/${piece}.glb`, doc);
  console.log(`wrote ${outDir}/${piece}.glb (${character}): ${root.listAnimations().map((a) => a.getName()).join(', ')}`);
}
