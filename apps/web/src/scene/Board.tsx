import { RoundedBox } from '@react-three/drei';
import { isDark, SQUARES, squareToWorld } from '@/game/squares';
import { useGame } from '@/state/store';
import { PALETTE } from './theme';

export function Board() {
  const select = useGame((s) => s.select);
  const selected = useGame((s) => s.selected);
  const targets = useGame((s) => s.targets);
  const lastMove = useGame((s) => s.lastMove);
  const checked = useGame((s) =>
    s.inCheck ? (s.pieces.find((p) => p.type === 'k' && p.color === s.turn)?.square ?? null) : null,
  );

  return (
    <group>
      <RoundedBox args={[8.6, 0.4, 8.6]} radius={0.08} position={[0, -0.3, 0]} receiveShadow>
        <meshStandardMaterial color={PALETTE.base} roughness={0.7} />
      </RoundedBox>

      {SQUARES.map((square) => {
        const { x, z } = squareToWorld(square);
        const dark = isDark(square);
        const color =
          square === checked
            ? PALETTE.check
            : square === selected
              ? PALETTE.selected
              : square === lastMove?.from || square === lastMove?.to
                ? PALETTE.lastMove
                : dark
                  ? PALETTE.darkTile
                  : PALETTE.lightTile;
        return (
          // tile tops sit at y = 0 (light) and y = -0.02 (dark) so the seams catch the light
          <RoundedBox
            key={square}
            args={[0.98, 0.12, 0.98]}
            radius={0.02}
            position={[x, dark ? -0.08 : -0.06, z]}
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              select(square);
            }}
          >
            <meshStandardMaterial color={color} roughness={dark ? 0.85 : 0.5} />
          </RoundedBox>
        );
      })}

      {targets.map((move) => {
        const { x, z } = squareToWorld(move.to);
        return (
          // a ring marks a capture, a dot marks a quiet move; promotions list one move per piece
          <mesh key={move.san} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
            {move.captured ? <ringGeometry args={[0.36, 0.44, 24]} /> : <circleGeometry args={[0.14, 20]} />}
            <meshBasicMaterial color={PALETTE.marker} transparent opacity={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}
