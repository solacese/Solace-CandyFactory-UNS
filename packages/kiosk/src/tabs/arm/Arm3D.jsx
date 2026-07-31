import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Arm3D — a real WebGL articulated 6-DoF robot arm.
 *
 * Props:
 *   angles: number[6]  — [base, shoulder, elbow, wristPitch, wristRoll, gripper] in degrees
 *   gripperState: 'open' | 'closed'
 *   active: boolean    — true while the arm is executing a move
 *   binColors: string[] — 4 colors for the source bins
 *   heldColor: string | null — color of the gummy currently held in the gripper
 */

const DEG = Math.PI / 180;
const ACCENT = '#00c895';
const ACCENT_SOFT = '#5eead4';
const METAL = '#4bbf9a'; // teal-green "metal" links — solid against light floor

function lerpAngle(current, target, t) {
  return current + (target - current) * t;
}

/** Smoothly eases a group's rotation on a given axis toward the target angle. */
function useSmoothRotation(ref, axis, targetDeg, speed = 0.14) {
  useFrame(() => {
    if (!ref.current) return;
    const target = (targetDeg || 0) * DEG;
    ref.current.rotation[axis] = lerpAngle(ref.current.rotation[axis], target, speed);
  });
}

function Link({ length, radius = 0.16, color = METAL }) {
  // A capsule-ish link drawn from origin upward along +Y
  return (
    <mesh position={[0, length / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius * 0.9, length, 24]} />
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.35} />
    </mesh>
  );
}

function Joint({ radius = 0.2, color = ACCENT }) {
  return (
    <mesh castShadow>
      <sphereGeometry args={[radius, 24, 24]} />
      <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

function Gummy({ color }) {
  if (!color) return null;
  return (
    <mesh position={[0, -0.28, 0]} castShadow>
      <sphereGeometry args={[0.13, 20, 20]} />
      <meshStandardMaterial color={color} roughness={0.2} metalness={0.05} emissive={color} emissiveIntensity={0.12} />
    </mesh>
  );
}

function Gripper({ gripperState, heldColor }) {
  const leftRef = useRef();
  const rightRef = useRef();
  const spread = gripperState === 'closed' ? 0.08 : 0.22;

  useFrame(() => {
    if (leftRef.current) leftRef.current.position.x = lerpAngle(leftRef.current.position.x, -spread, 0.2);
    if (rightRef.current) rightRef.current.position.x = lerpAngle(rightRef.current.position.x, spread, 0.2);
  });

  return (
    <group>
      {/* wrist plate */}
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.1, 20]} />
        <meshStandardMaterial color={ACCENT} metalness={0.4} roughness={0.3} />
      </mesh>
      {/* fingers */}
      <group ref={leftRef} position={[-spread, -0.22, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.06, 0.34, 0.12]} />
          <meshStandardMaterial color={METAL} metalness={0.3} roughness={0.4} />
        </mesh>
      </group>
      <group ref={rightRef} position={[spread, -0.22, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.06, 0.34, 0.12]} />
          <meshStandardMaterial color={METAL} metalness={0.3} roughness={0.4} />
        </mesh>
      </group>
      <Gummy color={heldColor} />
    </group>
  );
}

function ArmModel({ angles, gripperState, heldColor }) {
  const [base, shoulder, elbow, wristPitch, wristRoll] = angles;

  const baseRef = useRef();
  const shoulderRef = useRef();
  const elbowRef = useRef();
  const wristPitchRef = useRef();
  const wristRollRef = useRef();

  // Map joint degrees onto sensible 3D axes
  useSmoothRotation(baseRef, 'y', base);
  useSmoothRotation(shoulderRef, 'z', shoulder);
  useSmoothRotation(elbowRef, 'z', -elbow);
  useSmoothRotation(wristPitchRef, 'z', wristPitch);
  useSmoothRotation(wristRollRef, 'y', wristRoll);

  return (
    <group position={[0, -1.0, 0]}>
      {/* Pedestal */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.7, 0.2, 40]} />
        <meshStandardMaterial color="#ffffff" metalness={0.2} roughness={0.5} />
      </mesh>

      {/* Rotating base */}
      <group ref={baseRef} position={[0, 0.22, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.32, 0.4, 0.34, 32]} />
          <meshStandardMaterial color={ACCENT_SOFT} metalness={0.3} roughness={0.4} />
        </mesh>

        {/* Shoulder */}
        <group position={[0, 0.3, 0]}>
          <Joint radius={0.22} />
          <group ref={shoulderRef}>
            <Link length={1.1} />
            {/* Elbow */}
            <group position={[0, 1.1, 0]}>
              <Joint radius={0.18} />
              <group ref={elbowRef}>
                <Link length={0.9} radius={0.13} />
                {/* Wrist pitch */}
                <group position={[0, 0.9, 0]}>
                  <Joint radius={0.14} color={ACCENT_SOFT} />
                  <group ref={wristPitchRef}>
                    <Link length={0.4} radius={0.1} />
                    {/* Wrist roll + gripper */}
                    <group position={[0, 0.4, 0]} ref={wristRollRef}>
                      <Gripper gripperState={gripperState} heldColor={heldColor} />
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

function Bins({ colors }) {
  // Four source bins arranged in an arc in front of the arm
  const positions = [
    [-1.9, -1.0, 1.3],
    [-0.65, -1.0, 1.9],
    [0.65, -1.0, 1.9],
    [1.9, -1.0, 1.3],
  ];
  return (
    <>
      {positions.map((p, i) => (
        <group key={i} position={p}>
          <RoundedBox args={[0.7, 0.35, 0.7]} radius={0.06} smoothness={4} castShadow receiveShadow>
            <meshStandardMaterial color={colors[i] || ACCENT} metalness={0.1} roughness={0.6} transparent opacity={0.85} />
          </RoundedBox>
          {/* little cluster of gummies in the bin */}
          {[[-0.15, 0.22, 0.1], [0.12, 0.2, -0.1], [0, 0.24, 0.15]].map((g, j) => (
            <mesh key={j} position={[p ? g[0] : 0, g[1], g[2]]} castShadow>
              <sphereGeometry args={[0.09, 16, 16]} />
              <meshStandardMaterial color={colors[i] || ACCENT} roughness={0.2} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

export default function Arm3D({ angles, gripperState = 'open', active = false, binColors = [], heldColor = null }) {
  const safeAngles = useMemo(
    () => (Array.isArray(angles) && angles.length >= 5 ? angles : [0, -30, 45, 0, 0, 0]),
    [angles]
  );

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [3.2, 2.2, 4.2], fov: 42 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#f0fdf9']} />
      <fog attach="fog" args={['#f0fdf9', 8, 16]} />

      {/* Self-contained lighting — no CDN/HDR dependency (booth runs offline) */}
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#ffffff', '#bbf7d0', 0.6]} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3, 2, -2]} intensity={0.45} color={ACCENT_SOFT} />
      <pointLight position={[0, 3, 2]} intensity={0.5} color="#ffffff" />

      <ArmModel angles={safeAngles} gripperState={gripperState} heldColor={heldColor} />
      <Bins colors={binColors} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.02, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#dcfce7" roughness={0.9} />
      </mesh>
      <ContactShadows position={[0, -1.0, 0]} opacity={0.35} scale={10} blur={2.2} far={4} color={ACCENT} />

      <OrbitControls
        enablePan={false}
        minDistance={3.5}
        maxDistance={8}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate={!active}
        autoRotateSpeed={0.6}
        target={[0, 0.3, 0]}
      />
    </Canvas>
  );
}
