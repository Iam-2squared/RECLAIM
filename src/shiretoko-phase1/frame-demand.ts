/** Camera invalidation for the existing frozen-water review mode.
 * Physics/input keep advancing; only identical visual submissions are omitted.
 */
type CameraPose = {
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  fov: number;
  aspect: number;
};
export class TerrainFrameDemand {
  private readonly last = new Float64Array(9).fill(NaN);
  changed(camera: CameraPose): boolean {
    const p = camera.position, q = camera.quaternion, a = this.last;
    return p.x !== a[0] || p.y !== a[1] || p.z !== a[2] ||
      q.x !== a[3] || q.y !== a[4] || q.z !== a[5] || q.w !== a[6] ||
      camera.fov !== a[7] || camera.aspect !== a[8];
  }
  submitted(camera: CameraPose): void {
    const p = camera.position, q = camera.quaternion, a = this.last;
    a[0] = p.x; a[1] = p.y; a[2] = p.z;
    a[3] = q.x; a[4] = q.y; a[5] = q.z; a[6] = q.w;
    a[7] = camera.fov; a[8] = camera.aspect;
  }
}
