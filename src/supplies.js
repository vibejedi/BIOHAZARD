export function supplyPosition(data) {
  const start = data.playerSpawn;
  return data.nodes.find(p => Math.hypot(p[0] - start[0], p[2] - start[2]) > 2.3 && Math.hypot(p[0] - start[0], p[2] - start[2]) < 3.3 && Math.abs(p[1] - start[1]) < 0.5) || start;
}
